import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, type ServerResponse } from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('airplay prepares V2 cues without V1 writes or separation, yields to picks, and resumes after restart', async t => {
  const ids = ['eligible', 'negative', 'failure', 'priority', 'quiet', 'restart', 'manual', 'airplay-priority', 'off', 'wrong-tempo', 'wrong-genre'];
  const sources = new Map(ids.map((id, index) => [id, Buffer.alloc(2048, index+1)]));
  const prepared: string[] = [], downloaded: string[] = [];
  let held: ServerResponse | undefined;
  let holdDownload = false;
  const server = createServer(async (req, res) => {
    if (req.url === '/health') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, engines: ['analyze'] })); return;
    }
    if (req.url?.startsWith('/rest/stream')) {
      const id = new URL(req.url, 'http://fixture').searchParams.get('id')!;
      downloaded.push(id);
      res.setHeader('Content-Type', 'audio/flac');
      if ((id === 'priority' || id === 'restart') && holdDownload) held = res;
      else res.end(sources.get(id));
      return;
    }
    assert.equal(req.url, '/prepare-subbeats-v2', 'automatic work must never request extraction or rendering');
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw), bytes = await readFile(body.path);
    const id = ids[bytes[0]-1];
    assert.equal(body.complete, true);
    assert.equal(body.source_bytes, bytes.length);
    assert.equal(body.source_sha256, createHash('sha256').update(bytes).digest('hex'));
    prepared.push(id);
    res.setHeader('Content-Type', 'application/json');
    if (id === 'failure') {
      res.statusCode = 500; res.end(JSON.stringify({ detail: 'Fixture cue analysis refusal' })); return;
    }
    const role = (sourceSeconds: number) => ({ status: id === 'negative' ? 'no-cue' : 'cue-ready',
      reason: id === 'negative' ? 'No measured cue.' : null,
      cuePoints: id === 'negative' ? [] : [{ sourceSeconds, bpm: 120, strength: 1, reason: 'arrangement' }],
      coverageStartSeconds: 0, coverageEndSeconds: 120 });
    res.end(JSON.stringify({ ok: true, subbeats_prep_v2_result: {
      source: { sha256: body.source_sha256, bytes: bytes.length, durationSeconds: 120 },
      grid: { version: 1, backend: 'beat-this-onnx', model: 'small0', modelSha256: 'a'.repeat(64),
        preprocessingVersion: 1, sourceSha256: body.source_sha256, sourceBytes: bytes.length,
        windowStartSeconds: 0, windowEndSeconds: 120,
        beatsSeconds: Array.from({ length: 240 }, (_, i) => i*.5),
        downbeatsSeconds: Array.from({ length: 60 }, (_, i) => i*2) },
      roles: { incoming: role(32), outgoing: role(90) },
    } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    held?.destroy(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  process.env.ANALYZE_URL = process.env.NAVIDROME_URL = process.env.LRCLIB_URL = `http://127.0.0.1:${address.port}`;
  process.env.NAVIDROME_USER = 'u'; process.env.NAVIDROME_PASS = 'p';
  const { config } = await import('../src/config.js');
  const settings = await import('../src/settings.js');
  const library = await import('../src/music/library.js');
  const db = await import('../src/music/library-db.js');
  const analyzer = await import('../src/music/analyzer.js');
  const { createSubbeatsPrepV2Store } = await import('../src/music/subbeats-prep-v2-store.js');
  const prep = await import('../src/music/subbeats-prep-v2-library.js');
  const { queue } = await import('../src/broadcast/queue.js');
  queue.autoPick = false;
  t.after(() => {
    prep.updateStemBeatsAirplayPreparation(() => false);
    if (queue._persistTimer) clearTimeout(queue._persistTimer);
    if (queue._recentPlaysTimer) clearTimeout(queue._recentPlaysTimer);
    analyzer.shutdown(); library.shutdown(); db.close();
  });
  await settings.load(); await library.load();
  for (const id of ids) {
    db.upsertTrackMeta(id, { title: id, artist: 'Fixture', album: '', duration: 120, fileSize: sources.get(id)!.length,
      genres: [id === 'wrong-genre' ? 'Rock' : 'House'] });
    db.upsertTrackAnalysis(id, { bpm: id === 'wrong-tempo' ? 80 : 120 });
  }
  const store = createSubbeatsPrepV2Store(config.stateDir);
  const waitFor = async (ready: () => boolean) => {
    const until = Date.now()+10000;
    while (!ready() && Date.now()<until) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(ready(), 'automatic preparation settled');
  };
  const latest = (id: string) => store.listRuns().flatMap(run => run.jobs).filter(job => job.id === id).at(-1);
  const legacy = join(config.stateDir, 'subbeats', 'queue.json');
  await mkdir(join(config.stateDir, 'subbeats'), { recursive: true });
  const v1 = JSON.stringify({ version: 1, paused: true, jobs: [] });
  await writeFile(legacy, v1);
  await prep.queueAiredStemBeatsTrack('eligible');
  assert.equal(store.listRuns().length, 0, 'disabled features do not create work');
  await settings.update({ transitions: { stemsStyle: 'new-style', stemBlends: true, newStyleStemBeats: true, subbeatsLive: true, subbeatsOnAirCaching: true },
    lyrics: { enabled: false } });
  let allowed = false;
  prep.updateStemBeatsAirplayPreparation(() => allowed);
  queue.onTrackStarted({ subsonic_id: 'eligible', title: 'eligible', artist: 'Fixture' } as never);
  await waitFor(() => store.listRuns().length === 1);
  assert.equal(queue.current?.track.id, 'eligible', 'the now-playing watcher completes without waiting for preparation');
  assert.equal(await readFile(legacy, 'utf8'), v1, 'the live hook does not use V1 even with its old setting enabled');
  for (const id of ['eligible', 'negative', 'failure', 'wrong-tempo', 'wrong-genre', 'missing'])
    await prep.queueAiredStemBeatsTrack(id);
  const run = store.listRuns()[0];
  assert.deepEqual(run.jobs.map(job => job.id), ['eligible', 'negative', 'failure']);
  assert.equal(store.listRuns().length, 1, 'plays are grouped instead of creating thousands of run files');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(downloaded.length, 0, 'an immediate transition defers even source acquisition');
  prep.pauseSubbeatsPrepV2(run.runId, true);
  allowed = true; prep.updateStemBeatsAirplayPreparation(() => allowed);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(prepared.length, 0, 'automatic resume respects an operator pause');
  prep.pauseSubbeatsPrepV2(run.runId, false);
  await waitFor(() => latest('failure')?.status === 'failed' && !prep.subbeatsPrepV2RunActive(run.runId));
  assert.deepEqual(prepared, ['eligible', 'negative', 'failure']);
  assert.equal(prep.latestSubbeatsPrepV2Role('eligible', 'incoming').state, 'cue-ready', 'later picks see new V2 results');
  assert.equal(prep.latestSubbeatsPrepV2Role('negative', 'outgoing').state, 'no-cue');
  assert.ok((latest('eligible')?.durationMs ?? -1) >= 0, 'prep duration remains recorded');
  for (const id of ['eligible', 'negative', 'failure']) await prep.queueAiredStemBeatsTrack(id);
  assert.equal(store.listRuns()[0].jobs.length, 3, 'completed, negative and failed attempts are not retried every play');

  holdDownload = true;
  await prep.queueAiredStemBeatsTrack('priority');
  await waitFor(() => !!held);
  allowed = false; prep.updateStemBeatsAirplayPreparation(() => allowed);
  held!.end(sources.get('priority')); held = undefined;
  await waitFor(() => latest('priority')?.status === 'queued' && !prep.subbeatsPrepV2RunActive(run.runId));
  assert.equal(prepared.length, 3, 'a priority change during download prevents cue analysis');
  assert.deepEqual(await readdir(join(config.stateDir, 'stems', 'stembeats', 'tmp')), [], 'deferred sources are removed');
  holdDownload = false; allowed = true; prep.updateStemBeatsAirplayPreparation(() => allowed);
  await waitFor(() => latest('priority')?.status === 'complete');
  await settings.update({ audio: { analyzeQuietOnly: true } });
  await prep.queueAiredStemBeatsTrack('quiet');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(latest('quiet')?.status, 'queued');
  assert.ok(!downloaded.includes('quiet'), 'quiet-only policy does not start on-air preparation');
  await settings.update({ audio: { analyzeQuietOnly: false } });
  prep.updateStemBeatsAirplayPreparation(() => allowed);
  await waitFor(() => latest('quiet')?.status === 'complete');

  // A different recording version gets new evidence and leaves the old result available.
  allowed = false; prep.updateStemBeatsAirplayPreparation(() => allowed);
  sources.set('eligible', Buffer.alloc(4096, 1));
  db.upsertTrackMeta('eligible', { title: 'eligible', artist: 'Fixture', album: '', duration: 120,
    fileSize: 4096, genres: ['House'] });
  db.clearTrackAudio('eligible', 4096); // the library walk's recording-replacement step
  db.upsertTrackAnalysis('eligible', { bpm: 120 });
  assert.equal(db.trackFileSize('eligible'), 4096);
  assert.ok(db.subbeatsEligibleTrack('eligible'));
  await prep.queueAiredStemBeatsTrack('eligible');
  assert.equal(store.listRuns().length, 2);
  assert.equal(store.read(run.runId).jobs.find(job => job.id === 'eligible')?.source?.bytes, 2048);
  allowed = true; prep.updateStemBeatsAirplayPreparation(() => allowed);
  await waitFor(() => latest('eligible')?.source?.bytes === 4096 && latest('eligible')?.status === 'complete');
  assert.equal(prepared.filter(id => id === 'eligible').length, 2);
  allowed = false;
  prep.updateStemBeatsAirplayPreparation(() => allowed);
  await waitFor(() => !store.listRuns().some(item => prep.subbeatsPrepV2RunActive(item.runId)));

  // Operator-started library runs also yield at request boundaries while a
  // pick-time drain owns priority, then resume the same queued job afterward.
  let pickBusy = true;
  prep.updateStemBeatsAirplayPreparation(() => allowed, () => pickBusy);
  const manualRun = store.createRun({ baselineSha256: null, scope: 'library', algorithmVersion: 4,
    jobs: [{ id: 'manual', title: 'manual', artist: 'Fixture', album: '', v1: null }] });
  prep.startSubbeatsPrepV2(manualRun.runId);
  await waitFor(() => prep.subbeatsPrepV2WaitingForPickTime(manualRun.runId));
  assert.equal(downloaded.includes('manual'), false, 'manual library work waits while a live pick owns priority');
  await prep.queueAiredStemBeatsTrack('airplay-priority');
  pickBusy = false;
  prep.notifyStemBeatsPickTimePriorityChanged();
  await waitFor(() => latest('manual')?.status === 'complete');
  assert.ok(prepared.indexOf('airplay-priority') < prepared.indexOf('manual'),
    'on-air automatic preparation takes priority over the deferred library run');
  assert.equal(prep.subbeatsPrepV2WaitingForPickTime(manualRun.runId), false);

  holdDownload = true;
  allowed = true;
  prep.updateStemBeatsAirplayPreparation(() => allowed);
  await prep.queueAiredStemBeatsTrack('restart');
  await waitFor(() => !!held);
  db.close(); // simulate controller shutdown in the middle of source acquisition
  held!.end(sources.get('restart')); held = undefined; holdDownload = false;
  const restartRun = store.listRuns().at(-1)!;
  await waitFor(() => latest('restart')?.status === 'queued' && !prep.subbeatsPrepV2RunActive(restartRun.runId));
  assert.ok(!prepared.includes('restart'), 'shutdown must not fail or analyze the pending job');
  const modulePath = (name: string) => JSON.stringify(fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url)));
  const resumed = await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    const settings = await import(${modulePath('settings')});
    const library = await import(${modulePath('music/library')});
    const db = await import(${modulePath('music/library-db')});
    const analyzer = await import(${modulePath('music/analyzer')});
    const prep = await import(${modulePath('music/subbeats-prep-v2-library')});
    await settings.load(); await library.load();
    prep.updateStemBeatsAirplayPreparation(() => true);
    const until = Date.now()+8000;
    while (prep.latestSubbeatsPrepV2Role('restart','incoming').state !== 'cue-ready' && Date.now()<until)
      await new Promise(resolve => setTimeout(resolve,10));
    const ready = prep.latestSubbeatsPrepV2Role('restart','incoming').state === 'cue-ready';
    prep.updateStemBeatsAirplayPreparation(() => false);
    analyzer.shutdown(); library.shutdown(); db.close();
    if (!ready) throw new Error('persisted airplay preparation did not resume');
    console.log('resumed persisted airplay job');
  `], { timeout: 15000 });
  assert.match(resumed.stdout, /resumed persisted airplay job/);
  assert.equal(latest('restart')?.status, 'complete');
  assert.equal(await readFile(legacy, 'utf8'), v1, 'all automatic work leaves V1 bytes unchanged');
});
