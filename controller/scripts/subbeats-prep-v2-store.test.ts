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

test('airplay jobs share durable V2 runs, recover after restart, and respect pause and terminal results', async () => {
  const root = tempRoot(), store = createSubbeatsPrepV2Store(root);
  await store.primeLatestCompleteJobs();
  const input = (id: string) => ({ id, title: id, artist: 'Fixture', album: '', expectedSourceBytes: 4096 });
  const run = store.enqueueAirplayJob(input('first'));
  assert.equal(store.enqueueAirplayJob(input('second')).runId, run.runId, 'new plays append to one automatic run');
  assert.equal(store.listRuns().length, 1);
  assert.equal(store.latestJob('first')?.job.status, 'queued');
  assert.equal(store.nextAirplayRun(), run.runId);
  store.claim(run.runId, 'first');
  const restarted = createSubbeatsPrepV2Store(root);
  await restarted.primeLatestCompleteJobs();
  assert.equal(restarted.nextAirplayRun(), run.runId);
  restarted.recover(run.runId);
  assert.equal(restarted.latestJob('first')?.job.status, 'queued');
  restarted.pause(run.runId, true);
  assert.equal(restarted.nextAirplayRun(), null, 'restart cannot resume an operator-paused run');
  restarted.pause(run.runId, false);
  restarted.claim(run.runId, 'first');
  restarted.fail(run.runId, 'first', 'Fixture decode refusal');
  restarted.claim(run.runId, 'second');
  restarted.fail(run.runId, 'second', 'Fixture decode refusal');
  assert.equal(restarted.latestJob('second')?.job.status, 'failed');
  assert.equal(restarted.nextAirplayRun(), null, 'failed attempts do not hot-loop');
  const next = restarted.enqueueAirplayJob(input('third'));
  assert.equal(next.runId, run.runId, 'a completed run can accept the next new recording');
  assert.equal(restarted.nextAirplayRun(), run.runId);
  const replacement = restarted.enqueueAirplayJob({ ...input('first'), expectedSourceBytes: 8192 });
  assert.notEqual(replacement.runId, run.runId, 'a new recording version preserves its previous result');
  assert.equal(restarted.read(run.runId).jobs[0]?.expectedSourceBytes, 4096);
});

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

test('V2 keeps reading runs from the previous Stem Beats subfolder after moving new runs up one level', () => {
  const stateDir = tempRoot();
  const store = createSubbeatsPrepV2Store(stateDir);
  const run = store.createRun({ baselineSha256: null, scope: 'library', algorithmVersion: 1,
    jobs: [{ id: 'old-path', title: 'Old path', artist: 'Artist', album: '', v1: null }] });
  const current = join(stateDir, 'stems', 'stembeats', 'runs', run.runId);
  const previous = join(stateDir, 'stems', 'stembeats', 'prep-v2', 'runs', run.runId);
  mkdirSync(join(stateDir, 'stems', 'stembeats', 'prep-v2', 'runs'), { recursive: true });
  renameSync(current, previous);
  const restarted = createSubbeatsPrepV2Store(stateDir);
  assert.equal(restarted.read(run.runId).runId, run.runId);
  assert.deepEqual(restarted.listRuns().map(item => item.runId), [run.runId]);
  assert.equal(restarted.createRun({ baselineSha256: null, scope: 'library', algorithmVersion: 1,
    jobs: [{ id: 'new-path', title: 'New path', artist: 'Artist', album: '', v1: null }] }).jobs[0]?.id, 'new-path');
  assert.ok(existsSync(join(stateDir, 'stems', 'stembeats', 'runs')));
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
  store.complete(run.runId, first.id, {
    source: { sha256: 'f'.repeat(64), bytes: 4096, durationSeconds: 120 },
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
  const create = () => store.createRun({
    baselineSha256: null, scope: 'track', algorithmVersion: 4,
    jobs: [{ id: 'track-a', title: 'A', artist: 'Artist', album: 'Album' }],
  });
  const first = create();
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
