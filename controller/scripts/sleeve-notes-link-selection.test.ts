import assert from 'node:assert/strict';
import test from 'node:test';
import {
  selectMostSpecificEligibleClaim,
  type SleeveNoteRecentUse,
  type SleeveNoteSelectionCandidate,
} from '../src/sleeve-notes/link-selection.js';

const now = Date.parse('2026-09-28T12:00:00.000Z');

function candidate(overrides: Partial<SleeveNoteSelectionCandidate> = {}): SleeveNoteSelectionCandidate {
  return {
    claimId: 'claim-1', entityType: 'artist', entityId: 'artist-1',
    category: 'artist-stories', topic: 'studio decision',
    wording: 'The artist made a distinctive studio decision.',
    provider: 'wikipedia', attribution: 'Wikipedia', sourceUrl: 'https://example.test/source',
    relationshipKey: null, localTrackId: 'local-1', sourceContent: '', evidence: 'quoted source evidence',
    ...overrides,
  };
}

function use(overrides: Partial<SleeveNoteRecentUse> = {}): SleeveNoteRecentUse {
  return {
    claimId: 'used-claim', entityType: 'recording', entityId: 'recording-1',
    topic: 'a different topic', relationshipKey: null,
    suppliedAt: new Date(now - 1_000).toISOString(),
    ...overrides,
  };
}

test('prefers a recording story, then a release story, before an artist fallback', () => {
  const artist = candidate();
  const release = candidate({ claimId: 'release-claim', entityType: 'release', entityId: 'release-1', category: 'milestones' });
  const recording = candidate({ claimId: 'recording-claim', entityType: 'recording', entityId: 'recording-1', category: 'credits' });
  assert.equal(selectMostSpecificEligibleClaim([artist, release, recording], [], now)?.claimId, 'recording-claim');
  assert.equal(selectMostSpecificEligibleClaim([artist, release], [], now)?.claimId, 'release-claim');
});

test('avoids a recently supplied exact claim, topic, or entity', () => {
  const note = candidate({ entityType: 'recording', entityId: 'recording-1' });
  assert.equal(selectMostSpecificEligibleClaim([note], [use({ claimId: note.claimId })], now), null);
  assert.equal(selectMostSpecificEligibleClaim([note], [use({ entityId: note.entityId, topic: note.topic })], now), null);
  assert.equal(selectMostSpecificEligibleClaim([note], [use({ entityId: note.entityId })], now), null);
});

test('uses longer entity cooldowns for artist claims and suppresses either direction of a connection', () => {
  const artist = candidate({ entityType: 'artist', entityId: 'artist-1' });
  const recentArtistUse = use({ entityType: 'artist', entityId: 'artist-1', suppliedAt: new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString() });
  assert.equal(selectMostSpecificEligibleClaim([artist], [recentArtistUse], now), null);

  const relation = candidate({ entityType: 'recording', entityId: 'recording-2', relationshipKey: 'genius:10|genius:20' });
  const reverseUse = use({ relationshipKey: 'genius:10|genius:20' });
  assert.equal(selectMostSpecificEligibleClaim([relation], [reverseUse], now), null);
});

test('allows a claim again after its cooldown expires', () => {
  const note = candidate({ entityType: 'recording', entityId: 'recording-1' });
  const oldUse = use({ entityId: note.entityId, suppliedAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString() });
  assert.equal(selectMostSpecificEligibleClaim([note], [oldUse], now)?.claimId, note.claimId);
});
