import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { migrate } from '../src/sleeve-notes/db.js';
import { mergeExternalEntityInDatabase } from '../src/sleeve-notes/repository.js';

test('a locally played track promotes a prior external relationship target', () => {
  const db = new Database(':memory:');
  migrate(db);
  const now = new Date().toISOString();
  const entity = (id: string, kind: 'track' | 'external', localId: string | null, title: string) =>
    db.prepare(`INSERT INTO entities (id, kind, local_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, kind, localId, title, now, now);
  entity('local', 'track', 'navidrome-123', 'Source Song');
  entity('external', 'external', null, 'Source Song');
  entity('other', 'external', null, 'Related Song');
  db.prepare(`INSERT INTO provider_identities (id, entity_id, provider, provider_id, canonical_url, resolution_state, retrieved_at)
    VALUES ('source', 'external', 'genius', '100', 'https://genius.com/source', 'unavailable', ?),
      ('other', 'other', 'genius', '200', 'https://genius.com/other', 'unresolved', ?)`).run(now, now);
  db.prepare(`INSERT INTO relationships (id, from_entity_id, to_entity_id, provider_identity_id, relationship_type, created_at)
    VALUES ('relationship', 'other', 'external', 'other', 'samples', ?)`).run(now);
  db.prepare(`INSERT INTO claims (id, entity_id, provider_identity_id, claim_type, wording, classification, created_at, updated_at)
    VALUES ('claim', 'external', 'source', 'producer', 'Produced by Someone', 'structured-credit', ?, ?)`).run(now, now);
  db.prepare(`INSERT INTO provider_coverage (provider, entity_id, state, checked_at) VALUES ('genius', 'external', 'ready', ?)`).run(now);
  db.prepare(`INSERT INTO jobs (id, provider, entity_id, kind, state, priority, attempts, depth, root_entity_id, created_at, updated_at)
    VALUES ('job', 'genius', 'other', 'fetch', 'queued', 0, 0, 1, 'external', ?, ?)`).run(now, now);
  db.prepare(`INSERT INTO discoveries (entity_id, root_entity_id, origin, depth, discovered_at)
    VALUES ('external', 'external', 'relationship', 1, ?), ('other', 'external', 'relationship', 1, ?)`).run(now, now);

  mergeExternalEntityInDatabase(db, 'external', 'local');

  assert.equal((db.prepare(`SELECT COUNT(*) AS count FROM entities WHERE id = 'external'`).get() as { count: number }).count, 0);
  assert.equal((db.prepare(`SELECT entity_id AS entityId FROM provider_identities WHERE id = 'source'`).get() as { entityId: string }).entityId, 'local');
  assert.equal((db.prepare(`SELECT entity_id AS entityId FROM claims WHERE id = 'claim'`).get() as { entityId: string }).entityId, 'local');
  assert.deepEqual(db.prepare(`SELECT from_entity_id AS fromEntityId, to_entity_id AS toEntityId FROM relationships`).all(), [
    { fromEntityId: 'other', toEntityId: 'local' },
  ]);
  assert.equal((db.prepare(`SELECT root_entity_id AS rootEntityId FROM jobs WHERE id = 'job'`).get() as { rootEntityId: string }).rootEntityId, 'local');
  assert.equal((db.prepare(`SELECT COUNT(*) AS count FROM discoveries WHERE entity_id = 'external' OR root_entity_id = 'external'`).get() as { count: number }).count, 0);
  db.close();
});
