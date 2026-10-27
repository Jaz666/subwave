import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { listen } from './test-utils/http.js';
import test from 'node:test';
import { createTempDir, removeTempDir } from './test-utils/temp-dir.js';

const root = createTempDir(join(tmpdir(), 'subwave-flow-store-'));
mkdirSync(join(root, 'state'));
process.env.STATE_DIR = join(root, 'state');
process.env.NAVIDROME_URL = 'http://navidrome.test:4533';
process.env.NAVIDROME_USER = 'dj';
process.env.NAVIDROME_PASS = 'test';
delete process.env.ADMIN_USER;
delete process.env.ADMIN_PASS;
const flows = await import('../src/music/sub-flow.js');
const { router } = await import('../src/routes/library/sub-flow.js');
const originalFetch = globalThis.fetch;

// Two seconds of silent stereo PCM, long enough for the download guard.
const pcmSize = 44100 * 4 * 2;
const wav = Buffer.alloc(44 + pcmSize);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcmSize, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(44100 * 4, 28); wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcmSize, 40);
let broken: 'none' | 'json' | 'short' = 'none';
let pauseStream: (() => Promise<void>) | null = null;
globalThis.fetch = (async input => {
  const url = new URL(String(input));
  if (url.pathname.endsWith('/getSong')) {
    const id = url.searchParams.get('id');
    const song = { id, title: `Track ${id}`, artist: 'Artist', album: 'Album', duration: 2 };
    return new Response(JSON.stringify({ 'subsonic-response': { status: 'ok', song } }), { status: 200 });
  }
  if (url.pathname.endsWith('/stream')) {
    if (pauseStream) await pauseStream();
    if (broken === 'json') return new Response('{"error":"missing"}', { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(broken === 'short' ? wav.subarray(0, wav.length / 2) : wav, { status: 200, headers: { 'content-type': 'audio/wav' } });
  }
  throw new Error(`Unexpected fixture request: ${url.pathname}`);
}) as typeof fetch;

async function settled(id: string) {
  for (let i = 0; i < 100; i++) {
    const flow = flows.list().find(item => item.id === id);
    if (flow && flow.verification !== 'pending') return flow;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Verification did not finish');
}
test.after(async () => { globalThis.fetch = originalFetch; await removeTempDir(root); });

test('Flow save, verification, revision guards, disabling, and restore', async () => {
  const input = { name: 'Example', enabled: true, trackIds: ['one', 'two'] };
  const created = await flows.save(null, input);
  assert.equal(created.verification, 'pending');
  const checked = await settled(created.id);
  assert.equal(checked.verification, 'verified');
  assert.equal(checked.tracks[0]?.fingerprint?.sha256, createHash('sha256').update(wav).digest('hex'));
  assert.equal(checked.tracks[0]?.fingerprint?.decodedSeconds, 2);
  assert.equal(JSON.parse(readFileSync(join(root, 'state', 'sub-flows.json'), 'utf8'))[0].id, created.id);
  await assert.rejects(() => flows.save(null, input), /another enabled Flow/);
  assert.throws(() => flows.setEnabled(created.id, 999, false), /changed/);
  const disabled = flows.setEnabled(created.id, checked.revision, false);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.tracks[0]?.fingerprint?.sha256, checked.tracks[0]?.fingerprint?.sha256);
  broken = 'json';
  const rechecked = await flows.save(created.id, { ...input, enabled: false, revision: disabled.revision });
  const failed = await settled(rechecked.id);
  assert.equal(failed.verification, 'failed');
  assert.match(failed.verificationError ?? '', /did not return audio/);
  assert.equal(failed.tracks[0]?.fingerprint, null);
  broken = 'short';
  const truncated = await flows.save(created.id, { ...input, enabled: false, revision: failed.revision });
  const truncatedResult = await settled(truncated.id);
  assert.equal(truncatedResult.verification, 'failed');
  assert.equal(truncatedResult.tracks[0]?.fingerprint, null);
  flows.restore([checked]);
  assert.equal(flows.list()[0]?.verification, 'failed');
  assert.equal(flows.list()[0]?.tracks[0]?.fingerprint, null);
  assert.throws(() => flows.validateBackup([checked, checked]), /Duplicate/);
  assert.throws(() => flows.remove(created.id, 999), /changed/);
  flows.remove(created.id, checked.revision);
  assert.deepEqual(flows.list(), []);
});

test('the admin API saves, lists, disables, and deletes a Flow', async () => {
  broken = 'none';
  const app = express();
  app.use(express.json());
  app.use(router);
  const fixture = await listen(app);
  try {
    const headers = { 'content-type': 'application/json' };
    const url = `${fixture.url}/library/sub-flow`;
    const response = await originalFetch(url, { method: 'POST', headers, body: JSON.stringify({ name: 'API pair', enabled: true, trackIds: ['one', 'two'] }) });
    assert.equal(response.status, 201);
    const created = (await response.json() as { flow: { id: string; revision: number } }).flow;
    const checked = await settled(created.id);
    const listed = await (await originalFetch(url)).json() as { flows: { id: string }[] };
    assert.equal(listed.flows[0]?.id, created.id);
    const toggle = await originalFetch(`${url}/${created.id}/enabled`, { method: 'PATCH', headers, body: JSON.stringify({ revision: checked.revision, enabled: false }) });
    assert.equal(toggle.status, 200);
    const updated = (await toggle.json() as { flow: { revision: number; enabled: boolean } }).flow;
    assert.equal(updated.enabled, false);
    assert.equal((await originalFetch(`${url}/${created.id}?revision=${updated.revision}`, { method: 'DELETE' })).status, 200);
    assert.deepEqual(flows.list(), []);
  } finally { await fixture.close(); }
});

test('an in-flight check cannot overwrite a later disable', async () => {
  broken = 'none';
  let unblock!: () => void;
  let entered!: () => void;
  const wait = new Promise<void>(resolve => { unblock = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  pauseStream = async () => { pauseStream = null; entered(); await wait; };
  const flow = await flows.save(null, { name: 'Race', enabled: true, trackIds: ['one', 'two'] });
  await started;
  const disabled = flows.setEnabled(flow.id, flow.revision, false);
  unblock();
  const next = await flows.save(null, { name: 'Next', enabled: true, trackIds: ['three', 'four'] });
  await settled(next.id); // the single verification worker has finished the older job
  const current = flows.list().find(item => item.id === flow.id);
  assert.equal(current?.revision, disabled.revision);
  assert.equal(current?.enabled, false);
  assert.equal(current?.verification, 'failed');
  assert.equal(current?.tracks[0]?.fingerprint, null);
  flows.remove(flow.id, disabled.revision);
  flows.remove(next.id, next.revision);
});

test('a corrupt store is never silently replaced by a new save', async () => {
  const path = join(root, 'state', 'sub-flows.json');
  writeFileSync(path, '{invalid');
  assert.throws(() => flows.list());
  await assert.rejects(() => flows.save(null, { name: 'New', enabled: true, trackIds: ['one', 'two'] }));
  assert.equal(readFileSync(path, 'utf8'), '{invalid');
});
