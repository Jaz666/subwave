import * as settings from '../settings.js';
import { GeniusProvider, GeniusRequestError } from './genius.js';
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

  constructor(private readonly quietGate: QuietGate) {}

  async runOnce(): Promise<boolean> {
    const token = process.env.GENIUS_ACCESS_TOKEN;
    if (this.running || Date.now() < this.notBefore || !this.isEnabled() || !token || !this.quietGate.isQuiet()) return false;
    const job = repository.nextPendingResearchJob('genius', { subjectType: 'recording', capability: 'connections' });
    if (!job) return false;
    const recording = repository.recordingForGenius(job.subjectId);
    if (!recording) { repository.finishResearchJob(job.id, 'failed'); return true; }

    this.running = true;
    repository.markResearchJobRunning(job.id);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const provider = new GeniusProvider(token, this.budgetedFetch(controller.signal));
      const result = await provider.fetch({ kind: 'track', title: recording.title, artist: recording.artist ?? undefined }, controller.signal);
      if (result) repository.retainGeniusResult(recording, result);
      repository.finishResearchJob(job.id, 'complete');
    } catch (error) {
      if (error instanceof GeniusBudgetWait) {
        repository.retryResearchJob(job.id, error.waitMs);
        this.notBefore = Date.now() + error.waitMs;
      } else if (error instanceof GeniusWorkPaused) {
        repository.requeueResearchJob(job.id);
      } else if (error instanceof GeniusRequestError && (error.status === 401 || error.status === 403)) {
        repository.finishResearchJob(job.id, 'failed');
      } else if (error instanceof GeniusRequestError && error.status >= 400 && error.status < 500 && error.status !== 429) {
        repository.finishResearchJob(job.id, 'complete');
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

  private budgetedFetch(signal: AbortSignal): FetchLike {
    return async (input, init) => {
      const requestSignal = init?.signal ?? signal;
      let requestId: string | null = null;
      while (!requestId) {
        if (!this.isEnabled() || !this.quietGate.isQuiet()) throw new GeniusWorkPaused();
        if (requestSignal.aborted) throw requestSignal.reason ?? new Error('Genius request aborted');
        const reservation = repository.reserveGeniusProviderRequest();
        if ('requestId' in reservation) requestId = reservation.requestId;
        else if (reservation.waitMs > REQUEST_WAIT_LIMIT_MS) throw new GeniusBudgetWait(reservation.waitMs);
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
