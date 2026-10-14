// Quiet-time, resumable Navidrome sweep for all cached MusicBrainz Series.
// Exact recording and release-group MBIDs attach claims without making the DJ
// wait for provider calls or bulk-enqueueing unrelated biography research.
import * as subsonic from '../music/subsonic.js';
import * as musicbrainz from '../music/musicbrainz.js';
import * as settings from '../settings.js';
import * as repository from './research-repository.js';
import type { QuietGate } from './musicbrainz-worker.js';

const ALBUMS_PER_PASS = 25;
const PASS_INTERVAL_MS = 60_000;
const RETRY_INTERVAL_MS = 10 * 60_000;

function titleKey(value: unknown): string {
  return String(value ?? '').replace(/\s*[\[(][^)\]]*(?:remaster|deluxe|expanded|anniversary|edition|reissue|bonus)[^)\]]*[)\]]\s*$/iu, '')
    .toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export class MusicBrainzSeriesLibraryWorker {
  private running = false;

  constructor(private readonly quietGate: QuietGate) {}

  async runOnce(): Promise<boolean> {
    if (this.running || settings.get().djBehaviour.extendedSleeveNotes !== true || !this.quietGate.isQuiet()) return false;
    if (!repository.hasCachedSeriesMembers()) return false;
    const offset = repository.dueSeriesLibraryScanOffset();
    if (offset == null) return false;
    this.running = true;
    try {
      const albums = await subsonic.getAlbumList(offset, ALBUMS_PER_PASS);
      if (!albums.length) {
        repository.advanceSeriesLibraryScan(null);
        console.log('[sleeve-notes] MusicBrainz Series library sweep complete');
        return true;
      }
      const titles = repository.seriesAlbumTitleHints();
      let linked = 0;
      let processed = 0;
      for (const album of albums) {
        if (!this.quietGate.isQuiet()) break;
        const localAlbumId = String(album?.id ?? '').trim();
        if (!localAlbumId) { processed++; continue; }
        const detail = await subsonic.getAlbumWithSongs(localAlbumId);
        if (!detail) { processed++; continue; }
        const songs = detail.songs.map((song) => ({
          id: String(song?.id ?? '').trim(),
          musicBrainzId: typeof song?.musicBrainzId === 'string' ? song.musicBrainzId.trim().toLowerCase() : null,
        })).filter((song) => song.id);
        const albumMbid = String(detail.album.musicBrainzId ?? album.musicBrainzId ?? '').trim().toLowerCase();
        const mayBeListed = titles.has(titleKey(detail.album.name ?? album.name));
        let releaseGroupMbid: string | null = null;
        if (albumMbid && repository.isCachedSeriesReleaseGroup(albumMbid)) {
          releaseGroupMbid = albumMbid;
        } else if (albumMbid) {
          const cached = repository.cachedSeriesReleaseGroupForRelease(albumMbid);
          if (cached) releaseGroupMbid = cached.releaseGroupMbid;
          else if (mayBeListed) {
            releaseGroupMbid = await musicbrainz.lookupReleaseGroupForRelease(albumMbid);
            repository.cacheSeriesReleaseGroupForRelease(albumMbid, releaseGroupMbid);
          }
        }
        linked += repository.retainLibrarySeriesClaims({ localAlbumId, releaseGroupMbid, songs });
        processed++;
      }
      repository.advanceSeriesLibraryScan(offset + processed);
      if (linked) console.log(`[sleeve-notes] MusicBrainz Series library sweep attached ${linked} local claim link${linked === 1 ? '' : 's'} (albums ${offset + 1}–${offset + processed})`);
      return true;
    } catch (error) {
      // Keep the cursor on this page. Successfully processed albums are safe to
      // revisit; no skipped page is silently treated as complete.
      repository.deferSeriesLibraryScan(RETRY_INTERVAL_MS);
      console.warn(`[sleeve-notes] MusicBrainz Series library sweep deferred: ${error instanceof Error ? error.message : String(error)}`);
      return true;
    } finally {
      this.running = false;
    }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startMusicBrainzSeriesLibraryWorker(quietGate: QuietGate): void {
  if (timer) return;
  const worker = new MusicBrainzSeriesLibraryWorker(quietGate);
  void worker.runOnce();
  timer = setInterval(() => { void worker.runOnce(); }, PASS_INTERVAL_MS);
  timer.unref();
}
