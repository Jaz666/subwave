import * as settings from '../settings.js';
import { GeniusProvider, GeniusRequestError } from './genius.js';
import { geniusAccessToken } from './genius-token.js';
import type { FetchLike } from './genius.js';
import type { QuietGate } from './musicbrainz-worker.js';
import * as repository from './research-repository.js';

const REQUEST_WAIT_LIMIT_MS = 5_000;
const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 60 * 60 * 1000;

class GeniusWorkPaused extends Error {}
class GeniusBudgetWait extends Error {
  constructor(readonly waitMs: number) { super('Genius request budget is currently full'); }
}

function retryDelayMs(attempts: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), RETRY_MAX_MS);
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

export class GeniusResearchWorker {
  private running = false;
  private notBefore = 0;
  private pilotQueued = false;

  constructor(private readonly quietGate: QuietGate) {}

  async runOnce(): Promise<boolean> {
    const token = geniusAccessToken();
    if (this.running || Date.now() < this.notBefore || !this.isEnabled() || !token || !this.quietGate.isQuiet()) return false;
    if (!this.pilotQueued) {
      const queued = repository.enqueueGeniusAlbumPilotJobs();
      if (queued) console.log(`[sleeve-notes] Queued ${queued} encountered albums for the Genius biography pilot`);
      this.pilotQueued = true;
    }
    const job = repository.nextPendingResearchJob('genius', { subjectType: 'recording', capability: 'connections' })
      ?? repository.nextPendingResearchJob('genius', { subjectType: 'release', capability: 'album-biography' });
    if (!job) return false;
    const recording = job.subjectType === 'recording' ? repository.recordingForGenius(job.subjectId) : null;
    const albumSource = job.subjectType === 'release' ? repository.geniusAlbumPilotSource(job.subjectId) : null;
    if (job.subjectType === 'release' && albumSource && (albumSource.songIds?.length ?? 1) < 3
      && repository.geniusAlbumConnectionsPending(job.subjectId)) {
      repository.retryResearchJob(job.id, 60_000);
      return true;
    }
    if ((job.subjectType === 'recording' && !recording) || (job.subjectType === 'release' && !albumSource)) {
      if (job.subjectType === 'release' && repository.geniusAlbumConnectionsPending(job.subjectId)) {
        repository.retryResearchJob(job.id, 60_000);
      } else repository.finishResearchJob(job.id, 'failed');
      return true;
    }

    this.running = true;
    repository.markResearchJobRunning(job.id);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), job.subjectType === 'release' ? 180_000 : 45_000);
    try {
      const provider = new GeniusProvider(token, this.budgetedFetch(controller.signal,
        job.subjectType === 'release' ? 'album-biography' : 'connections'));
      if (job.subjectType === 'release' && albumSource) {
        const lookup = await provider.fetchAlbumBiography(albumSource.songIds ?? [albumSource.songId],
          { title: albumSource.title, artist: albumSource.artist }, controller.signal);
        const biography = lookup.biography;
        if (biography) {
          repository.retainSourceDocument({
            entityType: 'release-group', entityId: albumSource.releaseGroupId,
            provider: 'genius', sourceUrl: biography.url, revisionId: null,
            contentKind: 'bounded-text', content: biography.text,
            attribution: 'Album description from Genius',
          });
          repository.enqueueResearchJob({
            provider: 'researcher', subjectType: 'release', subjectId: albumSource.releaseGroupId,
            capability: 'extract-genius-album', priority: 325,
            originLocalTrackId: job.originLocalTrackId,
          });
          console.log(`[sleeve-notes] Genius album biography retained: ${biography.artist} — ${biography.title}`);
        } else {
          console.log(`[sleeve-notes] Genius album biography skipped: ${albumSource.artist} — ${albumSource.title} (${lookup.reason})`);
        }
      } else if (recording) {
        const result = await provider.fetch({ kind: 'track', title: recording.title,
          artist: recording.artist ?? undefined }, controller.signal);
        if (result) repository.retainGeniusResult(recording, result);
      }
      repository.finishResearchJob(job.id, 'complete');
    } catch (error) {
      if (error instanceof GeniusBudgetWait) {
        repository.retryResearchJob(job.id, error.waitMs);
        this.notBefore = Date.now() + error.waitMs;
      } else if (error instanceof GeniusWorkPaused) {
        repository.requeueResearchJob(job.id);
      } else if (error instanceof GeniusRequestError && (error.status === 401 || error.status === 403)) {
        repository.finishResearchJob(job.id, 'failed');
        console.warn(`[sleeve-notes] Genius ${job.capability} request was denied (HTTP ${error.status})`);
      } else if (error instanceof GeniusRequestError && error.status >= 400 && error.status < 500 && error.status !== 429) {
        repository.finishResearchJob(job.id, 'complete');
        console.log(`[sleeve-notes] Genius ${job.capability} returned HTTP ${error.status}; no source retained`);
      } else {
        repository.retryResearchJob(job.id, retryDelayMs(job.attempts + 1));
      }
    } finally {
      clearTimeout(timeout);
      this.running = false;
    }
    return true;
  }

  private isEnabled(): boolean {
    return settings.get().djBehaviour.extendedSleeveNotes === true
      && settings.get().sleeveNotes.providers.genius.enabled === true;
  }

  private budgetedFetch(signal: AbortSignal, capability: string): FetchLike {
    return async (input, init) => {
      const requestSignal = init?.signal ?? signal;
      let requestId: string | null = null;
      while (!requestId) {
        if (!this.isEnabled() || !this.quietGate.isQuiet()) throw new GeniusWorkPaused();
        if (requestSignal.aborted) throw requestSignal.reason ?? new Error('Genius request aborted');
        const reservation = repository.reserveGeniusProviderRequest(new Date(), capability);
        if ('requestId' in reservation) requestId = reservation.requestId;
        else if (reservation.waitMs > (capability === 'album-biography' ? 65_000 : REQUEST_WAIT_LIMIT_MS)) {
          throw new GeniusBudgetWait(reservation.waitMs);
        }
        else await abortableDelay(reservation.waitMs, requestSignal);
      }
      try {
        const response = await fetch(input, init);
        const outcome = response.status === 429 ? 'rate-limited' : response.ok ? 'ready' : 'failed';
        repository.finishGeniusProviderRequest(requestId, outcome, response.status);
        return response;
      } catch (error) {
        repository.finishGeniusProviderRequest(requestId, 'failed', null);
        throw error;
      }
    };
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Start the explicitly enabled, lyrics-free Genius metadata worker. */
export function startGeniusResearchWorker(quietGate: QuietGate): void {
  if (timer) return;
  const worker = new GeniusResearchWorker(quietGate);
  timer = setInterval(() => { void worker.runOnce(); }, 2_000);
  timer.unref();
}
