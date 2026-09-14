import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { migrate } from '../src/sleeve-notes/db.js';

test('Sleeve Notes migration creates its isolated durable model', () => {
  const db = new Database(':memory:');
  migrate(db);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all().map((row: { name: string }) => row.name);
  assert.deepEqual(tables, [
    'claims', 'discoveries', 'entities', 'evidence', 'jobs', 'provider_coverage',
    'provider_identities', 'provider_local_matches', 'relationships',
    'sleeve_artists', 'sleeve_claims', 'sleeve_encounters', 'sleeve_local_attachments',
    'sleeve_provider_requests', 'sleeve_recording_releases', 'sleeve_recordings',
    'sleeve_releases', 'sleeve_research_jobs', 'sleeve_source_documents', 'uses',
  ]);
  assert.equal(db.pragma('user_version', { simple: true }), 5);
  db.close();
});

test('replacement migration clears populated experiment rows with foreign keys enabled', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  db.exec(`
    DROP TABLE sleeve_claims;
    DROP TABLE sleeve_source_documents;
    DROP TABLE sleeve_provider_requests;
    DROP TABLE sleeve_research_jobs;
    DROP TABLE sleeve_encounters;
    DROP TABLE sleeve_local_attachments;
    DROP TABLE sleeve_recording_releases;
    DROP TABLE sleeve_releases;
    DROP TABLE sleeve_recordings;
    DROP TABLE sleeve_artists;
  `);
  db.pragma('user_version = 4');
  db.prepare(`INSERT INTO entities (id, kind, title, created_at, updated_at)
    VALUES ('track', 'track', 'Old experiment', 'now', 'now')`).run();
  db.prepare(`INSERT INTO provider_identities
    (id, entity_id, provider, provider_id, canonical_url, resolution_state, retrieved_at)
    VALUES ('identity', 'track', 'genius', '1', 'https://example.test', 'confident', 'now')`).run();
  db.prepare(`INSERT INTO claims
    (id, entity_id, provider_identity_id, claim_type, wording, classification, created_at, updated_at)
    VALUES ('claim', 'track', 'identity', 'writer', 'Old claim', 'sourced', 'now', 'now')`).run();
  db.prepare(`INSERT INTO evidence
    (id, claim_id, provider, source_url, attribution, retrieved_at)
    VALUES ('evidence', 'claim', 'genius', 'https://example.test', 'Test', 'now')`).run();
  db.prepare(`INSERT INTO uses (id, claim_id, consumer, created_at)
    VALUES ('use', 'claim', 'test', 'now')`).run();

  migrate(db);

  assert.equal(db.pragma('user_version', { simple: true }), 5);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM entities').get() as { count: number }).count, 0);
  assert.equal((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sleeve_research_jobs'").get() as { name: string }).name, 'sleeve_research_jobs');
  db.close();
});
