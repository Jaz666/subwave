// Background-only collection orchestration. Nothing in this module is used by
// generateLink; callers must fire-and-forget admission from queue/play history.
import * as settings from '../settings.js';
import * as subsonic from '../music/subsonic.js';
import * as repository from './repository.js';
import { GeniusRequestError, GeniusProvider } from './genius.js';
import { collectionPlan } from './runtime.js';
import type { SleeveEntityInput, SleeveProvider } from './provider.js';
import { exactLocalMatches } from './resolver.js';

const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 60 * 60 * 1000;
const ONE_HOP_TARGET_LIMIT = 6;

export function retryDelayMs(attempts: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), RETRY_MAX_MS);
}

export function configuredPlan() {
  const current = settings.get();
  return collectionPlan({
    enabled: current.djBehaviour.extendedSleeveNotes === true,
    providerConfigured: current.sleeveNotes.providers.genius.enabled === true && !!process.env.GENIUS_ACCESS_TOKEN,
  });
}

export class SleeveCollector {
  private running = false;
  constructor(private readonly provider: SleeveProvider) {}

  /** Safe to invoke from a queue or watcher: disabled admission does not open the DB. */
  admit(entity: SleeveEntityInput, priority = 0): void {
    if (!configuredPlan().run) return;
    if (!entity.title.trim()) return;
    const stored = repository.upsertEntity(entity);
    repository.recordDiscovery({ entityId: stored.id, rootEntityId: stored.id, origin: 'station', depth: 0 });
    repository.enqueueJob({ provider: this.provider.id, entityId: stored.id, kind: 'fetch', priority, depth: 0, rootEntityId: stored.id });
  }

  async runOnce(): Promise<boolean> {
    if (this.running || !configuredPlan().run) return false;
    const job = repository.nextDueJob(this.provider.id);
    if (!job) return false;
    this.running = true;
    try {
      // Recheck immediately before network activity; an operator can turn the
      // switch off after admission but before this low-priority worker runs.
      if (!configuredPlan().run) return false;
      repository.markJobRunning(job.id);
      const entity = repository.entityFor(job.entityId);
      if (!entity) { repository.finishJob(job.id, job.entityId, job.provider, 'no-match'); return true; }
      if (job.kind === 'resolve') {
        await this.resolve(job, entity);
        return true;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const result = await this.provider.fetch({
          kind: entity.kind, title: entity.title, artist: entity.artist ?? undefined,
          releaseTitle: entity.releaseTitle ?? undefined, localId: entity.localId ?? undefined,
        }, controller.signal);
        if (!result) repository.finishJob(job.id, job.entityId, job.provider, 'no-match');
        else {
          const targets = repository.retainProviderResult(job.entityId, job.provider, result, { includeRelationships: job.depth === 0 });
          // The first related layer can be enriched, but it is terminal: a
          // depth-1 response never creates another retrieval job.
          if (job.depth === 0) {
            const rootEntityId = job.rootEntityId ?? job.entityId;
            for (const targetId of targets.slice(0, ONE_HOP_TARGET_LIMIT)) {
              repository.recordDiscovery({ entityId: targetId, rootEntityId, origin: 'relationship', depth: 1 });
              repository.enqueueJob({ provider: job.provider, entityId: targetId, kind: 'fetch', priority: Math.max(0, job.priority - 1), depth: 1, rootEntityId });
              repository.enqueueJob({ provider: job.provider, entityId: targetId, kind: 'resolve', priority: Math.max(0, job.priority - 1), depth: 1, rootEntityId });
            }
          }
        }
      } finally { clearTimeout(timeout); }
      return true;
    } catch (error) {
      const status = error instanceof GeniusRequestError ? error.status : 0;
      // 4xx except rate limiting are durable negative results; transient and
      // rate-limit failures back off without exposing provider errors on air.
      if (status >= 400 && status < 500 && status !== 429) repository.finishJob(job.id, job.entityId, job.provider, 'no-match');
      else repository.retryJob(job.id, job.entityId, job.provider, job.attempts + 1, retryDelayMs(job.attempts + 1));
      return true;
    } finally { this.running = false; }
  }

  private async resolve(job: repository.SleeveJob, entity: repository.StoredEntity): Promise<void> {
    const identity = repository.identityForEntity(job.provider, entity.id);
    if (!identity || !entity.artist) { repository.finishJob(job.id, job.entityId, job.provider, 'no-match'); return; }
    const songs = await subsonic.search(`${entity.title} ${entity.artist}`, { songCount: 25 });
    const matches = exactLocalMatches({ title: entity.title, artist: entity.artist }, songs);
    const ids = matches.map((song) => String(song.id));
    if (!ids.length) {
      repository.setResolutionState(identity.id, 'unavailable');
      repository.finishJob(job.id, job.entityId, job.provider, 'no-match');
      return;
    }
    repository.retainLocalMatches(identity.id, ids, 'confident');
    repository.setResolutionState(identity.id, 'confident');
    repository.finishJob(job.id, job.entityId, job.provider, 'ready');
  }
}

let liveCollector: SleeveCollector | null = null;
export function collector(): SleeveCollector | null {
  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) return null;
  return liveCollector ??= new SleeveCollector(new GeniusProvider(token));
}

let timer: ReturnType<typeof setInterval> | null = null;
/** The bounded worker is deliberately independent of queue/watcher timing. */
export function startCollector(): void {
  if (timer) return;
  timer = setInterval(() => {
    const current = collector();
    if (current) void current.runOnce();
  }, 2_000);
  timer.unref();
}
