import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const root = mkdtempSync(join(tmpdir(), 'subwave-heard-'));
process.env.STATE_DIR = root;
delete process.env.ADMIN_USER; delete process.env.ADMIN_PASS;
const { open, close, withCachedRead } = await import('../src/sleeve-notes/db.js');
const settings = await import('../src/settings.js');
const store = await import('../src/settings/store.js');
const { heardOnAir } = await import('../src/sleeve-notes/heard-on-air.js');
const { router } = await import('../src/routes/sleeve-notes.js');
const { expireRecycleBin, moderateCandidate, moderateExistingClaim } = await import('../src/sleeve-notes/moderation.js');
const { retainResearchClaims } = await import('../src/sleeve-notes/research-repository.js');
const db = open();
const now = new Date().toISOString();
const wording = 'The band recorded their album in a converted barn.';
db.prepare(`INSERT INTO sleeve_source_documents (id, entity_type, entity_id, provider, source_url,
  content_hash, content_kind, content, attribution, retrieved_at)
  VALUES ('source', 'artist', 'artist', 'wikipedia', 'https://example.test/source', 'hash', 'bounded-text', ?, 'Wikipedia', ?)`).run(wording, now);
db.prepare(`INSERT INTO sleeve_claims (id, entity_type, entity_id, category, topic, wording,
  source_document_id, evidence, created_at, updated_at)
  VALUES ('claim', 'artist', 'artist', 'artist-stories', 'studio', ?, 'source', ?, ?, ?)`).run(wording, wording, now, now);
const insertUse = db.prepare(`INSERT INTO sleeve_claim_uses (id, claim_id, entity_type, entity_id,
  category, topic, supplied_at, final_text, offered_wording, detection_status, aired_at,
  tts_text, tts_rendered_at, speech_signal, track_artist, track_title)
  VALUES (?, 'claim', 'artist', 'artist', 'artist-stories', 'studio', ?, 'Generated research readout', ?, ?, ?, ?, ?, ?, 'Band', 'Song')`);
const signal = JSON.stringify({ version: 1, status: 'detected' });
const spoken = 'This is Band with Song. They recorded their album in a converted barn.';
insertUse.run('aired', now, wording, 'detected', now, spoken, now, signal);
insertUse.run('generated-only', now, wording, 'detected', null, null, null, null);
insertUse.run('passed', now, wording, 'not-detected', now, 'Band with Song.', now, JSON.stringify({ version: 1, status: 'not-detected' }));
insertUse.run('legacy', now, wording, 'detected', now, spoken, now, null);
insertUse.run('failed-render', now, wording, 'detected', now, spoken, null, signal);
insertUse.run('bad-json', now, wording, 'detected', now, spoken, now, '{broken');
const app = express(); app.use(express.json(), router);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('No address');
const base = `http://127.0.0.1:${address.port}/sleeve-notes/heard-on-air`;
const post = async (id: string, body: unknown) => fetch(`${base}/${id}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const defaults = settings.getDefaults();
const configure = (enabled: boolean) => store.setCache({ ...defaults, djBehaviour: { ...defaults.djBehaviour, extendedSleeveNotes: enabled } });
configure(true);

test('the shelf requires actual rendered speech evidence and confirmed air', async () => {
  const page = heardOnAir();
  assert.equal(page.total, 1);
  const item = page.items[0] as { id: string; spokenText: string; artist: string; title: string };
  assert.equal(item.id, 'aired'); assert.equal(item.spokenText, spoken);
  assert.equal(item.artist, 'Band'); assert.equal(item.title, 'Song');
  const response = await fetch(base); assert.equal(response.status, 200);
  assert.equal((await response.json() as { total: number }).total, 1);
  assert.equal((await post('generated-only', { story: 'good', delivery: null, note: '' })).status, 404);
});

test('the shelf pages confirmed airings in newest-first order', () => {
  const later = new Date(Date.parse(now) + 1000).toISOString();
  insertUse.run('later', now, wording, 'detected', later, spoken, now, signal);
  const first = heardOnAir(1, 0); const second = heardOnAir(1, 1);
  assert.equal(first.total, 2);
  assert.equal((first.items[0] as { id: string }).id, 'later');
  assert.equal((second.items[0] as { id: string }).id, 'aired');
  db.prepare("DELETE FROM sleeve_claim_uses WHERE id = 'later'").run();
});

test('feedback edits count once and delivery concerns do not alter research or Review', async () => {
  assert.equal((await post('aired', { story: 'good', delivery: 'forced', note: '' })).status, 200);
  assert.equal((await post('aired', { story: 'good', delivery: 'wrong-subject', note: 'The DJ attached biography to this song.' })).status, 200);
  assert.deepEqual(heardOnAir().feedbackTotals.story, [{ value: 'good', count: 1 }]);
  assert.deepEqual(heardOnAir().feedbackTotals.delivery, [{ value: 'wrong-subject', count: 1 }]);
  assert.equal((db.prepare('SELECT enabled FROM sleeve_claims').get() as { enabled: number }).enabled, 1);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM sleeve_moderation_candidates').get() as { n: number }).n, 0);
  assert.equal((await post('aired', { story: null, delivery: null, note: 'Only a note.' })).status, 400);
  assert.equal((await post('aired', { story: 'incorrect', delivery: null, note: 'Wrong.' })).status, 400);
});

test('a specific operator flag creates one durable Review hold and approval releases it', async () => {
  const feedback = { story: 'incorrect', delivery: 'worked', note: 'The saved passage does not support this recording claim.' };
  const response = await post('aired', feedback); assert.equal(response.status, 200);
  assert.equal((await response.json() as { review: boolean }).review, true);
  await post('aired', feedback);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM sleeve_moderation_candidates').get() as { n: number }).n, 1);
  db.prepare("UPDATE sleeve_moderation_candidates SET bin_entered_at = '2020-01-01'").run();
  assert.equal(expireRecycleBin(), 0, 'explicit operator work does not expire unnoticed');
  retainResearchClaims({ entityType: 'artist', entityId: 'artist', sourceDocumentId: 'source', candidates: [{ category: 'artist-stories', topic: 'studio', wording, evidence: wording }] });
  assert.equal((db.prepare('SELECT enabled FROM sleeve_claims').get() as { enabled: number }).enabled, 0);
  assert.equal(heardOnAir().total, 1, 'withdrawal does not erase the historical airing');
  await post('aired', { story: 'good', delivery: 'worked', note: '' });
  assert.equal((db.prepare('SELECT enabled FROM sleeve_claims').get() as { enabled: number }).enabled, 0, 'changing rating is not approval');
  const candidate = db.prepare('SELECT id FROM sleeve_moderation_candidates').get() as { id: string };
  moderateCandidate(candidate.id, 'approved', { category: 'artist-stories', topic: 'studio', wording, evidence: wording });
  assert.deepEqual(db.prepare('SELECT enabled, feedback_hold FROM sleeve_claims').get(), { enabled: 1, feedback_hold: 0 });
});

test('feedback on an already rewritten historical story does not withdraw the replacement', async () => {
  db.prepare("UPDATE sleeve_claims SET wording = 'The band worked in a converted barn.'").run();
  const response = await post('aired', { story: 'incorrect', delivery: null, note: 'The original wording had an incorrect subject.' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, review: false, changedStory: true });
  assert.equal((db.prepare('SELECT enabled FROM sleeve_claims').get() as { enabled: number }).enabled, 1);
});

test('an adapted offer still targets the unchanged canonical claim snapshot', async () => {
  db.prepare('UPDATE sleeve_claims SET wording = ?').run(wording);
  db.prepare("UPDATE sleeve_claim_uses SET offered_wording = 'An adapted connection introduction.', claim_wording_at_offer = ? WHERE id = 'aired'").run(wording);
  const response = await post('aired', { story: 'unclear', delivery: null, note: 'The source attribution needs clearer wording.' });
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { review: boolean }).review, true);
  const item = heardOnAir().items[0] as { wordingAtOffer: string; offeredWording: string };
  assert.equal(item.wordingAtOffer, wording);
  assert.equal(item.offeredWording, 'An adapted connection introduction.');
});

test('historical feedback does not reopen a claim explicitly removed by the operator', async () => {
  moderateExistingClaim('claim', 'deleted', null);
  const response = await post('aired', { story: 'incorrect', delivery: null, note: 'The original story was factually incorrect.' });
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { review: boolean }).review, false);
  assert.equal((db.prepare('SELECT status FROM sleeve_moderation_candidates').get() as { status: string }).status, 'deleted');
  assert.equal(heardOnAir().total, 1);
});

test('disabled reads keep history without migrating a v45 cache, and reject feedback writes', async () => {
  configure(false);
  assert.equal((await post('aired', { story: 'good', delivery: null, note: '' })).status, 409);
  const response = await fetch(base); assert.equal((await response.json() as { readOnly: boolean }).readOnly, true);
  const path = join(root, 'old-cache.db');
  await db.backup(path);
  const snapshot = new Database(path);
  snapshot.exec(`DROP TRIGGER sleeve_feedback_hold; DROP TABLE sleeve_spark_feedback;
    ALTER TABLE sleeve_claims DROP COLUMN feedback_hold;
    ALTER TABLE sleeve_claim_uses DROP COLUMN track_artist;
    ALTER TABLE sleeve_claim_uses DROP COLUMN track_title;
    ALTER TABLE sleeve_claim_uses DROP COLUMN claim_wording_at_offer;`);
  snapshot.pragma('user_version = 45'); snapshot.close();
  assert.equal(withCachedRead(() => heardOnAir().total, path), 1);
  assert.deepEqual(withCachedRead(() => heardOnAir().feedbackTotals, path), { story: [], delivery: [] });
  const check = new Database(path, { readonly: true }); assert.equal(check.pragma('user_version', { simple: true }), 45); check.close();
});

test('cached shelf handles absent and pre-speech stores without creating a file', async () => {
  const missing = join(root, 'missing.db');
  assert.equal(withCachedRead(() => heardOnAir().total, missing), 0);
  assert.equal(existsSync(missing), false);
  const oldPath = join(root, 'pre-speech.db');
  const old = new Database(oldPath); old.exec('CREATE TABLE sleeve_claim_uses (id TEXT PRIMARY KEY)'); old.pragma('user_version = 42'); old.close();
  assert.equal(withCachedRead(() => heardOnAir().total, oldPath), 0);
  const check = new Database(oldPath, { readonly: true }); assert.equal(check.pragma('user_version', { simple: true }), 42); check.close();
});

test.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); close(); rmSync(root, { recursive: true, force: true }); });
