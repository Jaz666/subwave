import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, lstatSync } from 'node:fs';
import { readFile as readFileAsync, readdir as readdirAsync } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { writeFileAtomicSync } from '../util/atomic-file.js';
import { subbeatsQueueSchema } from '../schemas/subbeats.js';
import {
  SUBBEATS_PREP_V2_ALGORITHM_VERSION,
  subbeatsPrepV2JobSchema,
  subbeatsPrepV2GridSchema,
  subbeatsPrepV2RunRequestSchema,
  subbeatsPrepV2RunSchema,
  type SubbeatsPrepV2Job,
  type SubbeatsPrepV2Run,
} from '../schemas/subbeats-prep-v2-server.js';

const legacyRootPath = (stateDir: string) => join(stateDir, 'subbeats', 'prep-v2');
const previousStemBeatsRootPath = (stemBeatsRoot: string) => join(stemBeatsRoot, 'prep-v2');
const runPath = (root: string, runId: string) => join(root, 'runs', runId);
const runFilePath = (root: string, runId: string) => join(runPath(root, runId), 'run.json');
// Algorithm 3 is already used by station pick-time, and algorithm 4 adds
// automatic cue candidates without changing the saved source/grid contract.
const pickTimeAlgorithmVersions = new Set([3, SUBBEATS_PREP_V2_ALGORITHM_VERSION]);
const emptyRole = () => ({
  status: 'pending' as const,
  reason: null,
  cuePoints: [],
  gridArtifact: null,
  coverageStartSeconds: null,
  coverageEndSeconds: null,
});
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

function save(root: string, run: SubbeatsPrepV2Run): void {
  const directory = runPath(root, run.runId);
  if (existsSync(directory) && lstatSync(directory).isSymbolicLink()) {
    throw new Error('V2 preparation runs must use their own directory.');
  }
  mkdirSync(directory, { recursive: true });
  writeFileAtomicSync(runFilePath(root, run.runId), JSON.stringify(subbeatsPrepV2RunSchema.parse(run)), { durable: true });
}

function read(roots: string[], runId: string): SubbeatsPrepV2Run {
  if (!/^[a-f0-9-]{36}$/.test(runId)) throw new Error('Invalid V2 preparation run ID.');
  const root = roots.find(candidate => existsSync(runFilePath(candidate, runId)));
  const file = root ? runFilePath(root, runId) : '';
  if (!existsSync(file)) throw new Error('V2 preparation run not found.');
  return subbeatsPrepV2RunSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}

function rootForRun(roots: string[], runId: string): string {
  const root = roots.find(candidate => existsSync(runFilePath(candidate, runId)));
  if (!root) throw new Error('V2 preparation run not found.');
  return root;
}

function readGridArtifact(roots: string[], runId: string, key: string): unknown {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid V2 grid artifact key.');
  const root = roots.find(candidate => existsSync(runFilePath(candidate, runId)));
  if (!root) throw new Error('V2 preparation run not found.');
  const artifact = readFileSync(join(runPath(root, runId), 'artifacts', `${key}.json`));
  if (hash(artifact) !== key) throw new Error('V2 grid artifact failed its integrity check.');
  const parsed = JSON.parse(artifact.toString('utf8')) as { version: number; runId: string; grid: unknown };
  if (parsed.version !== 1 || parsed.runId !== runId) throw new Error('V2 grid artifact identity mismatch.');
  return subbeatsPrepV2GridSchema.parse(parsed.grid);
}

function settleStatus(run: SubbeatsPrepV2Run): SubbeatsPrepV2Run['status'] {
  if (run.status === 'paused') return 'paused';
  if (run.jobs.some(job => job.status === 'running')) return 'running';
  if (run.jobs.some(job => job.status === 'queued')) return 'queued';
  return 'complete';
}

type PrepV2JobInput = ReturnType<typeof subbeatsPrepV2RunRequestSchema.parse>['jobs'][number];
function queuedJob(job: PrepV2JobInput, now: string): SubbeatsPrepV2Job {
  return subbeatsPrepV2JobSchema.parse({
    id: job.id,
    title: job.title,
    artist: job.artist,
    album: job.album,
    status: 'queued',
    attempts: 0,
    source: null,
    ...(job.expectedSourceBytes == null ? {} : { expectedSourceBytes: job.expectedSourceBytes }),
    startedAt: null,
    durationMs: null,
    v1: job.v1 ?? (job.status ? {
      status: job.status,
      attempts: job.attempts ?? 0,
      error: job.error ?? null,
      updatedAt: job.updatedAt ?? now,
      task: job.task ?? null,
      headSupported: job.headSupported ?? false,
      tailSupported: job.tailSupported ?? false,
      preparationMethod: job.preparationMethod ?? null,
      bundleKey: job.bundleKey ?? null,
      cuePoints: job.cuePoints ?? null,
      cueCoverage: job.cueCoverage ?? null,
      suitability: job.suitability ?? null,
      lyricEvidence: job.lyricEvidence ?? null,
    } : null),
    roles: { incoming: emptyRole(), outgoing: emptyRole() },
    error: null,
    updatedAt: now,
  });
}

export function createSubbeatsPrepV2Store(stateDir: string, stemBeatsRoot = join(stateDir, 'stems', 'stembeats')) {
  // Keep preparation directly beneath the Stem Beats root, beside tmp/ and
  // pick-time/. Continue reading both previous locations for existing runs.
  const runsRoot = stemBeatsRoot;
  const readRoots = [runsRoot, previousStemBeatsRootPath(stemBeatsRoot), legacyRootPath(stateDir)];
  let latestCompleteJobs: Map<string, { runId: string; createdAt: string; job: SubbeatsPrepV2Job }> | null = null;
  let latestJobs: Map<string, { runId: string; createdAt: string; job: SubbeatsPrepV2Job;
    airplay: boolean; runStatus: SubbeatsPrepV2Run['status'] }> | null = null;
  let airplayRun: { runId: string; createdAt: string } | null = null;
  let priming: Promise<void> | null = null;
  const listRuns = () => {
    const ids = new Set<string>();
    for (const root of readRoots) {
      const directory = join(root, 'runs');
      if (!existsSync(directory)) continue;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name)) ids.add(entry.name);
      }
    }
    return [...ids].map(id => read(readRoots, id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  };
  const rememberCompleteJob = (run: SubbeatsPrepV2Run, job: SubbeatsPrepV2Job) => {
    if (!latestCompleteJobs || !pickTimeAlgorithmVersions.has(run.algorithmVersion)
        || job.status !== 'complete' || !job.source) return;
    const previous = latestCompleteJobs.get(job.id);
    if (!previous || run.createdAt >= previous.createdAt)
      latestCompleteJobs.set(job.id, { runId: run.runId, createdAt: run.createdAt, job });
  };
  const rememberRun = (run: SubbeatsPrepV2Run) => {
    for (const job of run.jobs) rememberCompleteJob(run, job);
    if (run.algorithmVersion !== SUBBEATS_PREP_V2_ALGORITHM_VERSION) return;
    if (run.airplay && (!airplayRun || run.createdAt >= airplayRun.createdAt))
      airplayRun = { runId: run.runId, createdAt: run.createdAt };
    for (const job of run.jobs) {
      const previous = latestJobs?.get(job.id);
      if (!previous || run.createdAt >= previous.createdAt)
        latestJobs?.set(job.id, { runId: run.runId, createdAt: run.createdAt, job,
          airplay: run.airplay === true, runStatus: run.status });
    }
  };
  const saveRun = (root: string, run: SubbeatsPrepV2Run) => { save(root, run); rememberRun(run); };
  return {
    createRun(input: unknown): SubbeatsPrepV2Run {
      const request = subbeatsPrepV2RunRequestSchema.parse(input);
      const runId = randomUUID();
      const now = new Date().toISOString();
      const jobs = request.jobs.map(job => queuedJob(job, now));
      const run = subbeatsPrepV2RunSchema.parse({
        version: 1,
        runId,
        createdAt: now,
        status: 'queued',
        baselineSha256: request.baselineSha256,
        scope: request.scope,
        ...(request.airplay == null ? {} : { airplay: request.airplay }),
        algorithmVersion: request.algorithmVersion,
        jobs,
      });
      if (readRoots.some(root => existsSync(runPath(root, runId)))) throw new Error('V2 preparation run ID collision.');
      saveRun(runsRoot, run);
      return run;
    },
    enqueueAirplayJob(input: { id: string; title: string; artist: string; album: string; expectedSourceBytes: number }) {
      // Append ordinary new recordings to one run rather than creating a file
      // per play. New source versions keep the previous result in its old run.
      const run = airplayRun && !latestJobs?.has(input.id) ? read(readRoots, airplayRun.runId) : null;
      if (!run || run.jobs.length >= 20_000) return this.createRun({ baselineSha256: null,
        scope: 'library', airplay: true, algorithmVersion: SUBBEATS_PREP_V2_ALGORITHM_VERSION,
        jobs: [{ ...input, v1: null }] });
      run.jobs.push(queuedJob({ ...input, v1: null }, new Date().toISOString()));
      run.status = settleStatus(run);
      saveRun(rootForRun(readRoots, run.runId), run);
      return run;
    },
    read: (runId: string) => { const run = read(readRoots, runId); rememberRun(run); return run; },
    listRuns,
    addEvent(runId: string, kind: 'info' | 'success' | 'warning' | 'error', text: string): void {
      const run = read(readRoots, runId);
      run.events = [...(run.events ?? []), { at: new Date().toISOString(), kind, text: text.slice(0, 1000) }].slice(-100);
      saveRun(rootForRun(readRoots, runId), run);
    },
    latestJob: (id: string) => latestJobs?.get(id) ?? null,
    nextAirplayRun(): string | null {
      for (const entry of latestJobs?.values() ?? []) {
        if (entry.airplay && entry.runStatus !== 'paused'
            && ['queued', 'running'].includes(entry.job.status)) return entry.runId;
      }
      return null;
    },
    latestCompleteJob(id: string): { runId: string; job: SubbeatsPrepV2Job } | null {
      const result = latestCompleteJobs?.get(id);
      return result ? { runId: result.runId, job: result.job } : null;
    },
    primeLatestCompleteJobs(): Promise<void> {
      if (priming) return priming;
      if (latestCompleteJobs) return Promise.resolve();
      latestCompleteJobs = new Map();
      latestJobs = new Map();
      priming = (async () => {
        const files = new Map<string, string>();
        for (const root of readRoots) {
          const directory = join(root, 'runs');
          let entries;
          try { entries = await readdirAsync(directory, { withFileTypes: true }); }
          catch { continue; }
          for (const entry of entries) if (entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name))
            files.set(entry.name, runFilePath(root, entry.name));
        }
        for (const file of files.values()) {
          try {
            const run = subbeatsPrepV2RunSchema.parse(JSON.parse(await readFileAsync(file, 'utf8')));
            rememberRun(run);
          } catch { /* an unreadable historical run is unavailable for pick-time */ }
        }
      })().catch(error => {
        latestCompleteJobs = null;
        latestJobs = null;
        throw error;
      }).finally(() => { priming = null; });
      return priming;
    },
    latestCueRole(id: string, role: 'incoming' | 'outgoing', sourceBytes: number | null) {
      const latest = this.latestCompleteJob(id);
      if (!latest) return { state: 'unavailable' as const, reason: 'not-prepared' as const };
      const { job, runId } = latest;
      if (!Number.isSafeInteger(sourceBytes) || !sourceBytes || sourceBytes < 1 || job.source?.bytes !== sourceBytes)
        return { state: 'source-changed' as const, reason: 'source-bytes-changed' as const };
      const result = job.roles[role];
      if (result.status !== 'cue-ready') return {
        state: result.status === 'no-cue' ? 'no-cue' as const : 'unavailable' as const,
        reason: result.reason ?? result.status,
      };
      if (!result.gridArtifact) return { state: 'unavailable' as const, reason: 'grid-missing' as const };
      let grid: ReturnType<typeof subbeatsPrepV2GridSchema.parse>;
      try { grid = subbeatsPrepV2GridSchema.parse(readGridArtifact(readRoots, runId, result.gridArtifact)); }
      catch { return { state: 'unavailable' as const, reason: 'grid-invalid' as const }; }
      if (grid.sourceSha256 !== job.source.sha256 || grid.sourceBytes !== job.source.bytes)
        return { state: 'source-changed' as const, reason: 'grid-source-changed' as const };
      const cues = result.cuePoints.filter(cue => cue.timingValidated !== false
        && (role !== 'outgoing' || cue.sourceSeconds >= job.source!.durationSeconds / 2)
        && cue.sourceSeconds < job.source!.durationSeconds);
      if (!cues.length) return { state: 'no-cue' as const, reason: 'no-current-role-cue' as const };
      return { state: 'cue-ready' as const, runId, job, role, cues, grid };
    },
    claim(runId: string, id: string): SubbeatsPrepV2Job | null {
      const run = read(readRoots, runId);
      if (run.status === 'paused' || run.status === 'complete' || run.status === 'failed') return null;
      const job = run.jobs.find(item => item.id === id);
      if (!job || job.status !== 'queued') return null;
      job.status = 'running';
      job.attempts++;
      job.startedAt = new Date().toISOString();
      job.durationMs = null;
      job.stage = 'downloading';
      job.updatedAt = job.startedAt;
      run.status = 'running';
      saveRun(rootForRun(readRoots, runId), run);
      return job;
    },
    setStage(runId: string, id: string, stage: NonNullable<SubbeatsPrepV2Job['stage']>): void {
      const run = read(readRoots, runId);
      const job = run.jobs.find(item => item.id === id);
      if (!job || job.status !== 'running') return;
      job.stage = stage;
      job.updatedAt = new Date().toISOString();
      save(rootForRun(readRoots, runId), run);
    },
    recover(runId: string): void {
      const run = read(readRoots, runId);
      let changed = false;
      for (const job of run.jobs) if (job.status === 'running') {
        job.status = 'queued';
        job.startedAt = null;
        job.durationMs = null;
        job.stage = null;
        job.updatedAt = new Date().toISOString();
        changed = true;
      }
      if (changed) {
        if (run.status !== 'paused') run.status = 'queued';
        saveRun(rootForRun(readRoots, runId), run);
      }
    },
    retryFailed(runId: string): SubbeatsPrepV2Run {
      const run = read(readRoots, runId);
      if (run.status === 'paused') throw new Error('Resume the V2 run before retrying failed recordings.');
      let retried = 0;
      for (const job of run.jobs) {
        const wholeJobFailed = job.status === 'failed';
        const failedRoles = (['incoming', 'outgoing'] as const).filter(role => job.roles[role].status === 'failed');
        if (!wholeJobFailed && !failedRoles.length) continue;
        job.status = 'queued';
        job.error = null;
        job.startedAt = null;
        job.durationMs = null;
        job.stage = null;
        for (const role of failedRoles) job.roles[role] = { ...emptyRole(), gridArtifact: job.roles[role].gridArtifact };
        job.updatedAt = new Date().toISOString();
        retried++;
      }
      if (!retried) throw new Error('There are no retryable failed recordings in this V2 run.');
      run.status = 'queued';
      saveRun(rootForRun(readRoots, runId), run);
      return run;
    },
    complete(runId: string, id: string,
      result: Pick<SubbeatsPrepV2Job, 'source' | 'roles' | 'diagnostics'>): void {
      const run = read(readRoots, runId);
      const job = run.jobs.find(item => item.id === id);
      if (!job || job.status !== 'running') throw new Error('V2 job is not running.');
      const completedAt = new Date().toISOString();
      const durationMs = job.startedAt ? Math.max(0, Date.parse(completedAt) - Date.parse(job.startedAt)) : null;
      const updated = subbeatsPrepV2JobSchema.parse({ ...job, ...result, status: 'complete', error: null,
        durationMs, stage: null, updatedAt: completedAt });
      Object.assign(job, updated);
      run.status = settleStatus(run);
      saveRun(rootForRun(readRoots, runId), run);
    },
    fail(runId: string, id: string, error: string, sourceChanged = false): void {
      const run = read(readRoots, runId);
      const job = run.jobs.find(item => item.id === id);
      if (!job || job.status !== 'running') throw new Error('V2 job is not running.');
      const status = sourceChanged ? 'source-changed' : 'failed';
      const failedAt = new Date().toISOString();
      job.status = status;
      job.stage = null;
      job.error = error.slice(0, 1000);
      job.durationMs = job.startedAt ? Math.max(0, Date.parse(failedAt) - Date.parse(job.startedAt)) : null;
      job.updatedAt = failedAt;
      for (const role of [job.roles.incoming, job.roles.outgoing]) {
        if (sourceChanged || role.status === 'pending') {
          role.status = sourceChanged ? 'source-changed' : 'failed';
          role.reason = job.error;
        }
      }
      run.status = settleStatus(run);
      saveRun(rootForRun(readRoots, runId), run);
    },
    pause(runId: string, paused: boolean): void {
      const run = read(readRoots, runId);
      if (run.status === 'complete' || run.status === 'failed') return;
      run.status = paused ? 'paused' : settleStatus({ ...run, status: 'queued' });
      saveRun(rootForRun(readRoots, runId), run);
    },
    writeGridArtifact(runId: string, trackId: string, role: 'incoming' | 'outgoing', value: unknown): string {
      read(readRoots, runId);
      const grid = subbeatsPrepV2GridSchema.parse(value);
      const artifact = JSON.stringify({ version: 1, runId, trackId, role, grid });
      const key = hash(artifact);
      const directory = join(runPath(rootForRun(readRoots, runId), runId), 'artifacts');
      mkdirSync(directory, { recursive: true });
      const file = join(directory, `${key}.json`);
      if (!existsSync(file)) writeFileAtomicSync(file, artifact, { durable: true, replace: false });
      else if (hash(readFileSync(file)) !== key) throw new Error('Existing V2 grid artifact failed its integrity check.');
      return key;
    },
    setGridArtifact(runId: string, id: string, role: 'incoming' | 'outgoing', key: string): void {
      const run = read(readRoots, runId);
      const job = run.jobs.find(item => item.id === id);
      if (!job || job.status !== 'running') throw new Error('V2 job is not running.');
      readGridArtifact(readRoots, runId, key);
      job.roles[role].gridArtifact = key;
      job.updatedAt = new Date().toISOString();
      saveRun(rootForRun(readRoots, runId), run);
    },
    readGridArtifact: (runId: string, key: string) => readGridArtifact(readRoots, runId, key),
  };
}

export function subbeatsPrepV2BaselineMatches(run: SubbeatsPrepV2Run, queueValue: unknown): boolean {
  const queue = subbeatsQueueSchema.parse(queueValue);
  const byId = new Map(queue.jobs.map(job => [job.id, job]));
  if (byId.size !== queue.jobs.length) return false;

  const supported = queue.jobs.filter(job => job.status === 'prepared' && (
    job.suitability?.incoming.level === 'subbeat' || job.suitability?.outgoing.level === 'subbeat'));
  const supportedIds = new Set(supported.map(job => job.id));
  if (supportedIds.size !== supported.length) return false;
  if (run.scope === 'supported' && (supportedIds.size !== run.jobs.length
      || run.jobs.some(job => !supportedIds.has(job.id)))) return false;

  return run.jobs.filter(job => job.v1 !== null).every(job => {
    const current = byId.get(job.id);
    return Boolean(current && isDeepStrictEqual({
      status: current.status,
      attempts: current.attempts,
      error: current.error,
      updatedAt: current.updatedAt,
      task: current.task ?? null,
      headSupported: current.suitability?.incoming.level === 'subbeat',
      tailSupported: current.suitability?.outgoing.level === 'subbeat',
      preparationMethod: current.preparationMethod ?? null,
      bundleKey: current.bundleKey,
      cuePoints: current.cuePoints ?? null,
      cueCoverage: current.cueCoverage ?? null,
      suitability: current.suitability ?? null,
      lyricEvidence: current.lyricEvidence ?? null,
    }, job.v1));
  });
}

export function subbeatsPrepV2TimingSummary(run: SubbeatsPrepV2Run) {
  const completed = run.jobs.filter(job => job.status === 'complete' && typeof job.durationMs === 'number');
  const totalMs = completed.reduce((sum, job) => sum + job.durationMs!, 0);
  const measured = completed.filter(job => job.diagnostics);
  const computedGrid = measured.filter(job => job.diagnostics!.gridSource === 'computed');
  const fallbackJobs = measured.filter(job => job.diagnostics!.incomingFallbackUsed);
  const averageStage = (stage: keyof NonNullable<SubbeatsPrepV2Job['diagnostics']>['stageTimingsMs']) =>
    measured.length ? Math.round(measured.reduce((sum, job) => sum + job.diagnostics!.stageTimingsMs[stage], 0) / measured.length) : null;
  const averageFallback = fallbackJobs.length ? Math.round(fallbackJobs.reduce((sum, job) =>
    sum + job.diagnostics!.stageTimingsMs.incomingFallbackMs, 0) / fallbackJobs.length) : null;
  const averageGrid = computedGrid.length ? Math.round(computedGrid.reduce((sum, job) =>
    sum + job.diagnostics!.stageTimingsMs.gridMs, 0) / computedGrid.length) : null;
  return {
    completedJobs: completed.length,
    averagePrepMs: completed.length ? Math.round(totalMs / completed.length) : null,
    totalPrepMs: totalMs,
    measuredJobs: measured.length,
    computedGridJobs: computedGrid.length,
    selectedGpuGridJobs: computedGrid.filter(job => job.diagnostics!.gridDevice === 'gpu').length,
    selectedCpuGridJobs: computedGrid.filter(job => job.diagnostics!.gridDevice === 'cpu').length,
    incomingFallbackJobs: fallbackJobs.length,
    averageDecodeMs: averageStage('decodeMs'),
    averageGridMs: averageGrid,
    averageCueFitMs: averageStage('cueFitMs'),
    averageIncomingFallbackMs: averageFallback,
    averageAnalyzerMs: averageStage('totalAnalyzerMs'),
  };
}
