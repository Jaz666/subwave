import { bulkPassRunning } from './tagger-lock.js';
import { subbeatsRemovalRunning } from './subbeats-removal.js';
// Explicit cleanup uses the proven quarantine engine, in its own namespace.
// Estimates are operator-triggered background walks, never part of a GET/poll.
// Missing stars/curation/library evidence refuses cleanup, rather than deleting
// on partial information. Old admission opt-ins do NOT grant cleanup consent.
import { lstat, readdir } from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import { config } from '../config.js';
import { mapPool } from '../util/async-pool.js';
import * as db from './library-db.js';
import * as cache from './stem-cache.js';
import * as likes from '../broadcast/likes.js';
import { readSubbeatsStemPolicy } from './subbeats-stem-policy.js';
import { runOrphanPurge, IN_FLIGHT_MS } from './orphan-purge.js';
import { subbeatsCleanupStateSchema } from '../schemas/subbeats.js';

export const SUBBEATS_QUARANTINE = '.subbeats-quarantine';
const quarantine = () => path.join(cache.stemsRoot(), SUBBEATS_QUARANTINE);
const consented = () => {
  const policy = readSubbeatsStemPolicy();
  return policy.enabled && policy.cleanupEnabled;
};
const policyVersion = () => {
  const st = statSync(path.join(config.stateDir, 'subbeats', 'stem-policy.json'));
  return `${st.ino}:${st.mtimeMs}:${st.size}`;
};

// Symlinks are never followed; any unreadable candidate makes the estimate fail.
async function directoryBytes(dir: string): Promise<number> {
  let bytes = 0;
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    const file = path.join(dir, entry.name);
    const st = await lstat(file);
    if (st.isSymbolicLink()) throw new Error('A candidate contains a symbolic link; cleanup estimate stopped');
    bytes += st.isDirectory() ? await directoryBytes(file) : st.size;
  }
  return bytes;
}
async function requireCache() {
  if (subbeatsRemovalRunning()) throw new Error('Wait for Sub/Beats entry removal to finish before scanning or cleaning the cache');
  if (!(await cache.stemsRootStatus({readOnly:true})).online) throw new Error('Stem cache is offline. Connect it, then retry.');
  if (bulkPassRunning() || (await cache.storedUsage())?.passRunning) throw new Error('Analysis is writing stems. Wait for it to finish, then retry cleanup.');
  if (!db.allTrackIdsOrdered().length) throw new Error('The library is empty or unavailable. Cleanup stopped.');
}

export async function estimateSubbeatsCleanup(opts: {now?: number; signals?: () => Promise<db.StemScanOpts>} = {}) {
  await requireCache();
  const now = opts.now ?? Date.now();
  const signals = await (opts.signals ?? (() => cache.admissionSignals({strict:true})))();
  const keep = db.stemCleanupKeepIds(signals);
  const prepared = new Set(signals.subbeatsIds ?? []);
  const entries = (await readdir(cache.stemsRoot(), {withFileTypes:true}))
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'));
  let failure: unknown = null;
  const measured = await mapPool(entries, cache.SCAN_CONCURRENCY, async entry => {
    if (failure) return null;
    try {
      const dir = path.join(cache.stemsRoot(), entry.name);
      const recent = now - (await lstat(dir)).mtimeMs < IN_FLIGHT_MS;
      const category = prepared.has(entry.name) ? 'preparedBytes' : keep.has(entry.name) ? 'keptBytes' : recent ? 'recentBytes' : 'candidateBytes';
      return {category, bytes:await directoryBytes(dir)};
    } catch (error) { failure = error; return null; }
  });
  if (failure) throw failure;
  const breakdown = {keptBytes:0, preparedBytes:0, candidateBytes:0, recentBytes:0, quarantineBytes:0};
  for (const item of measured) if (item) breakdown[item.category as keyof typeof breakdown] += item.bytes;
  // Both quarantines occupy this disk, but neither consumes the live cache budget.
  for (const name of [SUBBEATS_QUARANTINE, '.orphan-quarantine']) {
    const dir = path.join(cache.stemsRoot(), name);
    const st = await lstat(dir).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (st?.isSymbolicLink()) throw new Error('Quarantine is a symbolic link; cleanup estimate stopped');
    if (st?.isDirectory()) breakdown.quarantineBytes += await directoryBytes(dir);
  }
  return {folders:measured.filter(item => item?.category === 'candidateBytes').length,
    bytes:breakdown.candidateBytes, breakdown,
    skipped:measured.filter(item => item?.category === 'recentBytes').length, measuredAt:new Date(opts.now ?? Date.now()).toISOString()};
}

export async function runSubbeatsCleanup(opts: {now?: number; automatic?: boolean; signals?: () => Promise<db.StemScanOpts>} = {}) {
  const enabled = consented();
  if (!enabled && !(await lstat(quarantine()).catch(() => null))) return null;
  await requireCache();
  let keep = new Set<string>();
  const version = policyVersion();
  const refresh = async () => {
    await requireCache();
    if (policyVersion() !== version) throw new Error('Cache choices changed. Cleanup stopped; retry with the new choices.');
    if (enabled) keep = db.stemCleanupKeepIds(await (opts.signals ?? (() => cache.admissionSignals({strict:true})))());
  };
  await refresh();
  return runOrphanPurge({ knownIds:db.allTrackIdsOrdered(), confirm:true,
    quarantineDir:quarantine(), automatic:opts.automatic ?? false, ...(opts.now !== undefined ? {now:opts.now} : {}), skipCollisions:true,
    beforeMutations:refresh,
    allowDeletion:() => { if (policyVersion() !== version) throw new Error('Cache choices changed. Cleanup stopped.'); return enabled; },
    keepTrack:id => {
      if (policyVersion() !== version) throw new Error('Cache choices changed. Cleanup stopped.');
      return !enabled || keep.has(id) || db.trackHasPlayed(id) || likes.isOperatorHearted(id);
    },
  });
}

type CleanupState = z.infer<typeof subbeatsCleanupStateSchema>;
let state: CleanupState = {busy:null, estimate:null, report:null, error:null};
export const invalidateSubbeatsCleanupEstimate = () => { state = {...state,estimate:null}; };
let pendingCleanup: {automatic:boolean} | null = null;
export const subbeatsCleanupState = (): CleanupState => ({...state,
  estimate:state.estimate && Date.now() - Date.parse(state.estimate.measuredAt) < 15*60_000 ? state.estimate : null,
});
function start(kind: 'estimate' | 'cleanup', automatic = false): Promise<void> | undefined {
  if (state.busy) {
    if (kind === 'cleanup') { pendingCleanup = {automatic:(pendingCleanup?.automatic ?? true) && automatic}; return; }
    throw new Error('A cache scan or cleanup is already running');
  }
  state = {...state, busy:kind, error:null, report:kind === 'cleanup' ? null : state.report};
  return (async () => {
    try {
      if (kind === 'estimate') state = {...state, estimate:await estimateSubbeatsCleanup()};
      else {
        const report = await runSubbeatsCleanup({automatic});
        if (report?.refused) throw new Error(report.reason ?? 'Cleanup was refused');
        state = {...state, report, estimate:null};
        if (report) console.info(`[subbeats] stem cleanup: ${report.quarantined} quarantined, ${report.released.length} restored, ${report.deletedCount} deleted, ${report.freedBytes} bytes freed, ${report.failed} failed`);
      }
    } catch (error) {
      state = {...state, error:error instanceof Error ? error.message : 'Cache cleanup could not finish'};
      console.warn(`[subbeats] stem ${kind} stopped: ${state.error}`);
    } finally {
      state = {...state, busy:null};
      if (pendingCleanup) { const next = pendingCleanup; pendingCleanup = null; start('cleanup', next.automatic); }
    }
  })();
}
export const startSubbeatsCleanupEstimate = () => start('estimate');
export const startSubbeatsCleanup = (automatic = false) => start('cleanup', automatic);
