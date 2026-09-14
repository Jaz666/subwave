import * as settings from '../settings.js';
import * as repository from './research-repository.js';
import * as wikipedia from './wikipedia.js';
import type { QuietGate } from './musicbrainz-worker.js';

export class WikipediaArtistWorker {
  private running = false;
  constructor(private readonly quietGate: QuietGate) {}

  async runOnce(): Promise<boolean> {
    if (this.running || settings.get().djBehaviour.extendedSleeveNotes !== true || !this.quietGate.isQuiet()) return false;
    const job = repository.nextPendingResearchJob('wikipedia', { subjectType: 'artist', capability: 'biography' });
    if (!job) return false;
    const artist = repository.artistForResearch(job.subjectId);
    if (!artist) { repository.finishResearchJob(job.id, 'failed'); return true; }
    this.running = true;
    try {
      repository.markResearchJobRunning(job.id);
      const document = await wikipedia.fetchWikipediaArtistDocument(artist.name);
      if (!document) repository.finishResearchJob(job.id, 'failed');
      else {
        repository.retainSourceDocument({
          entityType: 'artist', entityId: artist.id, provider: 'wikipedia',
          sourceUrl: document.url, revisionId: document.revisionId,
          contentKind: 'bounded-text', content: document.text, attribution: document.attribution,
        });
        repository.enqueueResearchJob({
          provider: 'researcher', subjectType: 'artist', subjectId: artist.id,
          capability: 'extract-wikipedia', priority: 300,
        });
        repository.finishResearchJob(job.id, 'complete');
      }
      return true;
    } finally { this.running = false; }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startWikipediaArtistWorker(quietGate: QuietGate): void {
  if (timer) return;
  const worker = new WikipediaArtistWorker(quietGate);
  timer = setInterval(() => { void worker.runOnce(); }, 5_000);
  timer.unref();
}
