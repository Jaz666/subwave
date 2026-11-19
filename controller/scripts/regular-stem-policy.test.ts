import assert from 'node:assert/strict';
import test from 'node:test';
import { eightBarWindow, regularStemPairDecision, regularStemTempoDecision, regularStemWorkingIds } from '../src/broadcast/regular-stem-policy.js';
import type { BeatGridProvenance } from '../src/schemas/beat-grid.js';

const tempoGrid = (medianBpm: number): BeatGridProvenance => ({
  version: 1, backend: 'beat-this-onnx', model: 'small0', modelSha256: 'a'.repeat(64),
  preprocessingVersion: 1, windowStartMs: 0, windowEndMs: 60_000,
  evidence: { medianBpm, intervalSupport: 1, librosaBeatSupport: null },
});

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

test('tempo gate uses the three-percent vanilla tolerance and checks half/double time', () => {
  assert.equal(regularStemTempoDecision(tempoGrid(100), tempoGrid(102.9)).eligible, true);
  assert.equal(regularStemTempoDecision(tempoGrid(100), tempoGrid(140)).eligible, false);
  assert.equal(regularStemTempoDecision(tempoGrid(70), tempoGrid(140)).eligible, true);
  assert.equal(regularStemTempoDecision(null, tempoGrid(100)).eligible, false);
});
