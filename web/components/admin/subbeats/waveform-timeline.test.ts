import assert from 'node:assert/strict';
import test from 'node:test';
import type { StationState } from '../../../lib/types';
import { queuedTransition, shouldAutoExpandStemPreview, stemTransitionWindow, waveformSnapPosition } from './waveform-timeline';

test('Auto preview opens 20 seconds before the planned window and closes after it ends', () => {
  assert.equal(shouldAutoExpandStemPreview(80_000, 100_000, 30), true);
  assert.equal(shouldAutoExpandStemPreview(79_999, 100_000, 30), false);
  assert.equal(shouldAutoExpandStemPreview(130_000, 100_000, 30), false);
  assert.equal(shouldAutoExpandStemPreview(80_000, undefined, 30), false);
});

test('waveform stays still as the marker travels from 25% to 75%, then snaps every 30 seconds', () => {
  assert.deepEqual(waveformSnapPosition(0), { snappedSeconds: 0, playheadPercent: 25 });
  assert.deepEqual(waveformSnapPosition(15), { snappedSeconds: 0, playheadPercent: 50 });
  assert.ok(waveformSnapPosition(29.999).playheadPercent > 74.99);
  assert.equal(waveformSnapPosition(29.999).snappedSeconds, 0);
  assert.deepEqual(waveformSnapPosition(30), { snappedSeconds: 30, playheadPercent: 25 });
  assert.deepEqual(waveformSnapPosition(45), { snappedSeconds: 30, playheadPercent: 50 });
  assert.deepEqual(waveformSnapPosition(60), { snappedSeconds: 60, playheadPercent: 25 });
  assert.deepEqual(waveformSnapPosition(-0.25), { snappedSeconds: 0, playheadPercent: 25 });
});

test('snapping keeps the marker on the source waveform across screen sizes, history, and sync offsets', () => {
  for (const width of [360, 768, 1440]) {
    const pxPerSec = width / 60;
    const padding = width / 2;
    const origin = padding + 15 * pxPerSec;
    for (const history of [0, 285.2]) {
      for (const elapsed of [0, 15, 29.75, 30, 59.75, 60, 240.25]) {
        for (const syncOffset of [-0.25, 0, 0.25]) {
          const displayed = Math.max(0, elapsed + syncOffset);
          const { snappedSeconds, playheadPercent } = waveformSnapPosition(displayed);
          const scroll = padding + (history + snappedSeconds) * pxPerSec;
          const sourcePosition = origin + (history + displayed) * pxPerSec - scroll;
          assert.ok(Math.abs(sourcePosition - width * playheadPercent / 100) < 1e-8);
        }
      }
    }
  }
});

const forecast = '2026-11-10T16:00:00Z';
const queue = (patch: Partial<StationState> = {}): StationState => ({
  current: { subsonic_id: 'out' },
  upcoming: [{ subsonic_id: 'in', airsAt: forecast }],
  history: [],
  ...patch,
});

test('the Sub/Beats bar straddles incoming entry instead of ending there', () => {
  const meta = { kind: 'subbeats' as const, durationSec: 39, incomingAtSec: 4, incomingAiredAt: forecast };
  const entryAt = Date.parse(forecast) + 22_000;
  assert.deepEqual(stemTransitionWindow(meta, undefined, 22_000), {
    startAt: entryAt - 4000, endAt: entryAt + 35_000,
  });
  assert.deepEqual(stemTransitionWindow(meta, entryAt + 500_000, 22_000),
    stemTransitionWindow(meta, undefined, 22_000), 'actual clip timing survives a change to the next queued forecast');
});

test('ordinary stem estimates retain their native-resume forecast and unknown timing stays unknown', () => {
  const meta = { kind: 'stem-blend' as const, durationSec: 30, incomingAtSec: 15 };
  assert.deepEqual(stemTransitionWindow(meta, 100_000, 22_000), { startAt: 70_000, endAt: 100_000 });
  assert.equal(stemTransitionWindow(meta, undefined, 0), null);
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
