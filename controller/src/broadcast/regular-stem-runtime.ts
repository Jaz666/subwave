/** Queue's CPU preparation owner. New working files only; legacy/Sub/Beats
 * paths are never consulted. A finished render is a standalone WAV, so source
 * leases need survive rendering, not subsequent mixer playback of that WAV.
 */
import path from 'node:path';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { config } from '../config.js';
import * as settings from '../settings.js';
import { quietOnlyEnabled } from '../music/analyze-quiet-pure.js';
import * as analyzer from '../music/analyzer.js';
import { bulkPassRunning } from '../music/tagger-lock.js';
import { RegularStemPreparation } from './regular-stem-preparation.js';
import { regularStemNeeds, type RegularStemQueueEvidence, type RegularStemWindowNeed } from './regular-stem-needs.js';
import { RegularStemWorkingCache } from './regular-stem-working-cache.js';

export class RegularStemRuntime {
  private readonly cache = new RegularStemWorkingCache(path.join(config.stateDir, 'regular-stems-working'));
  private queuedAt = new Map<string, number>();
  private wanted = new Map<string, RegularStemWindowNeed>();
  private membership: Promise<void> = Promise.resolve();
  private renderPair: [string, string] | null = null;
  private wake: () => void = () => {};
  private log: (message: string) => void = () => {};
  readonly lane = new RegularStemPreparation({
    run: need => this.prepare(need.key),
    ready: () => this.wake(),
    failed: (_need, error) => { this.log(`Regular stems preparation skipped: ${error instanceof Error ? error.message : String(error ?? 'not ready')}`); this.wake(); },
    available: () => {
      if (bulkPassRunning()) return false;
      const pair = this.renderPair && this.pair(...this.renderPair);
      return !pair || ![pair.tail, pair.head].every(need => this.lane.state(need.key) === 'ready');
    },
  });

  update(currentId: string | null, queue: readonly RegularStemQueueEvidence[],
    wake: () => void, log: (message: string) => void): void {
    this.wake = wake; this.log = log;
    const first = queue.findIndex(item => !item.sent);
    this.renderPair = first >= 0 && queue[first+1] ? [queue[first].id,queue[first+1].id] : null;
    const needs = regularStemNeeds(queue, Date.now());
    for (const need of needs) if (!this.queuedAt.has(need.key)) this.queuedAt.set(need.key, Date.now());
    const keys = new Set(needs.map(need => need.key));
    for (const key of this.queuedAt.keys()) if (!keys.has(key)) this.queuedAt.delete(key);
    this.wanted = new Map(needs.map(need => [need.key, need]));
    this.membership = this.cache.reconcile(currentId, queue.map(item => item.id));
    // Rejection is handled here as well as by the job waiting on membership.
    void this.membership.catch(error => this.log(`Regular stems working cache unavailable: ${String(error)}`));
    this.lane.update(needs);
  }

  pair(outId: string, inId: string): { tail: RegularStemWindowNeed; head: RegularStemWindowNeed } | null {
    const tail = [...this.wanted.values()].find(n => n.trackId === outId && n.side === 'tail');
    const head = [...this.wanted.values()].find(n => n.trackId === inId && n.side === 'head'
      && tail && n.endMs-n.startMs === tail.endMs-tail.startMs);
    return tail && head ? { tail, head } : null;
  }
  pending(outId: string, inId: string): boolean {
    const pair = this.pair(outId, inId);
    if (!pair) return false;
    const states = [pair.tail,pair.head].map(need => this.lane.state(need.key));
    return !states.some(state => state === 'failed' || state === 'absent')
      && states.some(state => state === 'pending' || state === 'running');
  }
  directory(need: RegularStemWindowNeed): string {
    return path.join(this.cache.directoryFor(need.trackId), need.key);
  }
  private async verified(need: RegularStemWindowNeed): Promise<boolean> {
    try {
      const stamp = JSON.parse(await readFile(path.join(this.directory(need), `${need.side}-regular.json`), 'utf8'));
      if (stamp.key !== need.key || stamp.start_ms !== need.startMs || stamp.end_ms !== need.endMs
          || stamp.source_sha256 !== need.sourceSha256 || stamp.source_bytes !== need.sourceBytes
          || stamp.model !== 'htdemucs' || stamp.device !== 'cpu' || stamp.version !== 2
          || stamp.sample_rate !== 44100 || !Number.isSafeInteger(stamp.samples)
          || Math.abs(stamp.samples - Math.round((need.endMs-need.startMs)*44.1)) > 2) return false;
      for (const stem of ['drums','bass','other','vocals']) await access(path.join(this.directory(need),`${need.side}-${stem}.flac`));
      return true;
    } catch { return false; }
  }
  async sources(outId: string, inId: string) {
    const pair = this.pair(outId, inId);
    if (!pair || await this.cache.hasBusyJob()) return null;
    const tailLease = await this.cache.acquire(outId);
    const headLease = await this.cache.acquire(inId);
    const markers = [tailLease,headLease].flatMap(lease => lease ? [path.join(lease.directory,'.regular-render-busy.json')] : []);
    const release = async (completed = true) => {
      if (completed) for (const marker of markers) await rm(marker,{force:true}).catch(() => {});
      await tailLease?.release(); await headLease?.release();
    };
    if (!tailLease || !headLease || !await this.verified(pair.tail) || !await this.verified(pair.head)) {
      await release(); return null;
    }
    try {
      for (const marker of markers) await writeFile(marker,JSON.stringify({until:Date.now()+Math.max(60000,config.analyzer.renderTimeoutMs+5000)}));
    } catch { await release(); return null; }
    return { tail: { stemsDir: this.directory(pair.tail), regularKey: pair.tail.key },
      head: { stemsDir: this.directory(pair.head), regularKey: pair.head.key }, release };
  }
  private async prepare(key: string): Promise<boolean | 'deferred'> {
    await this.membership;
    const need = this.wanted.get(key);
    if (!need || quietOnlyEnabled(process.env.ANALYZE_QUIET_ONLY,settings.get().audio)
        || !await analyzer.regularStemsAvailable()) return false;
    const pair = this.renderPair && this.pair(...this.renderPair);
    if (need.side === 'head' && pair?.head.key === key && this.lane.state(pair.tail.key) === 'failed') return false;
    const lease = await this.cache.acquire(need.trackId);
    if (!lease) return false;
    let staged: Awaited<ReturnType<typeof analyzer.downloadCapped>> | null = null;
    try {
      if (await this.verified(need)) return true;
      if (await this.cache.hasBusyJob()) return 'deferred';
      if (Date.now() >= need.deadlineMs || !this.wanted.has(key)) return false;
      staged = await analyzer.downloadCapped(need.trackId);
      if (quietOnlyEnabled(process.env.ANALYZE_QUIET_ONLY,settings.get().audio)) return false;
      if (bulkPassRunning()) return 'deferred';
      if (!staged.complete || Date.now() >= need.deadlineMs || !this.wanted.has(key)) return false;
      await writeFile(path.join(lease.directory, '.subwave-regular-stems'), '1');
      const busy = path.join(lease.directory, '.regular-busy.json');
      await writeFile(busy, JSON.stringify({ until: Date.now()+10*60_000 }));
      const directory = this.directory(need);
      await rm(directory, { recursive: true, force: true });
      await mkdir(directory, { recursive: true });
      this.log(`Regular stems: preparing ${need.trackId} (${need.side}, CPU)`);
      const processingStarted = Date.now();
      const waitedMs = processingStarted - (this.queuedAt.get(key) ?? processingStarted);
      await analyzer.analyzeFacets(need.trackId, { facets: ['stems'], stems_device: 'cpu',
        stems_dir: directory, complete: true, timeoutMs: Math.min(300_000, need.deadlineMs-Date.now()),
        regular_stem_window: { version: 2, side: need.side, start_ms: need.startMs, end_ms: need.endMs,
          key: need.key, source_sha256: need.sourceSha256, source_bytes: need.sourceBytes, model: 'htdemucs' },
      }, staged.path);
      await rm(busy, { force: true });
      const verified = await this.verified(need);
      if (verified) this.log(`Regular stems: ${need.trackId} ${need.side} ready; processing ${((Date.now()-processingStarted)/1000).toFixed(1)}s, wait/download ${(waitedMs/1000).toFixed(1)}s`);
      return verified;
    } finally {
      if (staged) await rm(staged.path, { force: true }).catch(() => {});
      await lease.release();
    }
  }
}
export const regularStemRuntime = new RegularStemRuntime();
