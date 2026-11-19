import assert from 'node:assert/strict';
import test from 'node:test';
import { eightBarWindow, regularStemPairDecision, regularStemWorkingIds, regularStemTempoDecision } from '../src/broadcast/regular-stem-policy.js';

test('tail searches earlier eight-bar spans before wind-down; head chooses first covered span', () => {
  const bars = Array.from({ length: 12 }, (_, i) => 1000 + i * 4000);
  assert.deepEqual(eightBarWindow(bars, { startMs: 0, endMs: 42000 }, 'tail'), { startMs: 9000, endMs: 41000 });
  assert.deepEqual(eightBarWindow(bars, { startMs: 2000, endMs: 42000 }, 'head'), { startMs: 5000, endMs: 37000 });
  assert.equal(eightBarWindow(bars, { startMs: 10000, endMs: 42000 }, 'tail'), null);
});

test('slow spans remain measured, malformed evidence fails closed', () => {
  const bars = Array.from({ length: 9 }, (_, i) => i * 6000);
  assert.deepEqual(eightBarWindow(bars, { startMs: 0, endMs: 50000 }, 'head'), { startMs: 0, endMs: 48000 });
  for (const bad of [bars.slice(1), [...bars.slice(0, 8), NaN], [...bars.slice(0, 8), 0]]) {
    assert.equal(eightBarWindow(bad, { startMs: 0, endMs: 50000 }, 'head'), null);
  }
});

test('Sub/Beats reservations exclude crossovers in both directions and both-dance pairs', () => {
  const regular = { regularEligible: true, subbeatsEligible: false };
  const dance = { regularEligible: true, subbeatsEligible: true };
  assert.deepEqual(regularStemPairDecision(regular, regular), { eligible: true });
  for (const [out, incoming] of [[regular, dance], [dance, regular], [dance, dance]]) {
    assert.deepEqual(regularStemPairDecision(out, incoming), { eligible: false, reason: 'subbeats-reserved' });
  }
  assert.equal(regularStemPairDecision(regular, { ...regular, regularEligible: false }).eligible, false);
});

test('working set follows current plus eight queued tracks without historical retention', () => {
  const queued = Array.from({ length: 8 }, (_, i) => `q${i}`);
  assert.equal(regularStemWorkingIds('current', queued).size, 9);
  assert.deepEqual([...regularStemWorkingIds('q0', queued.slice(1))], queued);
  assert.equal(regularStemWorkingIds('q0', queued).size, 8);
  assert.throws(() => regularStemWorkingIds('current', [...queued, 'extra']), /eight queued/);
});


test('regular tempo uses current shared grids, keeps octave folding and rejects missing evidence', () => {
  const grid = (medianBpm: number | null) => ({version:1 as const,backend:'beat-this-onnx' as const,
    model:'small0' as const,modelSha256:'a'.repeat(64),preprocessingVersion:1 as const,
    windowStartMs:0,windowEndMs:60000,evidence:{medianBpm,intervalSupport:null,librosaBeatSupport:null}});
  for(const incoming of [80,160,40,82]) assert.equal(regularStemTempoDecision(grid(80),grid(incoming)).eligible,true);
  assert.match(regularStemTempoDecision(grid(80),grid(83)).reason!,/tempo incompatible.*80 BPM.*83 BPM/);
  for(const missing of [null,undefined,grid(null),grid(0),grid(NaN),grid(Infinity),{...grid(80),model:'custom' as const}]) {
    assert.equal(regularStemTempoDecision(missing,grid(80)).eligible,false);
    assert.equal(regularStemTempoDecision(grid(80),missing).eligible,false);
    assert.match(regularStemTempoDecision(grid(80),missing).reason!,/shared beat grid BPM missing/);
  }
});
