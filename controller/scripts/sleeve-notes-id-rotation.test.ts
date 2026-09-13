import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { migrate } from '../src/sleeve-notes/db.js';
import { remapLocalTrackIdsInDatabase } from '../src/sleeve-notes/repository.js';

test('Sleeve Notes remaps all stored Navidrome track references from the confirmed rotation map', () => {
  const db = new Database(':memory:');
  migrate(db);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO entities (id, kind, local_id, title, created_at, updated_at) VALUES ('track', 'track', 'old', 'Song', ?, ?)`)
    .run(now, now);
  db.prepare(`INSERT INTO entities (id, kind, title, created_at, updated_at) VALUES ('external', 'external', 'Other', ?, ?)`)
    .run(now, now);
  db.prepare(`INSERT INTO provider_identities (id, entity_id, provider, provider_id, canonical_url, resolution_state, retrieved_at) VALUES ('provider', 'external', 'genius', '1', 'https://example.test', 'confident', ?)`)
    .run(now);
  db.prepare(`INSERT INTO provider_local_matches (provider_identity_id, local_track_id, state, matched_at) VALUES ('provider', 'old', 'confident', ?)`)
    .run(now);
  db.prepare(`INSERT INTO claims (id, entity_id, provider_identity_id, claim_type, wording, classification, created_at, updated_at) VALUES ('claim', 'track', 'provider', 'producer', 'Produced by A', 'structured-credit', ?, ?)`)
    .run(now, now);
  db.prepare(`INSERT INTO uses (id, claim_id, consumer, track_id, created_at) VALUES ('use', 'claim', 'dj-link', 'old', ?)`)
    .run(now);

  assert.deepEqual(remapLocalTrackIdsInDatabase(db, new Map([['old', 'new']])), { entities: 1, matches: 1, uses: 1 });
  assert.equal((db.prepare(`SELECT local_id AS id FROM entities WHERE id = 'track'`).get() as { id: string }).id, 'new');
  assert.equal((db.prepare(`SELECT local_track_id AS id FROM provider_local_matches`).get() as { id: string }).id, 'new');
  assert.equal((db.prepare(`SELECT track_id AS id FROM uses`).get() as { id: string }).id, 'new');
  db.close();
});
