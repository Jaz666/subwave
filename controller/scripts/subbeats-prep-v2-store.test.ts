import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createSubbeatsPrepV2Store, subbeatsPrepV2BaselineMatches, subbeatsPrepV2TimingSummary } from '../src/music/subbeats-prep-v2-store.js';

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'subbeats-prep-v2-'));
  roots.push(root);
  return root;
}
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test('V2 baseline allows unrelated queued additions but rejects V1 changes or new supported tracks', () => {
  const store = createSubbeatsPrepV2Store(tempRoot());
  const run = store.createRun({
    baselineSha256: 'c'.repeat(64), scope: 'supported', algorithmVersion: 1,
    jobs: [{ ...v1Job, id: 'track-a', title: 'A', artist: 'Artist', album: 'Album', headSupported: true,
      tailSupported: false, preparationMethod: 'small0', bundleKey: 'd'.repeat(64),
      cuePoints: emptyCuePoints, cueCoverage: emptyCoverage, suitability }],
  });
  const supportedJob = {
    id: 'track-a', title: 'A', artist: 'Artist', album: 'Album', status: 'prepared' as const,
    attempts: 1, error: null, updatedAt: v1Job.updatedAt, preparationMethod: 'small0' as const,
    bundleKey: 'd'.repeat(64), cuePoints: emptyCuePoints, cueCoverage: emptyCoverage, suitability,
  };
  const queuedJob = { id: 'new', title: 'New', artist: 'Artist', album: 'Album', status: 'queued' as const,
    attempts: 0, error: null, updatedAt: v1Job.updatedAt, bundleKey: null };
  const queue = { version: 1 as const, paused: true, jobs: [supportedJob, queuedJob] };
  assert.equal(subbeatsPrepV2BaselineMatches(run, queue), true);
  assert.equal(subbeatsPrepV2BaselineMatches(run, { ...queue, jobs: [
    { ...supportedJob, attempts: 2 }, queuedJob,
  ] }), false);
  assert.equal(subbeatsPrepV2BaselineMatches(run, { ...queue, jobs: [
    supportedJob, queuedJob, { ...supportedJob, id: 'new-supported' },
  ] }), false);
  const selectedRun = store.createRun({
    baselineSha256: 'c'.repeat(64), scope: 'selected', algorithmVersion: 1,
    jobs: [{ ...v1Job, id: 'track-a', title: 'A', artist: 'Artist', album: 'Album', headSupported: true,
      tailSupported: false, preparationMethod: 'small0', bundleKey: 'd'.repeat(64),
      cuePoints: emptyCuePoints, cueCoverage: emptyCoverage, suitability }],
  });
  assert.equal(subbeatsPrepV2BaselineMatches(selectedRun, { ...queue, jobs: [
    supportedJob, queuedJob, { ...supportedJob, id: 'new-supported' },
  ] }), true);
});

const emptyCuePoints = { version: 1 as const, model: 'small0' as const, artifactKey: 'a'.repeat(64), incoming: [], outgoing: [] };
const emptyCoverage = { version: 1 as const, artifactKey: 'b'.repeat(64), incoming: null, outgoing: null };
const v1Job = { status: 'prepared' as const, attempts: 1, error: null,
  updatedAt: '2026-11-20T00:00:00Z', task: null, lyricEvidence: null };
const suitability = {
  version: 1 as const, assessedAt: '2026-11-20T00:00:00Z',
  incoming: { level: 'subbeat' as const, bpm: 120, cueSeconds: 32, leadSeconds: null, postSeconds: null, reason: 'V1 head' },
  outgoing: { level: 'regular' as const, bpm: 120, cueSeconds: null, leadSeconds: null, postSeconds: null, reason: 'V1 tail' },
};

test('V2 run stores a V1 comparison snapshot without touching the V1 queue', () => {
  const stateDir = tempRoot();
  const v1Path = join(stateDir, 'subbeats', 'queue.json');
  const v1Queue = JSON.stringify({ version: 1, paused: true, jobs: [{ id: 'track-a', status: 'prepared' }] });
  mkdirSync(join(stateDir, 'subbeats'), { recursive: true });
  writeFileSync(v1Path, v1Queue);
  const store = createSubbeatsPrepV2Store(stateDir);
  const run = store.createRun({
    baselineSha256: 'c'.repeat(64), algorithmVersion: 1,
    jobs: [{ ...v1Job, id: 'track-a', title: 'A', artist: 'Artist', album: 'Album', headSupported: true,
      tailSupported: false, preparationMethod: 'small0', bundleKey: 'd'.repeat(64),
      cuePoints: emptyCuePoints, cueCoverage: emptyCoverage, suitability }],
  });
  assert.equal(readFileSync(v1Path, 'utf8'), v1Queue);
  assert.equal(store.read(run.runId).jobs[0]?.v1?.headSupported, true);
  assert.equal(store.read(run.runId).jobs[0]?.v1?.tailSupported, false);
  assert.deepEqual(store.listRuns().map(item => item.runId), [run.runId]);
  assert.equal(readFileSync(join(stateDir, 'stems', 'stembeats', 'runs', run.runId, 'run.json'), 'utf8').length > 0, true);
});

test('V2 run activity events persist as a capped run log', () => {
  const store = createSubbeatsPrepV2Store(tempRoot());
  const run = store.createRun({ baselineSha256: null, algorithmVersion: 4,
    jobs: [{ id: 'event-track', title: 'Event Track', artist: 'Artist', album: 'Album' }] });
  for (let i = 0; i < 105; i++) store.addEvent(run.runId, 'info', `event ${i}`);
  const events = store.read(run.runId).events!;
  assert.equal(events.length, 100);
  assert.equal(events[0]?.text, 'event 5');
  assert.equal(events.at(-1)?.text, 'event 104');
});

test('V2 can resume legacy runs and leaves their data in the original location', () => {
  const stateDir = tempRoot();
  const store = createSubbeatsPrepV2Store(stateDir);
  const run = store.createRun({
    baselineSha256: 'c'.repeat(64), algorithmVersion: 1,
    jobs: [{ ...v1Job, id: 'legacy-run-track', title: 'Legacy', artist: 'Artist', album: 'Album',
      headSupported: true, tailSupported: false, preparationMethod: null, bundleKey: null,
      cuePoints: null, cueCoverage: null, suitability: null }],
  });
  const from = join(stateDir, 'stems', 'stembeats', 'runs', run.runId);
  const to = join(stateDir, 'subbeats', 'prep-v2', 'runs', run.runId);
  mkdirSync(join(stateDir, 'subbeats', 'prep-v2', 'runs'), { recursive: true });
  renameSync(from, to);
  assert.equal(store.read(run.runId).runId, run.runId);
  assert.equal(store.listRuns().length, 1);
  assert.ok(store.claim(run.runId, 'legacy-run-track'));
  assert.equal(existsSync(join(to, 'run.json')), true);
  assert.equal(existsSync(from), false);
});

test('V2 reads the former nested Stem Beats run location after moving new runs up one level', () => {
  const stateDir = tempRoot();
  const store = createSubbeatsPrepV2Store(stateDir);
  const run = store.createRun({ baselineSha256: null, algorithmVersion: 4,
    jobs: [{ id: 'nested-run-track', title: 'Nested', artist: 'Artist', album: 'Album' }] });
  const from = join(stateDir, 'stems', 'stembeats', 'runs', run.runId);
  const previous = join(stateDir, 'stems', 'stembeats', 'prep-v2', 'runs', run.runId);
  mkdirSync(join(stateDir, 'stems', 'stembeats', 'prep-v2', 'runs'), { recursive: true });
  renameSync(from, previous);
  assert.equal(store.read(run.runId).runId, run.runId);
  assert.equal(store.listRuns().length, 1);
  assert.equal(existsSync(previous), true);
  assert.equal(existsSync(from), false);
});

test('V2 shared-grid artifacts are source-bound, immutable and checksum verified', () => {
  const stateDir = tempRoot();
  const store = createSubbeatsPrepV2Store(stateDir);
  const run = store.createRun({
    baselineSha256: 'c'.repeat(64), algorithmVersion: 1,
    jobs: [{ ...v1Job, id: 'track-b', title: 'B', artist: 'Artist', album: 'Album', headSupported: false,
      tailSupported: false, preparationMethod: null, bundleKey: null,
      cuePoints: null, cueCoverage: null, suitability: null }],
  });
  const grid = {
    version: 1 as const, backend: 'beat-this-onnx' as const, model: 'small0' as const,
    device: 'gpu' as const,
    modelSha256: 'e'.repeat(64), preprocessingVersion: 1 as const,
    sourceSha256: 'f'.repeat(64), sourceBytes: 4096,
    windowStartSeconds: 0, windowEndSeconds: 32,
    beatsSeconds: Array.from({ length: 64 }, (_, i) => i * 0.5),
    downbeatsSeconds: Array.from({ length: 16 }, (_, i) => i * 2),
  };
  const key = store.writeGridArtifact(run.runId, 'track-b', 'incoming', grid);
  assert.deepEqual(store.readGridArtifact(run.runId, key), grid);
  store.claim(run.runId, 'track-b');
  store.setGridArtifact(run.runId, 'track-b', 'incoming', key);
  assert.equal(store.read(run.runId).jobs[0]?.roles.incoming.gridArtifact, key);
  const artifactPath = join(stateDir, 'stems', 'stembeats', 'runs', run.runId, 'artifacts', `${key}.json`);
  writeFileSync(artifactPath, 'changed');
  assert.throws(() => store.readGridArtifact(run.runId, key), /integrity check/);
});

test('V2 retries failed recordings while preserving source-changed refusals', () => {
  const stateDir = tempRoot();
  const store = createSubbeatsPrepV2Store(stateDir);
  const run = store.createRun({
    baselineSha256: 'c'.repeat(64), algorithmVersion: 1,
    jobs: ['retry-me', 'changed'].map(id => ({ ...v1Job, id, title: id, artist: 'Artist', album: 'Album',
      headSupported: true, tailSupported: false, preparationMethod: null, bundleKey: null,
      cuePoints: null, cueCoverage: null, suitability: null })),
  });
  const first = store.claim(run.runId, 'retry-me')!;
  assert.equal(first.stage, 'downloading');
  store.setStage(run.runId, first.id, 'analyzing');
  assert.equal(store.read(run.runId).jobs[0]?.stage, 'analyzing');
  store.complete(run.runId, first.id, {
    source: { sha256: 'f'.repeat(64), bytes: 4096, durationSeconds: 120 },
    diagnostics: { gridSource: 'computed', gridDevice: 'gpu', incomingFallbackUsed: true,
      stageTimingsMs: { decodeMs: 400, gridMs: 6500, cueFitMs: 80, incomingFallbackMs: 21000, totalAnalyzerMs: 28000 } },
    roles: {
      incoming: { status: 'no-cue', reason: 'No incoming passage.', cuePoints: [], gridArtifact: null,
        coverageStartSeconds: 0, coverageEndSeconds: 32 },
      outgoing: { status: 'failed', reason: 'Temporary analyzer failure.', cuePoints: [], gridArtifact: null,
        coverageStartSeconds: null, coverageEndSeconds: null },
    },
  });
  const completed = store.read(run.runId).jobs[0]!;
  assert.equal(completed.status, 'complete');
  assert.ok(typeof completed.durationMs === 'number' && completed.durationMs >= 0);
  assert.deepEqual(subbeatsPrepV2TimingSummary(store.read(run.runId)), {
    completedJobs: 1, averagePrepMs: completed.durationMs, totalPrepMs: completed.durationMs,
    measuredJobs: 1, computedGridJobs: 1, selectedGpuGridJobs: 1, selectedCpuGridJobs: 0, incomingFallbackJobs: 1,
    averageDecodeMs: 400, averageGridMs: 6500, averageCueFitMs: 80,
    averageIncomingFallbackMs: 21000, averageAnalyzerMs: 28000,
  });
  const second = store.claim(run.runId, 'changed')!;
  store.fail(run.runId, second.id, 'library recording changed', true);
  const retried = store.retryFailed(run.runId);
  assert.equal(retried.status, 'queued');
  assert.equal(retried.jobs.find(job => job.id === 'retry-me')?.status, 'queued');
  assert.equal(retried.jobs.find(job => job.id === 'retry-me')?.attempts, 1);
  assert.equal(retried.jobs.find(job => job.id === 'retry-me')?.roles.incoming.status, 'no-cue');
  assert.equal(retried.jobs.find(job => job.id === 'retry-me')?.roles.outgoing.status, 'pending');
  assert.equal(retried.jobs.find(job => job.id === 'changed')?.status, 'source-changed');
  assert.throws(() => store.retryFailed(run.runId), /no retryable/);
});

test('V2 pick-time lookup returns the newest completed recording evidence by track ID', async () => {
  const store = createSubbeatsPrepV2Store(tempRoot());
  const create = (algorithmVersion = 4) => store.createRun({
    baselineSha256: null, scope: 'track', algorithmVersion,
    jobs: [{ id: 'track-a', title: 'A', artist: 'Artist', album: 'Album' }],
  });
  const first = create(3);
  const older = store.claim(first.runId, 'track-a')!;
  store.complete(first.runId, older.id, {
    source: { sha256: 'a'.repeat(64), bytes: 4096, durationSeconds: 180 },
    roles: {
      incoming: { status: 'cue-ready', reason: null, cuePoints: [], gridArtifact: null,
        coverageStartSeconds: 0, coverageEndSeconds: 32 },
      outgoing: { status: 'no-cue', reason: 'No tail cue.', cuePoints: [], gridArtifact: null,
        coverageStartSeconds: null, coverageEndSeconds: null },
    },
  });
  await store.primeLatestCompleteJobs();
  assert.equal(store.latestCompleteJob('track-a')?.runId, first.runId);
  const second = create();
  const newer = store.claim(second.runId, 'track-a')!;
  store.complete(second.runId, newer.id, {
    source: { sha256: 'b'.repeat(64), bytes: 4096, durationSeconds: 180 },
    roles: {
      incoming: { status: 'no-cue', reason: 'No head cue.', cuePoints: [], gridArtifact: null,
        coverageStartSeconds: null, coverageEndSeconds: null },
      outgoing: { status: 'cue-ready', reason: null, cuePoints: [], gridArtifact: null,
        coverageStartSeconds: 140, coverageEndSeconds: 180 },
    },
  });
  assert.equal(store.latestCompleteJob('track-a')?.runId, second.runId);
  assert.equal(store.latestCompleteJob('track-a')?.job.source?.sha256, 'b'.repeat(64));
  assert.equal(store.latestCompleteJob('missing'), null);

  const unsupported = create(2);
  const oldVersion = store.claim(unsupported.runId, 'track-a')!;
  store.complete(unsupported.runId, oldVersion.id, {
    source: { sha256: 'c'.repeat(64), bytes: 4096, durationSeconds: 180 },
    roles: {
      incoming: { status: 'cue-ready', reason: null, cuePoints: [], gridArtifact: null,
        coverageStartSeconds: 0, coverageEndSeconds: 32 },
      outgoing: { status: 'no-cue', reason: 'No tail cue.', cuePoints: [], gridArtifact: null,
        coverageStartSeconds: null, coverageEndSeconds: null },
    },
  });
  assert.equal(store.latestCompleteJob('track-a')?.runId, second.runId);
});

test('V2 pick-time roles require a current source-bound grid and filter cues by direction', async () => {
  const store = createSubbeatsPrepV2Store(tempRoot());
  const run = store.createRun({ baselineSha256: null, scope: 'track', algorithmVersion: 4,
    jobs: [{ id: 'track-a', title: 'A', artist: 'Artist', album: 'Album' }] });
  const grid = {
    version: 1 as const, backend: 'beat-this-onnx' as const, model: 'small0' as const,
    modelSha256: 'e'.repeat(64), preprocessingVersion: 1 as const,
    sourceSha256: 'a'.repeat(64), sourceBytes: 4096, windowStartSeconds: 0, windowEndSeconds: 100,
    beatsSeconds: Array.from({ length: 64 }, (_, i) => i * 0.5),
    downbeatsSeconds: Array.from({ length: 16 }, (_, i) => i * 2),
  };
  const incomingGrid = store.writeGridArtifact(run.runId, 'track-a', 'incoming', grid);
  const outgoingGrid = store.writeGridArtifact(run.runId, 'track-a', 'outgoing', grid);
  const claimed = store.claim(run.runId, 'track-a')!;
  const cue = (sourceSeconds: number) => ({ sourceSeconds, bpm: 120, strength: 1, reason: 'arrangement' as const });
  store.complete(run.runId, claimed.id, {
    source: { sha256: 'a'.repeat(64), bytes: 4096, durationSeconds: 100 },
    roles: {
      incoming: { status: 'cue-ready', reason: null, cuePoints: [cue(20)], gridArtifact: incomingGrid,
        coverageStartSeconds: 0, coverageEndSeconds: 40 },
      outgoing: { status: 'cue-ready', reason: null, cuePoints: [cue(40), cue(75)], gridArtifact: outgoingGrid,
        coverageStartSeconds: 60, coverageEndSeconds: 100 },
    },
  });
  await store.primeLatestCompleteJobs();
  assert.equal(store.latestCueRole('track-a', 'incoming', 4096).state, 'cue-ready');
  const outgoing = store.latestCueRole('track-a', 'outgoing', 4096);
  assert.equal(outgoing.state, 'cue-ready');
  if (outgoing.state === 'cue-ready') assert.deepEqual(outgoing.cues.map(item => item.sourceSeconds), [75]);
  assert.equal(store.latestCueRole('track-a', 'incoming', 8192).state, 'source-changed');
});
