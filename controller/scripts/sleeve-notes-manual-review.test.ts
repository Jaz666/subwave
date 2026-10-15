import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'subwave-manual-review-'));
process.env.STATE_DIR = root;
process.env.ADMIN_USER = 'operator'; process.env.ADMIN_PASS = 'secret';
const { open, close } = await import('../src/sleeve-notes/db.js');
const settings = await import('../src/settings.js');
const store = await import('../src/settings/store.js');
const { router } = await import('../src/routes/sleeve-notes.js');
const { expireRecycleBin, moderateCandidate, sendClaimToReview } = await import('../src/sleeve-notes/moderation.js');
const { retainResearchClaims } = await import('../src/sleeve-notes/research-repository.js');
const db = open();
await settings.load();
const defaults = settings.get();
const configure = (enabled: boolean) => store.setCache({ ...defaults, djBehaviour: { ...defaults.djBehaviour, extendedSleeveNotes: enabled } });
configure(true);
const now = new Date().toISOString();
const wording = 'Nick Mason later worked with Alan Parsons to recreate the drum sound of Dark Side of the Moon.';
const candidate = { category: 'artist-stories' as const, topic: 'drum-recreation', wording, evidence: wording };
db.prepare(`INSERT INTO sleeve_source_documents (id, entity_type, entity_id, provider, source_url, content_hash, content_kind, content, attribution, retrieved_at)
  VALUES ('source', 'artist', 'artist', 'web-operator', 'https://example.test/article', 'hash', 'bounded-text', ?, 'Article', ?)`).run(wording, now);
function seed(id: string) {
  db.prepare(`INSERT INTO sleeve_claims (id, entity_type, entity_id, category, topic, wording, source_document_id, evidence, created_at, updated_at)
    VALUES (?, 'artist', 'artist', 'artist-stories', ?, ?, 'source', ?, ?, ?)`).run(id, id, wording, wording, now, now);
}
const app = express(); app.use(express.json(), router);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing address');
const base = `http://127.0.0.1:${address.port}/sleeve-notes`;
const post = (id: string) => fetch(`${base}/claims/${id}/review`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from('operator:secret').toString('base64')}` } });

test('unaired saved facts can be withdrawn via the route; repeat clicks reuse one Review item and preserve evidence', async () => {
  seed('claim');
  const response = await post('claim'); assert.equal(response.status, 200);
  const item = await response.json() as { id: string };
  assert.deepEqual(await (await post('claim')).json(), item);
  assert.deepEqual(db.prepare('SELECT enabled,feedback_hold FROM sleeve_claims WHERE id=?').get('claim'), { enabled: 0, feedback_hold: 1 });
  const review = db.prepare('SELECT wording,evidence,claim_id,rejection_origin FROM sleeve_moderation_candidates WHERE id=?').get(item.id);
  assert.deepEqual(review, { wording, evidence: wording, claim_id: 'claim', rejection_origin: 'operator-review' });
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM sleeve_claim_history').get() as { n: number }).n, 1);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM sleeve_claim_uses').get() as { n: number }).n, 0);
});

test('manual Review survives expiry and automated retention until explicit approval', () => {
  db.prepare("UPDATE sleeve_moderation_candidates SET bin_entered_at='2020-01-01T00:00:00Z'").run();
  assert.equal(expireRecycleBin(), 0);
  retainResearchClaims({ entityType: 'artist', entityId: 'artist', sourceDocumentId: 'source', candidates: [{ ...candidate, topic: 'claim' }] });
  assert.equal((db.prepare("SELECT enabled FROM sleeve_claims WHERE id='claim'").get() as { enabled: number }).enabled, 0);
  const item = db.prepare('SELECT id FROM sleeve_moderation_candidates').get() as { id: string };
  moderateCandidate(item.id, 'approved', { ...candidate, topic: 'claim' });
  assert.deepEqual(db.prepare("SELECT enabled,feedback_hold,operator_state FROM sleeve_claims WHERE id='claim'").get(), { enabled: 1, feedback_hold: 0, operator_state: 'approved' });
});

test('a previously approved fact can return to Review and deletion prevents automated resurrection', async () => {
  const response = await post('claim'); assert.equal(response.status, 200);
  const item = await response.json() as { id: string };
  moderateCandidate(item.id, 'deleted', null);
  retainResearchClaims({ entityType: 'artist', entityId: 'artist', sourceDocumentId: 'source', candidates: [{ ...candidate, topic: 'claim' }] });
  assert.equal((db.prepare("SELECT enabled FROM sleeve_claims WHERE id='claim'").get() as { enabled: number }).enabled, 0);
});

test('missing or explicitly deleted claims are rejected; disabled mode and admin authentication protect writes', async () => {
  assert.equal((await post('missing')).status, 400);
  db.prepare("UPDATE sleeve_claims SET operator_state='deleted' WHERE id='claim'").run();
  assert.throws(() => sendClaimToReview('claim'), /already been deleted/);
  configure(false); assert.equal((await post('claim')).status, 409);
  configure(true);
  assert.equal((await fetch(`${base}/claims/claim/review`, { method: 'POST' })).status, 401);
});

test.after(() => { server.close(); close(); rmSync(root, { recursive: true, force: true }); });
