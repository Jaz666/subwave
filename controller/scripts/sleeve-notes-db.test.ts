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
    'claims', 'entities', 'evidence', 'jobs', 'provider_coverage',
    'provider_identities', 'provider_local_matches', 'relationships', 'uses',
  ]);
  assert.equal(db.pragma('user_version', { simple: true }), 2);
  db.close();
});
