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
    [['a','tail',190000,240000],['a','head',0,40000],
      ['b','tail',190000,240000],['b','head',0,40000]]);
  assert.equal(needs[0].deadlineMs, 126000);
});
test('crossover rejects only the pair head and keeps the regular incoming tail', () => {
  const needs = regularStemNeeds([{...track('dance'),subbeatsEligible:true},track('regular')], 0);
  assert.deepEqual(needs.map(n=>[n.trackId,n.side]), [['regular','tail']]);
});
test('sent, unknown-clock, empty coverage and unproven recordings never request extraction', () => {
  for (const changes of [{sent:true}, {remainingSec:null}, {remainingSec:45}, {tailGrid:null}]) {
    assert.deepEqual(regularStemNeeds([{...track('a'),...changes}],0), []);
  }
  const incoming = {...track('b'), headGrid:grid(0,0)};
  assert.equal(regularStemNeeds([track('a'),incoming],0).some(n=>n.side==='head'),false);
});
test('recording or grid replacement changes identity; queue clocks do not', () => {
  const first = regularStemNeeds([track('a')],0)[0];
  assert.equal(regularStemNeeds([{...track('a'),remainingSec:160}],100)[0].key,first.key);
  const changed = track('a');
  changed.tailGrid = {...changed.tailGrid!,source:{sha256:'c'.repeat(64),bytes:12345,complete:true}};
  assert.notEqual(regularStemNeeds([changed],0)[0].key,first.key);
});
