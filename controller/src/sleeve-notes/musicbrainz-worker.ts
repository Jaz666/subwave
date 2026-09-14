// Quiet-time Stage 2 matching. This intentionally has no timer or server
// wiring yet: the caller must supply the station's playback-critical quiet
// gate, so a future scheduler cannot accidentally turn it into a foreground
// collector.
import * as musicbrainz from '../music/musicbrainz.js';
import * as settings from '../settings.js';
import * as repository from './research-repository.js';

export interface QuietGate {
  isQuiet(): boolean;
}

export interface CanonicalRecordingLookup {
  lookup(track: { title: string; artist: string | null; mbid: string | null }): Promise<musicbrainz.CanonicalMusicBrainzRecording | null>;
}

export class MusicBrainzMatchWorker {
  private running = false;

  constructor(
    private readonly quietGate: QuietGate,
    private readonly lookup: CanonicalRecordingLookup = { lookup: musicbrainz.lookupCanonicalRecording },
  ) {}

  async runOnce(): Promise<boolean> {
    if (this.running || settings.get().djBehaviour.extendedSleeveNotes !== true || !this.quietGate.isQuiet()) return false;
    const job = repository.nextPendingResearchJob('musicbrainz', { subjectType: 'local-track', capability: 'match' })
      ?? repository.nextPendingResearchJob('musicbrainz', { subjectType: 'release', capability: 'release-context' });
    if (!job) return false;
    if (job.subjectType === 'release') return this.retainReleaseContext(job);
    const attachment = repository.localAttachmentForMatch(job.subjectId);
    if (!attachment) {
      repository.finishResearchJob(job.id, 'failed');
      return true;
    }
    this.running = true;
    try {
      repository.markResearchJobRunning(job.id);
      try {
        const result = await this.lookup.lookup({
          title: attachment.title, artist: attachment.artist, mbid: attachment.musicbrainzRecordingId,
        });
        if (!result) repository.finishResearchJob(job.id, 'failed');
        else {
          repository.retainCanonicalMusicBrainzMatch(attachment.localTrackId, result);
          repository.finishResearchJob(job.id, 'complete');
        }
      } catch {
        repository.finishResearchJob(job.id, 'failed');
      }
      return true;
    } finally {
      this.running = false;
    }
  }

  private async retainReleaseContext(job: repository.PendingResearchJob): Promise<boolean> {
    const release = repository.canonicalReleaseForResearch(job.subjectId);
    if (!release) { repository.finishResearchJob(job.id, 'failed'); return true; }
    this.running = true;
    try {
      repository.markResearchJobRunning(job.id);
      repository.retainSourceDocument({
        entityType: 'release', entityId: release.id, provider: 'musicbrainz',
        sourceUrl: `https://musicbrainz.org/release/${encodeURIComponent(release.musicbrainzReleaseId)}`,
        revisionId: null, contentKind: 'structured-json', attribution: 'MusicBrainz data, CC0',
        content: JSON.stringify({
          title: release.title, date: release.date, country: release.country,
          primaryType: release.primaryType, status: release.status,
          releaseGroupId: release.releaseGroupId, selectionReason: release.selectionReason,
        }),
      });
      repository.finishResearchJob(job.id, 'complete');
      return true;
    } finally { this.running = false; }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Start the deliberately slow, single-flight Stage-2 matcher. */
export function startMusicBrainzMatchWorker(quietGate: QuietGate): void {
  if (timer) return;
  const worker = new MusicBrainzMatchWorker(quietGate);
  timer = setInterval(() => { void worker.runOnce(); }, 5_000);
  timer.unref();
}
