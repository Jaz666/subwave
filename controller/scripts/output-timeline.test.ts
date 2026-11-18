import assert from 'node:assert/strict';
import test from 'node:test';
import { outputStartedAt } from '../src/broadcast/output-timeline.js';

test('accepts the final-mix timestamp for the just-published track', () => {
  assert.equal(outputStartedAt(
    { subsonic_id: 'track-a', timestamp: 1_700_000_000 },
    { subsonic_id: 'track-a', startedAtMs: 1_700_000_001_250 },
  ), 1_700_000_001_250);
});

test('rejects a stale or unrelated output timestamp', () => {
  const track = { subsonic_id: 'track-a', timestamp: 1_700_000_000 };
  assert.equal(outputStartedAt(track, { subsonic_id: 'track-b', startedAtMs: 1_700_000_000_250 }), undefined);
  assert.equal(outputStartedAt(track, { subsonic_id: 'track-a', startedAtMs: 1_700_000_006_000 }), undefined);
  assert.equal(outputStartedAt(track, { subsonic_id: 'track-a', startedAtMs: NaN }), undefined);
});
