import assert from 'node:assert/strict';
import test from 'node:test';
import { regularStemNeeds, type RegularStemQueueEvidence } from '../src/broadcast/regular-stem-needs.js';
import type { BeatGridProvenance } from '../src/schemas/beat-grid.js';
const grid = (start: number, end: number): BeatGridProvenance => ({ version: 1,
  backend: 'beat-this-onnx', model: 'small0', modelSha256: 'a'.repeat(64), preprocessingVersion: 1,
  windowStartMs: start, windowEndMs: end,
  evidence: { medianBpm: 100, intervalSupport: 1, librosaBeatSupport: null },
  source: { sha256: 'b'.repeat(64), bytes: 12345, complete: true } });
const track = (id: string): RegularStemQueueEvidence => ({ id, sent: false, remainingSec: 180,
  regularEligible: true, pairToNextAllowed: true, durationMs: 240000, windDownMs: 235000,
  bars: Array.from({length: 12}, (_, i) => 1000 + i*2000),
  tailBars: Array.from({length: 12}, (_, i) => 200000 + i*3000),
  headGrid: grid(0, 40000), tailGrid: grid(190000, 240000) });

test('only actual adjacent pairs request eight-bar tail/head windows before the deadline', () => {
  const needs = regularStemNeeds([track('a'), track('b')], 1000);
  assert.deepEqual(needs.map(n => [n.trackId,n.side,n.startMs,n.endMs]),
    [['a','tail',209000,233000],['b','head',1000,25000]]);
  assert.equal(needs[0].deadlineMs,126000);
  assert.deepEqual(regularStemNeeds([track('alone')],0),[],'a lone track starts no speculative separation');
  const next = regularStemNeeds([track('a'),track('b'),track('c')],0);
  assert.deepEqual(next.map(n => [n.trackId,n.side]),[['a','tail'],['b','head'],['b','tail'],['c','head']]);
});

test('dance discovery does not affect independent regular extraction', () => {
  const dance = {...track('dance'),subbeatsEligible:true};
  const regular = track('regular');
  for (const pair of [[dance,regular],[regular,dance]]) {
    assert.deepEqual(regularStemNeeds(pair,0).map(n=>[n.trackId,n.side]),
      [[pair[0].id,'tail'],[pair[1].id,'head']]);
  }
});

test('sent, rejected, unknown-clock, short-deadline and unproven roles never request extraction', () => {
  for (const changes of [{sent:true},{remainingSec:null},{remainingSec:45},{pairToNextAllowed:false},
    {regularEligible:false},{tailGrid:null}]) {
    assert.deepEqual(regularStemNeeds([{...track('a'),...changes},track('b')],0),[]);
  }
  const incomplete = {...grid(0,40000),source:{sha256:'b'.repeat(64),bytes:12345,complete:false}};
  const needs = regularStemNeeds([track('a'),{...track('b'),headGrid:incomplete}],0);
  assert.deepEqual(needs.map(n=>n.side),['tail'],'invalid incoming coverage cannot become an extracted head');
});

test('recording or grid replacement changes identity; queue clocks and display names do not', () => {
  const first = regularStemNeeds([track('a'),track('b')],0)[0];
  const renamed = regularStemNeeds([{...track('a'),remainingSec:160,label:'Title — Artist'},track('b')],100)[0];
  assert.equal(renamed.key,first.key);
  assert.equal(renamed.label,'Title — Artist');
  const changed = track('a');
  changed.tailGrid = {...changed.tailGrid!,source:{sha256:'c'.repeat(64),bytes:12345,complete:true}};
  assert.notEqual(regularStemNeeds([changed,track('b')],0)[0].key,first.key);
});

test('eight-bar windows stay inside actual coverage and extend the incoming window only when covered', () => {
  const outgoing = {...track('a'),tailGrid:grid(190000,232999)};
  assert.equal(regularStemNeeds([outgoing,track('b')],0)[0].endMs,230000,
    'an earlier full span replaces a last marker outside measured coverage');
  assert.deepEqual(regularStemNeeds([track('a'),{...track('b'),headGrid:grid(0,24999)}],0).map(n=>n.side),
    ['tail'],'the incoming head must cover the full outgoing duration');
});

test('pending role grids defer their seam while later eligible pairs remain independent', () => {
  const needs=regularStemNeeds([{...track('a'),tailGridPending:true},track('b'),track('c')],0);
  assert.deepEqual(needs.map(n=>[n.trackId,n.side]),[['b','tail'],['c','head']]);
  assert.deepEqual(regularStemNeeds([track('a'),{...track('b'),headGridPending:true}],0),[]);
});
