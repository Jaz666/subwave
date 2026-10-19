import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { migrate } from '../src/sleeve-notes/db.js';

test('Sleeve Notes migration creates its isolated durable model', () => {
  const db = new Database(':memory:');
  migrate(db);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all().map((row: { name: string }) => row.name);
  const originalTables = [
    'claims', 'discoveries', 'entities', 'evidence', 'jobs', 'provider_coverage',
    'provider_identities', 'provider_local_matches', 'relationships',
    'sleeve_artists', 'sleeve_claims', 'sleeve_encounters', 'sleeve_local_attachments',
    'sleeve_provider_requests', 'sleeve_recording_releases', 'sleeve_recordings',
    'sleeve_releases', 'sleeve_research_jobs', 'sleeve_source_documents', 'uses',
  ];
  for (const table of originalTables) assert.ok(tables.includes(table), `missing table ${table}`);
  assert.ok(!tables.includes('tracks'), 'station library tables must stay outside the Sleeve Notes store');
  assert.equal(db.pragma('user_version', { simple: true }), 57);
  db.close();
});

test('replacement migration clears populated experiment rows with foreign keys enabled', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  // Recreate the old experiment fixture without keeping later replacement tables.
  db.pragma('foreign_keys = OFF');
  const replacementTables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'sleeve_%'")
    .all() as { name: string }[];
  for (const { name } of replacementTables) db.exec(`DROP TABLE ${name}`);
  db.pragma('foreign_keys = ON');
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

  assert.equal(db.pragma('user_version', { simple: true }), 57);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM entities').get() as { count: number }).count, 0);
  assert.equal((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sleeve_research_jobs'").get() as { name: string }).name, 'sleeve_research_jobs');
  db.close();
});

test('speech diagnostics upgrade preserves historical signal and timestamps without backfilling evidence', () => {
  const db = new Database(':memory:');
  migrate(db);
  // Restore the real v42 projection, retaining a historical aired offer.
  for (const column of ['generated_signal', 'speech_signal', 'tts_rendered_at', 'tts_engine']) {
    db.exec(`ALTER TABLE sleeve_claim_uses DROP COLUMN ${column}`);
  }
  db.exec('DROP TABLE sleeve_brain_layers');
  for (const column of ['enabled', 'origin', 'removed']) db.exec(`ALTER TABLE sleeve_musicbrainz_series DROP COLUMN ${column}`);
  db.pragma('user_version = 42');
  db.prepare(`INSERT INTO sleeve_source_documents (id, entity_type, entity_id, provider, source_url,
    content_hash, content_kind, content, attribution, retrieved_at)
    VALUES ('old-source', 'artist', 'artist', 'wikipedia', 'https://example.test',
      'hash', 'bounded-text', 'Old wording.', 'Wikipedia', 'old-time')`).run();
  db.prepare(`INSERT INTO sleeve_claims (id, entity_type, entity_id, category, topic, wording,
    source_document_id, evidence, created_at, updated_at)
    VALUES ('claim', 'artist', 'artist', 'artist-stories', 'topic', 'Old wording.',
      'old-source', 'Old wording.', 'old-time', 'old-time')`).run();
  db.prepare(`INSERT INTO sleeve_claim_uses
    (id, claim_id, entity_type, entity_id, category, topic, supplied_at, offered_wording, detection_status, aired_at)
    VALUES ('old', 'claim', 'artist', 'artist', 'artist-stories', 'topic', 'old-time', 'Old wording.', 'detected', 'old-air')`).run();
  migrate(db);
  const row = db.prepare('SELECT * FROM sleeve_claim_uses WHERE id = ?').get('old') as Record<string, unknown>;
  assert.equal(row.detection_status, 'detected');
  assert.equal(row.aired_at, 'old-air');
  assert.equal(row.offered_wording, 'Old wording.');
  assert.equal(row.generated_signal, null);
  assert.equal(row.speech_signal, null);
  assert.equal(row.tts_rendered_at, null);
  assert.equal(row.tts_engine, null);
  migrate(db);
  assert.equal(db.pragma('user_version', { simple: true }), 57);
  db.close();
});
