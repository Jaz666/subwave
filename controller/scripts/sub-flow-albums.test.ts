import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import test from 'node:test';
import { removeTempDir } from './test-utils/temp-dir.js';

const stateRoot = mkdtempSync(join(tmpdir(), 'subwave-flow-albums-'));
process.env.STATE_DIR = stateRoot;
process.env.NAVIDROME_URL = 'http://navidrome.test:4533';
process.env.NAVIDROME_USER = 'dj';
process.env.NAVIDROME_PASS = 'test';
const subsonic = await import('../src/music/subsonic.js');
const { router } = await import('../src/routes/library/sub-flow.js');
const originalFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = originalFetch; return removeTempDir(stateRoot); });

test('album search and album tracks use the library catalog', async () => {
  const calls: URL[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input));
    if (url.hostname !== 'navidrome.test') return originalFetch(input);
    calls.push(url);
    const result = url.pathname.endsWith('/search3')
      ? { searchResult3: { album: [{ id: 'album-1', name: 'Get a Grip', artist: 'Aerosmith' }] } }
      : { album: { song: [{ id: 'one', title: 'Intro' }, { id: 'two', title: 'Eat the Rich' }] } };
    return new Response(JSON.stringify({ 'subsonic-response': { status: 'ok', ...result } }), { status: 200 });
  }) as typeof fetch;
  assert.deepEqual(await subsonic.searchAlbums('Get a Grip'), [{ id: 'album-1', name: 'Get a Grip', artist: 'Aerosmith' }]);
  assert.deepEqual((await subsonic.getAlbum('album-1')).map((song: any) => song.id), ['one', 'two']);
  assert.equal(calls[0]?.searchParams.get('albumCount'), '50');
  assert.equal(calls[0]?.searchParams.get('songCount'), '0');
  assert.equal(calls[1]?.searchParams.get('id'), 'album-1');

  const app = express();
  app.use(router);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    assert.equal((await fetch(`${base}/library/sub-flow/albums`)).status, 400);
    const albums = await (await fetch(`${base}/library/sub-flow/albums?q=Get%20a%20Grip`)).json() as any;
    assert.equal(albums.albums[0].name, 'Get a Grip');
    const tracks = await (await fetch(`${base}/library/sub-flow/albums/album-1/tracks`)).json() as any;
    assert.deepEqual(tracks.tracks.map((song: any) => song.title), ['Intro', 'Eat the Rich']);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
