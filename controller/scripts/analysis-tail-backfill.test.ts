// Exercise the real scan orchestration, staging and SQLite writes against a
// loopback analyzer: selected tail work must not repeat a capped head scan.
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, beforeEach } from 'node:test';
import { createTempDir, removeTempDir } from './test-utils/temp-dir.js';

const state = createTempDir(join(tmpdir(), 'subwave-tail-backfill-'));
const requests: Array<Record<string, unknown> & { stagedBytes: number }> = [];
let sourceBytes = 4096;
let rejectStaging = false;
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/health') {
    res.end(JSON.stringify({ ok: true, engines: ['analyze'], analyze_audio_capable: false,
      analyze_vocal_capable: true, analyze_tail_vocal_capable: true }));
  } else if (req.url === '/analyze') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const job = JSON.parse(body);
      requests.push({ ...job, stagedBytes: job.path ? statSync(job.path).size : 0 });
      if (rejectStaging && job.path) {
        res.statusCode = 422;
        res.end(JSON.stringify({ detail: { code: 'path_unavailable', message: 'staging mount missing' } }));
        return;
      }
      res.end(JSON.stringify({ ok: true, bpm: 120, key: 'Am', intro_ms: 0, confidence: 0.9,
        ...(job.vocal === true ? { vocal_ranges: [] } : {}),
        ...(job.complete ? { outro: { startMs: 230000, ending: 'fade',
          ...(job.vocal === true ? { vocalRanges: [] } : {}) } } : {}),
      }));
    });
  } else if (req.url?.includes('/stream')) {
    res.setHeader('Content-Type', 'audio/flac');
    res.end(Buffer.alloc(sourceBytes, 1));
  } else {
    res.end(JSON.stringify({ 'subsonic-response': { status: 'ok', lyricsList: { structuredLyrics: [] } } }));
  }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
process.env.STATE_DIR = state;
process.env.NAVIDROME_URL = process.env.ANALYZE_URL = `http://127.0.0.1:${address.port}`;
process.env.NAVIDROME_USER = process.env.NAVIDROME_PASS = 'test';
process.env.ANALYZE_MAX_BYTES = '1024';
process.env.ANALYZE_VOCAL_ACTIVITY = '1';
process.env.ANALYZE_WHOLE_FILE = '0';
delete process.env.ANALYZE_AUDIO_EMBEDDING;
const db = await import('../src/music/library-db.js');
const analyzer = await import('../src/music/analyzer.js');
const settings = await import('../src/settings.js');
const { runAnalysisPass } = await import('../src/music/analyze.js');
await db.open({ embeddingDim: 8, adoptStoredDim: true });
await settings.load();
await settings.update({ audio: { vocalActivity: true, stemCache: false, embeddings: false } });

beforeEach(() => {
  db.requireDb().exec('DELETE FROM track_facet_status; DELETE FROM tracks');
  requests.length = 0;
  sourceBytes = 4096;
  rejectStaging = false;
});
after(async () => {
  analyzer.shutdown();
  db.close();
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await removeTempDir(state);
});

function seedTail(id: string, bytes: number | undefined = sourceBytes) {
  db.upsertTrackMeta(id, { title: id, artist: 'Fixture', duration: 240, fileSize: bytes });
  db.upsertTrackAnalysis(id, { bpm: 120, vocalRanges: [],
    outro: { startMs: 230000, ending: 'fade', lufs: null, bpm: null, beats: null, bars: null } });
}

test('selected tail backfill obtains complete audio and settles in one pass', async () => {
  seedTail('tail');
  assert.ok(db.needsVocalIds(undefined, true).includes('tail'));
  const result = await runAnalysisPass({ vocalBackfill: true, audioBackfill: false, stemBackfill: false });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].complete, true);
  assert.equal(requests[0].stagedBytes, sourceBytes);
  assert.deepEqual(db.getTrack('tail')!.outro!.vocalRanges, []);
  assert.ok(!db.needsVocalIds(undefined, true).includes('tail'));
  assert.equal(result.vocalTailAnalyzed, 1);
  assert.equal(result.vocalTailPending, 0);
  await runAnalysisPass({ vocalBackfill: true, audioBackfill: false, stemBackfill: false });
  assert.equal(requests.length, 1, 'a second scan does not repeat completed work');
});

test('an explicit vocal opt-out overrides enabled settings and keeps the head download capped', async () => {
  db.upsertTrackMeta('head', { title: 'Head', artist: 'Fixture', duration: 240, fileSize: sourceBytes });
  await runAnalysisPass({ vocalBackfill: false, audioBackfill: false, stemBackfill: false });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].vocal, false);
  assert.equal(requests[0].complete, false);
  assert.equal(requests[0].stagedBytes, 1024);
  assert.equal(db.getTrack('head')!.vocalRanges, null);
});

test('a grid-only record does not launch vocal work for an already measured head', async () => {
  db.upsertTrackMeta('grid', { title: 'Grid', artist: 'Fixture', duration: 240, fileSize: sourceBytes });
  db.upsertTrackAnalysis('grid', { bpm: 120, vocalRanges: [] });
  db.requireDb().prepare('UPDATE tracks SET outro_json = ? WHERE id = ?').run(
    JSON.stringify({ beats: [0, 500], bars: [0], gridProvenance: {} }), 'grid');
  const result = await runAnalysisPass({ vocalBackfill: true, audioBackfill: false, stemBackfill: false });
  assert.equal(result.scope, 0);
  assert.equal(requests.length, 0);
});

test('a source exceeding the metadata bound fails clearly instead of repeating a successful head scan', async () => {
  seedTail('changed', 2048);
  const result = await runAnalysisPass({ vocalBackfill: true, audioBackfill: false, stemBackfill: false });
  assert.equal(result.failed, 1);
  assert.equal(requests.length, 0);
  assert.match(db.analysisFailures()[0].error ?? '', /complete recording.*byte limit/);
  assert.ok(db.needsVocalIds(undefined, true).includes('changed'));
});

test('a missing shared mount cannot downgrade selected tail work to a capped URL retry', async () => {
  seedTail('mount-missing');
  rejectStaging = true;
  const result = await runAnalysisPass({ vocalBackfill: true, audioBackfill: false, stemBackfill: false });
  assert.equal(result.failed, 1);
  assert.equal(requests.length, 1, 'no second capped request is sent');
  assert.match(db.analysisFailures()[0].error ?? '', /shared state mount/);
});
