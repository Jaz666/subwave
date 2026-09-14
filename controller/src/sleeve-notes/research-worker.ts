import * as settings from '../settings.js';
import { LlmResearcher } from './llm-researcher.js';
import type { Researcher } from './researcher.js';
import { validateResearchCandidates } from './researcher.js';
import * as repository from './research-repository.js';
import type { QuietGate } from './musicbrainz-worker.js';

const MAX_SOURCE_CHARS = 6_000;

/** Controller-owned final gate from stored evidence to retained artist claims. */
export class ResearchWorker {
  private running = false;
  constructor(private readonly quietGate: QuietGate, private readonly researcher: Researcher = new LlmResearcher()) {}

  async runOnce(): Promise<boolean> {
    if (this.running || settings.get().djBehaviour.extendedSleeveNotes !== true || !this.quietGate.isQuiet()) return false;
    const queued = repository.nextPendingResearchJob('researcher', { subjectType: 'artist', capability: 'extract-wikipedia' });
    if (!queued) return false;
    const source = repository.latestSourceDocumentForResearch('artist', queued.subjectId, 'wikipedia');
    if (!source) { repository.finishResearchJob(queued.id, 'failed'); return true; }
    this.running = true;
    try {
      repository.markResearchJobRunning(queued.id);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45_000);
      try {
        const job = {
          id: queued.id,
          document: { ...source, text: source.content.slice(0, MAX_SOURCE_CHARS) },
          categories: ['artist-stories', 'milestones'] as const,
          maxCandidates: 3,
        };
        const candidates = await this.researcher.extract(job, controller.signal);
        const validated = validateResearchCandidates(job, candidates);
        repository.retainResearchClaims({
          entityType: 'artist', entityId: source.entityId, sourceDocumentId: source.id,
          candidates: validated.accepted,
        });
        repository.finishResearchJob(queued.id, 'complete');
      } catch {
        repository.finishResearchJob(queued.id, 'failed');
      } finally { clearTimeout(timeout); }
      return true;
    } finally { this.running = false; }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startResearchWorker(quietGate: QuietGate): void {
  if (timer) return;
  const worker = new ResearchWorker(quietGate);
  timer = setInterval(() => { void worker.runOnce(); }, 10_000);
  timer.unref();
}
