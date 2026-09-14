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
