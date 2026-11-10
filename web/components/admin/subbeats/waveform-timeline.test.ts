import assert from 'node:assert/strict';
import test from 'node:test';
import type { StationState } from '../../../lib/types';
import { queuedTransition } from './waveform-timeline';

const forecast = '2026-11-10T16:00:00Z';
const queue = (patch: Partial<StationState> = {}): StationState => ({
  current: { subsonic_id: 'out' },
  upcoming: [{ subsonic_id: 'in', airsAt: forecast }],
  history: [],
  ...patch,
});

test('transition forecast uses listener time and the controller-armed type', () => {
  assert.deepEqual(queuedTransition(queue({ nextTransition: 'Sub/Beats' }), 'out', 8000), {
    airedAt: Date.parse(forecast) + 8000, label: 'Sub/Beats', armed: true,
  });
});

test('an unarmed transition stays pending even when a proposed row has stem flags', () => {
  const state = queue({ upcoming: [{ subsonic_id: 'in', airsAt: forecast, stemSeam: true, subbeats: true, sent: false }] });
  assert.equal(queuedTransition(state, 'out', 0)?.label, 'Transition pending');
  assert.equal(queuedTransition(state, 'out', 0)?.armed, false);
});

test('a live-edge pair ahead of the audible track cannot mark the wrong transition', () => {
  assert.equal(queuedTransition(queue({ current: { subsonic_id: 'another' }, nextTransition: 'Normal' }), 'out', 0), null);
});

test('missing and invalid timing stays unknown rather than using a file-end guess', () => {
  for (const airsAt of [undefined, '', 'not a date']) {
    assert.equal(queuedTransition(queue({ upcoming: [{ subsonic_id: 'in', airsAt }] }), 'out', 0), null);
  }
  assert.equal(queuedTransition(queue({ upcoming: [] }), 'out', 0), null);
  assert.equal(queuedTransition(queue(), undefined, 0), null);
  assert.equal(queuedTransition(queue({ upcoming: [{ subsonic_id: 'out', airsAt: forecast }] }), 'out', 0), null);
});

test('older state without a current row can still show its published forecast', () => {
  assert.equal(queuedTransition(queue({ current: undefined, nextTransition: 'Stem blend' }), 'out', 0)?.label, 'Stem blend');
});
