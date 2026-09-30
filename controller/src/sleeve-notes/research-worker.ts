import * as settings from '../settings.js';
import { LlmResearcher } from './llm-researcher.js';
import type { Researcher, ResearchOutcomeObserver } from './researcher.js';
import {
  MAX_CANDIDATES_PER_ARTIST_RESEARCH,
  RELEASE_GROUP_NOTE_CATEGORIES,
  SLEEVE_NOTE_CATEGORIES,
  validateResearchCandidates,
} from './researcher.js';
import * as repository from './research-repository.js';
import type { QuietGate } from './musicbrainz-worker.js';

const MAX_SOURCE_CHARS = 6_000;

/** Controller-owned final gate from stored evidence to retained research claims. */
export class ResearchWorker {
  private running = false;
  constructor(private readonly quietGate: QuietGate, private readonly researcher: Researcher = new LlmResearcher()) {}

  async runOnce(): Promise<boolean> {
    if (this.running || settings.get().djBehaviour.extendedSleeveNotes !== true || !this.quietGate.isQuiet()) return false;
    const releaseGroupJob = repository.nextPendingResearchJob('researcher', {
      subjectType: 'release', capability: 'extract-wikipedia-release-group',
    });
    const artistJob = releaseGroupJob ? null : repository.nextPendingResearchJob('researcher', {
      subjectType: 'artist', capability: 'extract-wikipedia',
    });
    const queued = releaseGroupJob ?? artistJob;
    if (!queued) return false;
    const entityType = releaseGroupJob ? 'release-group' : 'artist';
    const source = repository.latestSourceDocumentForResearch(entityType, queued.subjectId, 'wikipedia');
    if (!source) { repository.finishResearchJob(queued.id, 'failed'); return true; }
    this.running = true;
    try {
      console.log(releaseGroupJob
        ? `[sleeve-notes] Researching Wikipedia release group ${queued.subjectId}`
        : '[sleeve-notes] Researching Wikipedia biography');
      repository.markResearchJobRunning(queued.id);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45_000);
      try {
        const job = {
          id: queued.id,
          document: { ...source, text: source.content.slice(0, MAX_SOURCE_CHARS) },
          categories: releaseGroupJob ? RELEASE_GROUP_NOTE_CATEGORIES : SLEEVE_NOTE_CATEGORIES,
          maxCandidates: MAX_CANDIDATES_PER_ARTIST_RESEARCH,
        };
        const candidates = await this.researcher.extract(job, controller.signal);
        const validated = validateResearchCandidates(job, candidates);
        (this.researcher as Partial<ResearchOutcomeObserver>).recordOutcome?.(job, validated);
        repository.retainResearchClaims({
          entityType, entityId: source.entityId, sourceDocumentId: source.id,
          candidates: validated.accepted,
        });
        repository.finishResearchJob(queued.id, 'complete');
        console.log(`[sleeve-notes] Research retained ${validated.accepted.length} claim${validated.accepted.length === 1 ? '' : 's'} (${validated.rejected.length} rejected)`);
      } catch (err: any) {
        repository.finishResearchJob(queued.id, 'failed');
        console.warn(`[sleeve-notes] Research failed: ${err?.message || 'unknown error'}`);
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
