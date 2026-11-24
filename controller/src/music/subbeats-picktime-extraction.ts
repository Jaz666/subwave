import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, open, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as analyzer from './analyzer.js';
import * as stemCache from './stem-cache.js';
import { acquireRegularStemSource } from './regular-stem-source.js';
import { planSubbeatsPrepV2Extraction, roundStemBeatsSample, type SubbeatsPrepV2RoleEvidence } from './subbeats-pair.js';

const BUSY_MARKER = '.stembeats-busy.json';
const PREVIEW_MARKER = '.stembeats-preview.json';
const BUSY_MS = 15 * 60_000;
export const STEM_BEATS_PREVIEW_RETENTION_MS = 30 * 60_000;
const activeDirectories = new Set<string>();

export interface StemBeatsWindowRequest {
  trackId: string;
  side: 'head' | 'tail';
  startMs: number;
  endMs: number;
  sourceSha256: string;
  sourceBytes: number;
}

export function stemBeatsWindowKey(request: StemBeatsWindowRequest): string {
  return createHash('sha256').update(JSON.stringify({ version: 1, model: 'htdemucs',
    trackId: request.trackId, side: request.side, startMs: request.startMs, endMs: request.endMs,
    sourceSha256: request.sourceSha256, sourceBytes: request.sourceBytes })).digest('hex');
}

function trackLabel(role: SubbeatsPrepV2RoleEvidence): string {
  return [role.job?.title, role.job?.artist].filter(Boolean).join(' — ') || role.job?.id || 'unknown track';
}

export async function extractPreparedSubbeatsPair(
  outgoingRole: SubbeatsPrepV2RoleEvidence,
  incomingRole: SubbeatsPrepV2RoleEvidence,
  sourcePaths: { outgoing: string; incoming: string },
  workspace: Awaited<ReturnType<typeof createStemBeatsPickTimeWorkspace>>,
  deadlineMs: number,
  signal: AbortSignal,
  log: (message: string) => void,
) {
  const plan = planSubbeatsPrepV2Extraction(outgoingRole, incomingRole);
  if (plan.state !== 'windows-ready' || !plan.plan
      || outgoingRole.state !== 'cue-ready' || incomingRole.state !== 'cue-ready') {
    return { plan, windows: null };
  }
  const run = async (role: typeof outgoingRole, side: 'tail' | 'head', sourcePath: string,
    interval: { startSeconds: number; endSeconds: number }, destination: string, signal: AbortSignal,
    log: (message: string) => void) => {
    const source = role.job.source!;
    // Transport milliseconds without discarding their sample precision. An
    // enclosing whole millisecond extends past EOF; flooring it loses audio.
    const startMs = roundStemBeatsSample(interval.startSeconds * 44100) * 1000 / 44100;
    const endMs = Math.min(roundStemBeatsSample(interval.endSeconds * 44100),
      roundStemBeatsSample(source.durationSeconds * 44100)) * 1000 / 44100;
    const request: StemBeatsWindowRequest = { trackId: role.job.id, side,
      startMs, endMs,
      sourceSha256: source.sha256, sourceBytes: source.bytes };
    const timeoutMs = Math.min(120_000, Math.floor(deadlineMs - Date.now()));
    if (endMs <= startMs) throw new Error(`Stem Beats ${side} window is empty after source-end clamping.`);
    signal.throwIfAborted();
    const startedAt = Date.now();
    log(`Stem Beats ${side} extraction started for ${trackLabel(role)} (${(endMs-startMs)/1000}s window, ${((Math.max(0, deadlineMs-Date.now()))/1000).toFixed(1)}s budget remains)`);
    const result = await workspace.extract(request, sourcePath, destination, timeoutMs, signal);
    log(`Stem Beats ${side} extraction finished for ${trackLabel(role)} in ${((Date.now()-startedAt)/1000).toFixed(1)}s`);
    return result;
  };
  const outgoing = await run(outgoingRole, 'tail', sourcePaths.outgoing,
    plan.plan.outgoing, path.join(workspace.directory, 'outgoing'), signal, log);
  const incoming = await run(incomingRole, 'head', sourcePaths.incoming,
    plan.plan.incoming, path.join(workspace.directory, 'incoming'), signal, log);
  return { plan, windows: { outgoing, incoming } };
}

/** Stage the two complete, source-bound V2 windows for one pick-time pair.
 * The caller owns the returned lease until rendering finishes or is declined.
 */
export async function stageSubbeatsPairForPickTime(
  outgoingRole: SubbeatsPrepV2RoleEvidence,
  incomingRole: SubbeatsPrepV2RoleEvidence,
  deadlineMs: number,
  signal: AbortSignal,
  log: (message: string) => void = () => {},
) {
  const plan = planSubbeatsPrepV2Extraction(outgoingRole, incomingRole);
  if (plan.state !== 'windows-ready' || !plan.plan
      || outgoingRole.state !== 'cue-ready' || incomingRole.state !== 'cue-ready') {
    return { plan, windows: null, release: async () => {} };
  }
  const [outEvidence, inEvidence] = [outgoingRole, incomingRole];
  const leases: Awaited<ReturnType<typeof acquireRegularStemSource>>[] = [];
  let workspace: Awaited<ReturnType<typeof createStemBeatsPickTimeWorkspace>> | null = null;
  let released = false;
  const release = async (retainPreview = false) => {
    if (released) return;
    released = true;
    await workspace?.release(retainPreview);
    await Promise.all(leases.map(source => source.release(retainPreview)));
  };
  try {
    for (const role of [outEvidence, inEvidence]) {
      signal.throwIfAborted();
      const source = role.job.source!;
      const sourceStartedAt = Date.now();
      log(`Stem Beats source acquisition started for ${trackLabel(role)}`);
      leases.push(await acquireRegularStemSource(role.job.id, {
        expectedBytes: source.bytes, expectedSha256: source.sha256,
        deadlineMs, log, signal,
      }));
      log(`Stem Beats source acquisition finished in ${((Date.now()-sourceStartedAt)/1000).toFixed(1)}s for ${trackLabel(role)}`);
    }
    signal.throwIfAborted();
    log(`Stem Beats sources ready (${((Math.max(0, deadlineMs-Date.now()))/1000).toFixed(1)}s budget remains)`);
    workspace = await createStemBeatsPickTimeWorkspace();
    signal.throwIfAborted();
    const extractedAt = Date.now();
    log('Stem Beats source recordings ready; extracting selected windows');
    const extracted = await extractPreparedSubbeatsPair(outEvidence, inEvidence,
      { outgoing: leases[0]!.path, incoming: leases[1]!.path }, workspace, deadlineMs, signal, log);
    log(`Stem Beats pair extraction finished in ${((Date.now()-extractedAt)/1000).toFixed(1)}s`);
    if (!extracted.windows || extracted.windows.outgoing.evidence == null || extracted.windows.incoming.evidence == null) {
      await release(false);
      return { plan: extracted.plan, windows: null, sources: null, release };
    }
    return { plan: extracted.plan, windows: extracted.windows,
      sources: leases.map((source, index) => ({ ...source,
        durationSeconds: index === 0 ? outEvidence.job.source!.durationSeconds : inEvidence.job.source!.durationSeconds })),
      release };
  } catch (error) {
    await release(false);
    throw error;
  }
}

async function safeDirectory(pathname: string): Promise<void> {
  const info = await lstat(pathname).catch(() => null);
  if (info?.isSymbolicLink() || (info && !info.isDirectory())) throw new Error('Stem Beats work path is not a real directory.');
}

async function ensureRealPath(pathname: string): Promise<void> {
  const parsed = path.parse(pathname);
  let current = parsed.root;
  for (const segment of pathname.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const info = await lstat(current).catch(() => null);
    if (info?.isSymbolicLink() || (info && !info.isDirectory())) throw new Error('Stem Beats work path is not a real directory.');
    if (!info) {
      await mkdir(current).catch(error => {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      });
      await safeDirectory(current);
    }
  }
}

async function sweepExpired(root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('.pick-')) continue;
    const directory = path.join(root, entry.name);
    if (activeDirectories.has(directory)) continue;
    await safeDirectory(directory);
    let busy = false;
    try {
      const marker = path.join(directory, BUSY_MARKER);
      const record = JSON.parse(await readFile(marker, 'utf8')) as { until?: number };
      const info = await stat(marker);
      busy = typeof record.until === 'number' && record.until > Date.now()
        && Date.now() - info.mtimeMs < BUSY_MS;
    } catch { /* completed, malformed or expired temporary work is removable */ }
    try {
      const marker = path.join(directory, PREVIEW_MARKER);
      const record = JSON.parse(await readFile(marker, 'utf8')) as { until?: number };
      const info = await stat(marker);
      busy ||= typeof record.until === 'number' && record.until > Date.now()
        && Date.now() - info.mtimeMs < STEM_BEATS_PREVIEW_RETENTION_MS;
    } catch { /* no retained preview */ }
    if (!busy) await rm(directory, { recursive: true, force: true });
  }
}

export async function createStemBeatsPickTimeWorkspace(root = path.join(stemCache.stemsRoot(), 'stembeats', 'pick-time')) {
  await ensureRealPath(root);
  await chmod(root, 0o777).catch(() => {});
  await sweepExpired(root);
  const directory = await mkdtemp(path.join(root, '.pick-'));
  activeDirectories.add(directory);
  const outgoingDir = path.join(directory, 'outgoing');
  const incomingDir = path.join(directory, 'incoming');
  try {
    await chmod(directory, 0o755);
    const markerFile = await open(path.join(directory, '.subwave-stembeats'), 'wx', 0o666);
    await markerFile.close();
    await Promise.all([outgoingDir, incomingDir].map(async child => {
      await mkdir(child);
      await chmod(child, 0o777).catch(() => {});
    }));
  } catch (error) {
    activeDirectories.delete(directory);
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  let released = false;
  let uncertainWorker = false;
  return {
    directory,
    async extract(request: StemBeatsWindowRequest, sourcePath: string, destination: string,
      timeoutMs: number, signal: AbortSignal): Promise<{ directory: string; evidence: unknown }> {
      signal.throwIfAborted();
      if (released || ![outgoingDir, incomingDir].includes(destination)) throw new Error('Stem Beats workspace is not available.');
      if ((request.side === 'tail') !== (destination === outgoingDir)) throw new Error('Stem Beats role and destination do not match.');
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) throw new Error('Stem Beats extraction budget is too short.');
      const size = await stat(sourcePath);
      if (!size.isFile() || size.size !== request.sourceBytes) throw new Error('Complete source size changed before Stem Beats extraction.');
      const window = { version: 1 as const, side: request.side, start_ms: request.startMs, end_ms: request.endMs,
        key: stemBeatsWindowKey(request), source_sha256: request.sourceSha256,
        source_bytes: request.sourceBytes, model: 'htdemucs' };
      try {
        await analyzer.analyzeFacets(request.trackId, { facets: ['stems'], stems_device: 'cpu', complete: true,
          localPathRequired: true, timeoutMs, stems_dir: destination, stembeats_window: window, signal }, sourcePath);
      } catch (error) {
        uncertainWorker = true;
        throw error;
      }
      const stamp = path.join(destination, `${request.side}-stembeats.json`);
      const info = await lstat(stamp);
      if (!info.isFile() || info.isSymbolicLink() || info.size < 1) throw new Error('Stem Beats extraction did not publish its completion evidence.');
      const stems = await Promise.all(['drums', 'bass', 'other', 'vocals'].map(name =>
        lstat(path.join(destination, `${request.side}-${name}.flac`))));
      if (stems.some(file => !file.isFile() || file.isSymbolicLink() || file.size < 1))
        throw new Error('Stem Beats extraction returned an incomplete stem set.');
      return { directory: destination, evidence: JSON.parse(await readFile(stamp, 'utf8')) as unknown };
    },
    async release(retainPreview = false): Promise<void> {
      if (released) return;
      released = true;
      activeDirectories.delete(directory);
      if (uncertainWorker) {
        await writeFile(path.join(directory, BUSY_MARKER), JSON.stringify({ until: Date.now() + BUSY_MS }), { mode: 0o666 });
        return;
      }
      if (retainPreview) {
        await writeFile(path.join(directory, PREVIEW_MARKER),
          JSON.stringify({ until: Date.now() + STEM_BEATS_PREVIEW_RETENTION_MS }), { mode: 0o666 });
        return;
      }
      await rm(directory, { recursive: true, force: true });
    },
  };
}
