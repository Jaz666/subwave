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
  regularEligible: true, subbeatsEligible: false, durationMs: 240000, windDownMs: 235000,
  bars: Array.from({length: 12}, (_, i) => 1000 + i*2000),
  tailBars: Array.from({length: 12}, (_, i) => 200000 + i*3000),
  headGrid: grid(0, 40000), tailGrid: grid(190000, 240000) });

test('each eligible track requests its full measured head and tail windows', () => {
  const needs = regularStemNeeds([track('a'), track('b')], 1000);
  assert.deepEqual(needs.map(n => [n.trackId,n.side,n.startMs,n.endMs]),
    [['a','tail',190000,239999],['a','head',0,39999],
      ['b','tail',190000,239999],['b','head',0,39999]]);
  assert.equal(needs[0].deadlineMs, 126000);
});
test('Sub/Beats reservation skips the dance track while regular roles prepare independently', () => {
  const needs = regularStemNeeds([{...track('dance'),subbeatsEligible:true},track('regular')], 0);
  assert.deepEqual(needs.map(n=>[n.trackId,n.side]), [['regular','tail'],['regular','head']]);
});
test('sent, unknown-clock, empty coverage and unproven recordings never request extraction', () => {
  for (const changes of [{sent:true}, {remainingSec:null}, {remainingSec:45}, {headGrid:null,tailGrid:null}]) {
    assert.deepEqual(regularStemNeeds([{...track('a'),...changes}],0), []);
  }
  const incoming = {...track('b'), headGrid:grid(0,0)};
  assert.equal(regularStemNeeds([incoming],0).some(n=>n.side==='head'),false);
  assert.deepEqual(regularStemNeeds([{...track('a'),tailGrid:null}],0).map(n=>n.side), ['head']);
  const unproven = {...grid(0,40000),source:{sha256:'b'.repeat(64),bytes:12345,complete:false}};
  assert.deepEqual(regularStemNeeds([{...track('a'),headGrid:unproven,tailGrid:null}],0), []);
});
test('recording or grid replacement changes identity; queue clocks do not', () => {
  const first = regularStemNeeds([track('a')],0)[0];
  assert.equal(regularStemNeeds([{...track('a'),remainingSec:160}],100)[0].key,first.key);
  const renamed = regularStemNeeds([{...track('a'),label:'Title — Artist'}],0)[0];
  assert.equal(renamed.key,first.key,'display names never invalidate extracted audio');
  assert.equal(renamed.label,'Title — Artist');
  const changed = track('a');
  changed.tailGrid = {...changed.tailGrid!,source:{sha256:'c'.repeat(64),bytes:12345,complete:true}};
  assert.notEqual(regularStemNeeds([changed],0)[0].key,first.key);
});

test('rounded EOF stays inside the measured recording without padding missing samples', () => {
  const item = {...track('electric-lady'), durationMs:309000, tailGrid:grid(288987,308987)};
  const tail = regularStemNeeds([item],0).find(n=>n.side==='tail')!;
  const decodedEndMs = 308986 + 2/3;
  assert.equal(tail.endMs,308986);
  assert.ok(tail.endMs < decodedEndMs, 'the millisecond grid stamp rounded past the exact decoded EOF');
  assert.equal(regularStemNeeds([{...item,durationMs:308000}],0)[0].endMs,308000,
    'a shorter known duration still bounds the request');
});
