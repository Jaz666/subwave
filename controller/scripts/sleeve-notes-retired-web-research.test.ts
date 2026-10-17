import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = mkdtempSync(join(tmpdir(), 'subwave-retired-web-'));
process.env.STATE_DIR = root;
const { migrate, close } = await import('../src/sleeve-notes/db.js');
const { loadExtendedSleeveNoteCandidatesInDatabase } = await import('../src/sleeve-notes/link-selection.js');
const { router } = await import('../src/routes/sleeve-notes.js');
const now = new Date().toISOString();
function fixture() {
  const db = new Database(':memory:'); migrate(db);
  db.prepare(`INSERT INTO sleeve_artists(id,name,musicbrainz_id,created_at,updated_at) VALUES ('artist','Band','artist',?,?)`).run(now, now);
  db.prepare(`INSERT INTO sleeve_recordings(id,title,artist_id,match_state,created_at,updated_at) VALUES ('recording','Song','artist','matched',?,?)`).run(now, now);
  db.prepare(`INSERT INTO sleeve_local_attachments(local_track_id,title,artist,recording_id,match_state,first_encountered_at,last_encountered_at,updated_at)
    VALUES ('local','Song','Band','recording','matched',?,?,?)`).run(now, now, now);
  for (const provider of ['web-operator', 'wikipedia']) {
    db.prepare(`INSERT INTO sleeve_source_documents(id,entity_type,entity_id,provider,source_url,content_hash,content_kind,content,attribution,retrieved_at)
      VALUES (?,'artist','artist',?,'https://example.test/story','hash','bounded-text','Band recorded in a barn.','Article',?)`).run(provider, provider, now);
    db.prepare(`INSERT INTO sleeve_claims(id,entity_type,entity_id,category,topic,wording,source_document_id,evidence,enabled,created_at,updated_at)
      VALUES (?,'artist','artist','artist-stories',?,'Band recorded in a barn.',?,'Band recorded in a barn.',1,?,?)`).run(provider, provider, provider, now, now);
  }
  return db;
}

test('retirement stops pending requests and withdraws web stories and Review items while preserving history', () => {
  const db = fixture();
  for (const state of ['queued', 'running', 'deferred', 'complete']) db.prepare(`INSERT INTO sleeve_operator_research
    (id,fingerprint,entity_type,entity_id,area,note,source_url,subject_label,state,created_at,updated_at)
    VALUES (?,?,'artist','artist','recording','Sessions','','Band',?,?,?)`).run(state, state, state, now, now);
  db.prepare(`INSERT INTO sleeve_claim_uses(id,claim_id,local_track_id,entity_type,entity_id,category,topic,supplied_at,aired_at)
    VALUES ('aired','web-operator','local','artist','artist','artist-stories','studio',?,?)`).run(now, now);
  for (const provider of ['web-operator', 'wikipedia']) db.prepare(`INSERT INTO sleeve_moderation_candidates
    (id,source_document_id,fingerprint,entity_type,entity_id,category,topic,wording,evidence,original_json,rejection_reason,created_at,updated_at)
    VALUES (?,?,'fact','artist','artist','artist-stories','studio','Band recorded in a barn.','Band recorded in a barn.','{}','editorial',?,?)`).run(provider, provider, now, now);
  db.pragma('user_version=50'); migrate(db);
  assert.equal(db.pragma('user_version', { simple: true }), 53);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sleeve_operator_research WHERE state='cancelled'").get() as {n:number}).n, 3);
  assert.equal((db.prepare("SELECT state FROM sleeve_operator_research WHERE id='complete'").get() as {state:string}).state, 'complete');
  assert.deepEqual(db.prepare('SELECT id,enabled FROM sleeve_claims ORDER BY id').all(), [{id:'web-operator',enabled:0},{id:'wikipedia',enabled:1}]);
  assert.equal((db.prepare("SELECT status FROM sleeve_moderation_candidates WHERE id='web-operator'").get() as {status:string}).status, 'deleted');
  assert.equal((db.prepare("SELECT status FROM sleeve_moderation_candidates WHERE id='wikipedia'").get() as {status:string}).status, 'pending');
  assert.ok(db.prepare("SELECT 1 FROM sleeve_claim_uses WHERE id='aired' AND aired_at=?").get(now));
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM sleeve_source_documents').get() as {n:number}).n, 2);
  migrate(db); db.close();
});

test('legacy web sources cannot qualify for Sparks even if a saved claim is enabled', () => {
  const db = fixture();
  const candidates = loadExtendedSleeveNoteCandidatesInDatabase(db, 'local', 'Band');
  assert.ok(candidates.some(candidate => candidate.claimId === 'wikipedia'));
  assert.ok(!candidates.some(candidate => candidate.claimId === 'web-operator'));
  db.close();
});

test('removed web research endpoints accept no reads or new requests', async () => {
  const app = express(); app.use(express.json(), router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing address');
    const url = `http://127.0.0.1:${address.port}/sleeve-notes/operator-research`;
    assert.equal((await fetch(url)).status, 404);
    assert.equal((await fetch(url, {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status, 404);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
test.after(() => { close(); rmSync(root, {recursive:true,force:true}); });
