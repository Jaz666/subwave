import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { migrate } from '../src/sleeve-notes/db.js';
import {
  rebuildWikipediaClaimsInDatabase,
  recoverInterruptedResearchJobsInDatabase,
} from '../src/sleeve-notes/research-repository.js';

function seededDatabase(): Database.Database {
  const db = new Database(':memory:');
  migrate(db);
  const now = '2026-09-16T10:00:00.000Z';
  db.prepare(`INSERT INTO sleeve_artists (id, name, musicbrainz_id, created_at, updated_at)
    VALUES ('artist', 'Example Band', 'mb-artist', ?, ?)`).run(now, now);
  db.prepare(`INSERT INTO sleeve_source_documents (id, entity_type, entity_id, provider, source_url,
    revision_id, content_hash, content_kind, content, attribution, retrieved_at)
    VALUES ('wiki-source', 'artist', 'artist', 'wikipedia', 'https://example.test/wiki', '1', 'wiki-hash',
      'bounded-text', 'Example Band formed in Liverpool.', 'Wikipedia contributors', ?),
      ('other-source', 'artist', 'artist', 'other', 'https://example.test/other', '1', 'other-hash',
      'bounded-text', 'Example Band formed in Liverpool.', 'Another source', ?)`)
    .run(now, now);
  db.prepare(`INSERT INTO sleeve_claims (id, entity_type, entity_id, category, topic, wording,
    source_document_id, evidence, created_at, updated_at)
    VALUES ('wiki-claim', 'artist', 'artist', 'artist-stories', 'origin', 'Example Band formed in Liverpool.',
      'wiki-source', 'Example Band formed in Liverpool.', ?, ?),
      ('other-claim', 'artist', 'artist', 'artist-stories', 'other-origin', 'Example Band formed in Liverpool.',
      'other-source', 'Example Band formed in Liverpool.', ?, ?)`)
    .run(now, now, now, now);
  return db;
}

test('interrupted Sleeve Notes jobs become eligible again on boot', () => {
  const db = seededDatabase();
  db.prepare(`INSERT INTO sleeve_research_jobs (id, provider, subject_type, subject_id, capability,
    state, priority, attempts, run_after, created_at, updated_at)
    VALUES ('stuck', 'researcher', 'artist', 'artist', 'extract-wikipedia', 'running', 300, 1, NULL, ?, ?),
      ('queued', 'wikipedia', 'artist', 'artist', 'biography', 'queued', 300, 0, NULL, ?, ?)`)
    .run('2026-09-16T09:00:00.000Z', '2026-09-16T09:00:00.000Z', '2026-09-16T09:00:00.000Z', '2026-09-16T09:00:00.000Z');

  assert.equal(recoverInterruptedResearchJobsInDatabase(db, new Date('2026-09-16T10:00:00.000Z')), 1);
  assert.deepEqual(db.prepare(`SELECT id, state, run_after AS runAfter FROM sleeve_research_jobs ORDER BY id`).all(), [
    { id: 'queued', state: 'queued', runAfter: null },
    { id: 'stuck', state: 'queued', runAfter: null },
  ]);
  db.close();
});

test('Wikipedia claim rebuild retains cached sources and non-Wikipedia claims', () => {
  const db = seededDatabase();
  db.prepare(`INSERT INTO sleeve_research_jobs (id, provider, subject_type, subject_id, capability,
    state, priority, attempts, run_after, created_at, updated_at)
    VALUES ('wiki-job', 'researcher', 'artist', 'artist', 'extract-wikipedia', 'complete', 300, 2, NULL, ?, ?)`)
    .run('2026-09-16T09:00:00.000Z', '2026-09-16T09:00:00.000Z');

  assert.deepEqual(rebuildWikipediaClaimsInDatabase(db, new Date('2026-09-16T10:00:00.000Z')), {
    claimsRemoved: 1, jobsQueued: 1,
  });
  assert.deepEqual(db.prepare(`SELECT id FROM sleeve_claims ORDER BY id`).all(), [{ id: 'other-claim' }]);
  assert.deepEqual(db.prepare(`SELECT state, attempts, run_after AS runAfter FROM sleeve_research_jobs WHERE id='wiki-job'`).all(), [
    { state: 'queued', attempts: 0, runAfter: null },
  ]);
  assert.equal((db.prepare(`SELECT COUNT(*) AS count FROM sleeve_source_documents WHERE provider='wikipedia'`).get() as { count: number }).count, 1);
  db.close();
});
