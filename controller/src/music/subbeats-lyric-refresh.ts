// Shared lookup for preparation and explicit scans. Never called by playback.
import { config } from '../config.js';
import * as db from './library-db.js';
import * as library from './library.js';
import { isInstrumental } from './lyric-vocal.js';
import { externalLyrics, fallbackEnabled, musicServerLyrics } from './lyrics-sources.js';
import { lrclib } from './lrclib.js';
import { lyricStarts, saveSubbeatsLyrics, selectSubbeatsLyrics } from './subbeats-lyrics.js';

export async function lookupSubbeatsLyrics(id:string,bundleKey:string) {
  const track=db.getTrack(id);
  if (!track) throw new Error('Track is not in the library');
  const meta={title:track.title ?? '',artist:track.artist ?? '',album:track.album,durationSec:track.durationSec ?? 0};
  const fallback=fallbackEnabled();
  let unavailable=false;
  const server=await musicServerLyrics(id).catch(() => { unavailable=true; return null; });
  const candidates=lyricStarts(server,meta.durationSec).length || !fallback ? []
    : await lrclib().candidates(meta).catch(() => { unavailable=true; return []; });
  const evidence=selectSubbeatsLyrics(bundleKey,meta,server,candidates,isInstrumental(track));
  if (evidence.firstSeconds===null && fallback) {
    const cached=lyricStarts(externalLyrics(await library.getExternalLyrics(id)),meta.durationSec);
    if (cached.length) Object.assign(evidence,{source:'lrclib',status:'timed',firstSeconds:cached[0],lastStartSeconds:cached.at(-1),
      versionConfidence:'low',versionReason:'Cached lyrics are available, but their version metadata could not be verified.'});
  }
  if (unavailable && evidence.status==='no-lyrics') evidence.status='unavailable';
  return evidence;
}

// Lyric lookup/storage failure never turns usable stems into failed preparation.
export async function refreshPreparedSubbeatsLyrics(id:string,bundleKey:string):Promise<void> {
  try {
    const evidence=await lookupSubbeatsLyrics(id,bundleKey);
    await saveSubbeatsLyrics(config.stateDir,{[id]:evidence});
  } catch (error) {
    console.warn(`[subbeats] Lyric refresh for ${id} could not be saved; prepared stems remain usable. ${error instanceof Error ? error.message : String(error)}`);
  }
}
