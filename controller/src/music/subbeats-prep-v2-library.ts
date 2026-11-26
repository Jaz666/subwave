import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import { subbeatsPrepV2GridSchema, type SubbeatsPrepV2Job } from '../schemas/subbeats-prep-v2-server.js';
import type { BeatGridProvenance } from '../schemas/beat-grid.js';
import * as analyzer from './analyzer.js';
import * as db from './library-db.js';
import { createSubbeatsPrepV2Store } from './subbeats-prep-v2-store.js';
import { bulkPassRunning } from './tagger-lock.js';
import { tagger } from '../broadcast/tagger.js';
import * as stemCache from './stem-cache.js';
import * as settings from '../settings.js';
import { stemBeatsEnabled } from '../broadcast/regular-stem-mode.js';
import { quietOnlyEnabled } from './analyze-quiet-pure.js';

const store = createSubbeatsPrepV2Store(config.stateDir, join(stemCache.stemsRoot(), 'stembeats'));
let active: { runId: string; work: Promise<void> } | null = null;
let airplayMayRun: () => boolean = () => false;
let pickTimeHasPriority: () => boolean = () => false;
let deferredManualRunId: string | null = null;
let deferredManualReason: 'pick-time' | 'automatic-preparation' | null = null;
let airplayPumpScheduled = false;
void store.primeLatestCompleteJobs().catch(error => {
  console.warn(`[stembeats] pick-time evidence index unavailable: ${error instanceof Error ? error.message : String(error)}`);
});

async function fileHash(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function storedGrid(runId: string, job: SubbeatsPrepV2Job, source: { sha256: string; bytes: number }) {
  for (const role of ['incoming', 'outgoing'] as const) {
    const key = job.roles[role].gridArtifact;
    if (!key) continue;
    const parsed = subbeatsPrepV2GridSchema.safeParse(store.readGridArtifact(runId, key));
    if (parsed.success && parsed.data.sourceSha256 === source.sha256 && parsed.data.sourceBytes === source.bytes) {
      return parsed.data;
    }
  }
  return null;
}

async function processJob(runId: string, job: SubbeatsPrepV2Job,
  shouldContinue: () => boolean = () => true): Promise<boolean> {
  const label = `${job.title}${job.artist ? ` — ${job.artist}` : ''}`;
  const bytes = db.trackFileSize(job.id);
  if (!Number.isSafeInteger(bytes) || !bytes || bytes < 1) throw new Error('The complete recording size is unavailable.');
  if (job.expectedSourceBytes != null && bytes !== job.expectedSourceBytes)
    throw new Error('The library recording changed before V2 preparation.');
  if (!shouldContinue()) return false;
  const tempRoot = join(stemCache.stemsRoot(), 'stembeats', 'tmp');
  await mkdir(tempRoot, { recursive: true });
  const tempDir = await mkdtemp(join(tempRoot, 'source-'));
  // The analyzer sidecar runs as UID 10001 and reads this source through the
  // shared state mount. mkdtemp creates mode 0700, so explicitly allow path
  // traversal while the complete source is staged; the file itself remains
  // readable according to the controller's normal umask.
  await chmod(tempDir, 0o755);
  const sourcePath = join(tempDir, 'source.audio');
  try {
    store.setStage(runId, job.id, 'downloading');
    const downloaded = await analyzer.downloadCapped(job.id, {
      maxBytes: bytes + 1,
      timeoutMs: Math.max(config.analyzer.requestTimeoutMs, config.analyzer.wholeFileTimeoutMs),
      destination: sourcePath,
    });
    if (!downloaded.complete) throw new Error('The complete recording could not be downloaded; no tail result was saved.');
    const sourceSize = (await stat(sourcePath)).size;
    if (sourceSize !== bytes || db.trackFileSize(job.id) !== bytes) throw new Error('The library recording changed during V2 preparation.');
    const source = { sha256: await fileHash(sourcePath), bytes };
    if (job.source && (job.source.sha256 !== source.sha256 || job.source.bytes !== source.bytes)) {
      throw new Error('The source changed between V2 attempts.');
    }
    // A pick may have arrived during the download. Cue analysis must yield
    // before its next expensive request; already-running requests finish.
    if (!shouldContinue()) return false;
    store.addEvent(runId, 'info', `Measuring Stem Beats cues for ${label}.`);
    store.setStage(runId, job.id, 'analyzing');
    const result = await analyzer.prepareSubbeatsPrepV2(sourcePath, source, storedGrid(runId, job, source));
    if (db.trackFileSize(job.id) !== bytes) throw new Error('The library recording changed during V2 preparation.');
    store.setStage(runId, job.id, 'saving');
    const gridKeys: Partial<Record<'incoming' | 'outgoing', string>> = {};
    if (result.grid) {
      const beatIntervals = result.grid.beatsSeconds.slice(1).map((at, index) => at - result.grid!.beatsSeconds[index]!)
        .filter(interval => Number.isFinite(interval) && interval > 0).sort((a, b) => a - b);
      const medianInterval = beatIntervals[Math.floor(beatIntervals.length / 2)];
      const medianBpm = medianInterval ? 60 / medianInterval : null;
      const sharedGrid = {
        beats: result.grid.beatsSeconds.map(at => Math.round(at * 1000)),
        bars: result.grid.downbeatsSeconds.map(at => Math.round(at * 1000)),
        gridProvenance: {
          version: 1 as const, backend: 'beat-this-onnx' as const, model: 'small0' as const,
          modelSha256: result.grid.modelSha256, preprocessingVersion: 1 as const,
          windowStartMs: Math.round(result.grid.windowStartSeconds * 1000),
          windowEndMs: Math.round(result.grid.windowEndSeconds * 1000),
          evidence: { medianBpm, intervalSupport: null, librosaBeatSupport: null },
          source: { sha256: source.sha256, bytes: source.bytes, complete: true },
        } satisfies BeatGridProvenance,
      };
      if (!db.writeBeatGridUpgrade(job.id, sharedGrid, sharedGrid, bytes))
        throw new Error('The library recording changed before its shared beat grid could be saved.');
      for (const role of ['incoming', 'outgoing'] as const) {
        if (job.roles[role].status === 'pending') {
          const key = store.writeGridArtifact(runId, job.id, role, result.grid);
          store.setGridArtifact(runId, job.id, role, key);
          gridKeys[role] = key;
        }
      }
    }
    const roles = Object.fromEntries((['incoming', 'outgoing'] as const).map(role => [role,
      job.roles[role].status !== 'pending' ? job.roles[role]
        : { ...result.roles[role], gridArtifact: gridKeys[role] ?? null },
    ])) as typeof job.roles;
    store.complete(runId, job.id, { source: result.source, roles, diagnostics: result.diagnostics });
    const device = result.grid?.device;
    const ready = (['incoming', 'outgoing'] as const).filter(role => roles[role].status === 'cue-ready').join(' and ') || 'no cue-ready roles';
    store.addEvent(runId, 'success', `Prepared ${label}: ${ready}${device
      ? ` · Beat This selected the ${device.toUpperCase()} provider; decoding, cue fitting and fallback rhythm analysis include CPU work` : ''}.`);
    return true;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function startSubbeatsPrepV2(runId: string): void {
  if (active) {
    if (active.runId === runId) return;
    throw new Error('Another V2 preparation run is already active.');
  }
  if (tagger.running || bulkPassRunning()) {
    throw new Error('Wait for current library analysis or cache maintenance to finish.');
  }
  store.recover(runId);
  const run = store.read(runId);
  if (run.status === 'complete') return;
  store.addEvent(runId, 'info', 'Stem Beats preparation started.');
  const work = (async () => {
    while (true) {
      const current = store.read(runId);
      if (current.status === 'paused') break;
      if (current.airplay && !airplayPreparationAllowed()) break;
      const job = current.jobs.find(item => item.status === 'queued');
      if (!job) break;
      if (!current.airplay && manualPreparationShouldYield()) {
        deferredManualRunId = runId;
        deferredManualReason = pickTimeHasPriority() ? 'pick-time' : 'automatic-preparation';
        scheduleAirplayPreparation();
        break;
      }
      const claimed = store.claim(runId, job.id);
      if (!claimed) continue;
      try {
        store.addEvent(runId, 'info', `Started ${claimed.title}${claimed.artist ? ` — ${claimed.artist}` : ''}.`);
        const completed = await processJob(runId, claimed, current.airplay
          ? airplayPreparationAllowed : () => !manualPreparationShouldYield());
        if (!completed) {
          store.addEvent(runId, 'warning', 'Yielding before the next track for higher-priority preparation.');
          if (!current.airplay) {
            deferredManualRunId = runId;
            deferredManualReason = pickTimeHasPriority() ? 'pick-time' : 'automatic-preparation';
          }
          store.recover(runId);
          break;
        }
        if (current.airplay) {
          const seconds = (store.read(runId).jobs.find(job => job.id === claimed.id)?.durationMs ?? 0)/1000;
          console.info(`[stembeats] cue preparation complete: ${claimed.title} — ${claimed.artist} (${seconds.toFixed(1)}s)`);
        }
      }
      catch (error) {
        if (current.airplay && !airplayPreparationAllowed()) { store.recover(runId); break; }
        const message = error instanceof Error ? error.message : String(error);
        store.fail(runId, claimed.id, message, /recording changed|source changed/i.test(message));
        store.addEvent(runId, 'error', `Failed ${claimed.title}${claimed.artist ? ` — ${claimed.artist}` : ''}: ${message}`);
      }
    }
  })().catch(error => {
    console.warn(`[stembeats] preparation run stopped: ${error instanceof Error ? error.message : String(error)}`);
  }).finally(() => {
    active = null;
    resumeDeferredManualRun();
    scheduleAirplayPreparation();
  });
  active = { runId, work };
}

export function pauseSubbeatsPrepV2(runId: string, paused: boolean): void {
  store.pause(runId, paused);
  store.addEvent(runId, paused ? 'warning' : 'info', paused
    ? 'Pause requested; the current track will finish before preparation stops.'
    : 'Stem Beats preparation resumed.');
  if (!paused) startSubbeatsPrepV2(runId);
}

export function subbeatsPrepV2RunActive(runId?: string): boolean {
  return active !== null && (runId === undefined || active.runId === runId);
}

export function subbeatsPrepV2WaitingForPickTime(runId: string): boolean {
  return deferredManualRunId === runId && deferredManualReason === 'pick-time';
}

export function subbeatsPrepV2WaitingReason(runId: string): 'pick-time' | 'automatic-preparation' | null {
  return deferredManualRunId === runId ? deferredManualReason : null;
}

export function latestSubbeatsPrepV2Role(id: string, role: 'incoming' | 'outgoing') {
  return store.latestCueRole(id, role, db.trackFileSize(id));
}

function airplayPreparationEnabled(): boolean {
  const transitions = settings.get().transitions;
  return transitions.stemsStyle === 'new-style' && stemBeatsEnabled();
}

function airplayPreparationAllowed(): boolean {
  return !!db.getDb() && airplayPreparationEnabled() && airplayMayRun()
    && !quietOnlyEnabled(process.env.ANALYZE_QUIET_ONLY, settings.get().audio)
    && !tagger.running && !bulkPassRunning();
}

function scheduleAirplayPreparation(): void {
  if (airplayPumpScheduled) return;
  airplayPumpScheduled = true;
  setImmediate(() => {
    airplayPumpScheduled = false;
    if (active || !airplayPreparationAllowed()) return;
    const runId = store.nextAirplayRun();
    if (runId) try { startSubbeatsPrepV2(runId); }
    catch (error) { console.warn(`[stembeats] automatic preparation deferred: ${String(error)}`); }
  }).unref();
}

/** The queue supplies current priority, including changes during a download. */
export function updateStemBeatsAirplayPreparation(allowed: () => boolean,
  pickTimePriority: () => boolean = () => false): void {
  airplayMayRun = allowed;
  pickTimeHasPriority = pickTimePriority;
  void store.primeLatestCompleteJobs().then(scheduleAirplayPreparation).catch(error => {
    console.warn(`[stembeats] automatic preparation index unavailable: ${String(error)}`);
  });
}

export function notifyStemBeatsPickTimePriorityChanged(): void {
  resumeDeferredManualRun();
  scheduleAirplayPreparation();
}

function resumeDeferredManualRun(): void {
  if (!deferredManualRunId || active || manualPreparationShouldYield()) {
    if (deferredManualRunId && !pickTimeHasPriority()) scheduleAirplayPreparation();
    return;
  }
  const runId = deferredManualRunId;
  deferredManualRunId = null;
  const reason = deferredManualReason;
  deferredManualReason = null;
  try {
    if (store.read(runId).status !== 'paused') startSubbeatsPrepV2(runId);
  } catch (error) {
    deferredManualRunId = runId;
    deferredManualReason = reason;
    console.warn(`[stembeats] deferred preparation could not resume: ${String(error)}`);
  }
}

function manualPreparationShouldYield(): boolean {
  return pickTimeHasPriority() || (!!store.nextAirplayRun() && airplayPreparationAllowed());
}

/** Airplay selects cue/grid analysis only. It never extracts stems or waits in the sender. */
export async function queueAiredStemBeatsTrack(id: string | null | undefined): Promise<void> {
  if (!id || !db.getDb() || !airplayPreparationEnabled()) return;
  await store.primeLatestCompleteJobs();
  if (!airplayPreparationEnabled()) return;
  const track = db.subbeatsEligibleTrack(id), bytes = db.trackFileSize(id);
  if (!track || !bytes) return;
  const previous = store.latestJob(id)?.job;
  const previousBytes = previous?.source?.bytes ?? previous?.expectedSourceBytes;
  // Completed no-cue and failed attempts are terminal too: automatic airplay
  // must not retry them on every play. Changed sources or algorithms can run anew.
  if (previous && (previousBytes == null || previousBytes === bytes)) return;
  store.enqueueAirplayJob({ ...track, expectedSourceBytes: bytes });
  scheduleAirplayPreparation();
}
