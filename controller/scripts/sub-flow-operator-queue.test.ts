// Library operator HTTP requests through real Flow preparation/admission.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import type { Flow } from '../src/music/sub-flow.js';

process.env.NAVIDROME_URL = 'http://flow-library.invalid';
delete process.env.ADMIN_USER; delete process.env.ADMIN_PASS;
process.env.NAVIDROME_USER = 'test';
process.env.NAVIDROME_PASS = 'test';
let version = 1;
const mixer = createServer(socket => socket.once('data', () => socket.end(JSON.stringify({version,pending:'',playing:''}) + '\nEND\n')));
await new Promise<void>(resolve => mixer.listen(0, '127.0.0.1', resolve));
process.env.LIQUIDSOAP_HOST = '127.0.0.1';
process.env.LIQUIDSOAP_PORT = String((mixer.address() as AddressInfo).port);
const settings = await import('../src/settings.js');
const library = await import('../src/music/library.js');
const express = (await import('express')).default;
const { router } = await import('../src/routes/dj.js');
const blocklist = await import('../src/music/blocklist.js');
const app = express(); app.use(express.json()); app.use(router);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const { queue } = await import('../src/broadcast/queue.js');



const { discardFlow, expectFlowPlayback } = await import('../src/music/sub-flow-playback.js');
const { config } = await import('../src/config.js');


function wav(value: number) {
  const pcm = Buffer.alloc(44100 * 4 * 2);
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(value, i);
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(44100, 24); header.writeUInt32LE(44100 * 4, 28); header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
const songs = [0, 1, 2].map(index => ({ id: `flow-${index}`, title: `Part ${index + 1}`, artist: 'Album Artist',
  album: 'Album', albumId: 'album', duration: 2, track: index + 1, discNumber: 1 }));
const audio = songs.map((_, index) => wav(100 + index));
const definition: Flow = {
  id: 'b9ed04f7-3e85-44b2-8ec6-bd2ca327d533', name: 'Three parts', enabled: true, revision: 1,
  verification: 'verified', verificationError: null, orderVerified: true, createdAt: '', updatedAt: '',
  tracks: songs.map((song, index) => ({ id: song.id, title: song.title, artist: song.artist, album: song.album, duration: 2,
    fingerprint: { sha256: createHash('sha256').update(audio[index]!).digest('hex'), bytes: audio[index]!.length, decodedSeconds: 2 } })),
};
let changed = false;
let streams = 0;
const originalFetch = globalThis.fetch;
const originalDrain = queue.drainToLiquidsoap;
queue.drainToLiquidsoap = async () => {};
function save(flow = definition) { writeFileSync(join(config.stateDir, 'sub-flows.json'), JSON.stringify([flow])); }
test.before(async () => {
  await settings.load();
  await blocklist.load();
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === base) return originalFetch(input, init);
    assert.equal(url.hostname, 'flow-library.invalid');
    const endpoint = url.pathname.split('/').at(-1);
    const index = songs.findIndex(song => song.id === url.searchParams.get('id'));
    if (endpoint === 'stream') {
      streams++;
      return new Response(changed && index === 2 ? wav(999) : audio[index], { headers: { 'content-type': 'audio/wav' } });
    }
    const data = endpoint === 'getSong' ? { song: songs[index] }
      : endpoint === 'getAlbum' ? { album: { id: 'album', songCount: 3, song: songs } } : {};
    return Response.json({ 'subsonic-response': { status: 'ok', version: '1.16.1', ...data } });
  }) as typeof fetch;
});
test.beforeEach(async () => {
  for (const item of queue.upcoming) if (item.flow) await discardFlow(item.flow);
  queue.upcoming = []; queue.current = null; queue.history = []; expectFlowPlayback(false);
  for (const rule of blocklist.list()) await blocklist.remove(rule.type, rule.id);
  changed = false; streams = 0; version = 1; save();
});
test.after(async () => {
  for (const item of queue.upcoming) if (item.flow) await discardFlow(item.flow);
  if (queue._persistTimer) clearTimeout(queue._persistTimer);
  queue.drainToLiquidsoap = originalDrain; globalThis.fetch = originalFetch; expectFlowPlayback(false);
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  await new Promise<void>(resolve => mixer.close(() => resolve())); library.shutdown();
});
async function submit(body: object) {
  const response = await originalFetch(`${base}/dj/queue-track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as { track?: { id: string }; flow?: { size: number }; queuePosition?: number; reason?: string; error?: string } };
}
test('Library: selecting any member queues the complete protected Flow from its first track', async () => {
  for (const selected of songs) {
    for (const item of queue.upcoming) if (item.flow) await discardFlow(item.flow);
    queue.upcoming = [{ track: { id: 'ahead', title: 'Ahead' } }]; expectFlowPlayback(false);
    queue.history = [{ track: selected }];
    const input = selected;
    const result = await submit(input);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.deepEqual(queue.upcoming.slice(1).map(item => item.track.id), songs.map(song => song.id));
    assert.ok(queue.upcoming.slice(1).every(item => item.operator && item.requestedBy === 'studio' && !item.aiPicked && item.flow));
    assert.equal(queue.pendingListenerRequests(), 0);
    assert.equal(result.body.track?.id, songs[0]!.id);
    assert.equal(result.body.flow?.size, 3);
    assert.equal(result.body.queuePosition, 2);
    assert.match(result.body.reason ?? '', /starting with “Part 1”/);
    assert.doesNotMatch(JSON.stringify(result.body), /audio.wav|sha256/);
  }
});

test('a changed or blocked companion refuses the whole Flow without appending the selected member', async () => {
  changed = true;
  let result = await submit(songs[1]!);
  assert.equal(result.status, 409); assert.match(result.body.error ?? '', /changed/);
  assert.equal(queue.upcoming.length, 0);
  assert.deepEqual(await readdir(join(config.stateDir, 'sub-flow-playback')), []);
  changed = false;
  await blocklist.add({ type: 'track', id: songs[2]!.id, name: songs[2]!.title });
  result = await submit(songs[1]!);
  assert.equal(result.status, 409); assert.equal(queue.upcoming.length, 0);
});
test('unchecked definitions and unsupported mixers refuse whole-Flow operator admission', async () => {
  save({ ...definition, verification: 'failed' });
  assert.equal((await submit(songs[1]!)).status, 409);
  assert.equal(streams, 0);
  save(); version = 0;
  assert.equal((await submit(songs[1]!)).status, 409);
  assert.equal(queue.upcoming.length, 0); assert.equal(streams, 0);
});
test('another Flow or an already queued companion refuses expansion rather than queueing fragments', async () => {
  queue.upcoming = [{ track: songs[2]!, flow: { occurrenceId: 'busy' } as never }];
  assert.equal((await submit(songs[1]!)).status, 409); assert.equal(streams, 0);
  queue.upcoming = [{ track: songs[2]! }];
  assert.equal((await submit(songs[1]!)).status, 409);
  assert.deepEqual(queue.upcoming.map(item => item.track.id), [songs[2]!.id]);
  assert.deepEqual(await readdir(join(config.stateDir, 'sub-flow-playback')), []);
});
test('a disabled definition retains ordinary operator queuing, including explicit duplicates', async () => {
  save({ ...definition, enabled: false });
  for (let count = 0; count < 2; count++) {
    const result = await submit(songs[1]!);
    assert.equal(result.status, 200); assert.equal(result.body.flow, undefined);
  }
  assert.deepEqual(queue.upcoming.map(item => item.track.id), [songs[1]!.id, songs[1]!.id]);
  assert.equal(streams, 0);
});


