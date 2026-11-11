import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const stateDir = mkdtempSync(join(tmpdir(), 'subwave-subbeats-airplay-'));
process.env.STATE_DIR = stateDir;
process.env.ANALYZE_URL = 'http://127.0.0.1:9';
process.env.ANALYZE_PYTHON = '';
const db = await import('../src/music/library-db.js');
const library = await import('../src/music/library.js');
const settings = await import('../src/settings.js');
const { createSubbeatsStore } = await import('../src/music/subbeats-store.js');
const { queueAiredTrack, queueRecentAiredTracks } = await import('../src/music/subbeats-airplay.js');
await library.load();
await settings.load();

for (const [id, bpm, genre] of [
  ['eligible', 120, 'House'], ['wrong-tempo', 80, 'House'], ['wrong-genre', 120, 'Rock'], ['recent', 130, 'Trance'],
] as const) {
  db.upsertTrackMeta(id, { title: id, artist: 'Artist', genres: [genre] });
  db.getDb()!.prepare('UPDATE tracks SET bpm=? WHERE id=?').run(bpm, id);
}
const play = (trackId: string, playedAt: string) => db.recordPlay({
  trackId, title: trackId, artist: 'Artist', album: null, playedAt, source: 'auto', requestedBy: null,
  showId: null, showName: null,
});
play('eligible', new Date().toISOString());
play('recent', new Date(Date.now() - 30 * 86_400_000).toISOString());
play('wrong-tempo', new Date().toISOString());

const store = createSubbeatsStore(stateDir);
after(() => { db.close(); rmSync(stateDir, { recursive: true, force: true }); });

test('on-air demand queues qualifying tracks only when the opt-in is enabled', async () => {
  queueAiredTrack('eligible');
  assert.equal(store.read().jobs.length, 0);
  await settings.update({ transitions: { subbeatsOnAirCaching: true } });
  queueAiredTrack('eligible');
  queueAiredTrack('wrong-tempo');
  queueAiredTrack('wrong-genre');
  assert.deepEqual(store.read().jobs.map(job => job.id), ['eligible']);
  store.event({ id: 'eligible', status: 'running' }, ['eligible']);
  store.event({ id: 'eligible', status: 'prepared', bundleKey: 'a'.repeat(64) }, ['eligible']);
  queueAiredTrack('eligible');
  assert.equal(store.read().jobs.find(job => job.id === 'eligible')?.status, 'prepared');
});

test('the next-scan seed uses the last 180 days and does not retry existing jobs', async () => {
  assert.equal(queueRecentAiredTracks(), 1);
  assert.deepEqual(store.read().jobs.map(job => job.id), ['eligible', 'recent']);
  store.event({ id: 'recent', status: 'running' }, ['recent']);
  store.event({ id: 'recent', status: 'failed' }, ['recent']);
  assert.equal(queueRecentAiredTracks(), 0);
  assert.equal(store.read().jobs.find(job => job.id === 'recent')?.status, 'failed');
});
