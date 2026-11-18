// Preparation/batch-owned lyric evidence for Sub/Beats auditions. Matching/playback never
// waits on LRCLIB. The listener's cached lyric choice and library cues stay separate.
import { readFileSync, mkdirSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { subbeatsLyricEvidenceSchema, subbeatsLyricFileSchema, type subbeatsJobSchema } from '../schemas/subbeats.js';
import { writeFileAtomic } from '../util/atomic-file.js';
import { isInstrumentalMarker } from './lyric-vocal.js';
import { parseLrc } from './lrc.js';
import { rankVersionMatches, type LrclibRecord, type LrclibTrack } from './lrclib.js';
import type { StructuredLyricsInput } from './lyrics-public.js';

type Evidence = ReturnType<typeof subbeatsLyricEvidenceSchema.parse>;
type Job = ReturnType<typeof subbeatsJobSchema.parse>;
const evidencePath = (stateDir:string) => join(stateDir,'subbeats','lyric-evidence.json');
const fold = (text:string) => text.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');

export function lyricStarts(lyrics:StructuredLyricsInput|null, durationSec:number):number[] {
  if (!lyrics?.synced) return [];
  return lyrics.lines.filter(line => line.text.trim() && !isInstrumentalMarker(line.text)
    && Number.isFinite(line.startMs) && line.startMs >= 0 && line.startMs < durationSec*1000)
    .map(line => line.startMs/1000).sort((a,b) => a-b);
}

export function selectSubbeatsLyrics(bundleKey:string, track:LrclibTrack, server:StructuredLyricsInput|null,
  candidates:readonly LrclibRecord[], instrumental:boolean|null):Evidence {
  const ranked=rankVersionMatches(candidates,track);
  const serverStarts=lyricStarts(server,track.durationSec);
  const selected=serverStarts.length ? null : ranked.find(r => lyricStarts(parseLrc(r.syncedLyrics),track.durationSec).length) ?? null;
  const starts=serverStarts.length ? serverStarts : lyricStarts(parseLrc(selected?.syncedLyrics),track.durationSec);
  const source=serverStarts.length ? 'music-server' : selected ? 'lrclib' : server ? 'music-server' : ranked.length ? 'lrclib' : null;
  const hasWords=server?.lines.some(line => line.text.trim() && !isInstrumentalMarker(line.text))
    || ranked.some(r => r.plainLyrics?.trim());
  const markedInstrumental=!!server?.lines.length && server.lines.every(line => isInstrumentalMarker(line.text))
    || !serverStarts.length && !selected && ranked.some(r => r.instrumental === true);
  const alternatives=serverStarts.length ? [] : ranked.map(r => lyricStarts(parseLrc(r.syncedLyrics),track.durationSec)).filter(a => a.length);
  const spread=(values:number[]) => values.length ? Math.max(...values)-Math.min(...values) : 0;
  const exactMetadata=!!selected && fold(track.title)===fold(selected.trackName ?? '')
    && !!track.album && fold(track.album)===fold(selected.albumName ?? '');
  const invalidServerTiming=server?.synced && server.lines.some(line => line.text.trim() && !isInstrumentalMarker(line.text)
    && (!Number.isFinite(line.startMs) || line.startMs < 0 || line.startMs >= track.durationSec*1000));
  const versionConfidence=invalidServerTiming ? 'low' : serverStarts.length || exactMetadata ? 'medium' : starts.length ? 'low' : 'unknown';
  return {
    bundleKey,source,status:starts.length ? 'timed' : markedInstrumental ? 'instrumental' : hasWords ? 'unsynced' : 'no-lyrics',
    firstSeconds:starts[0] ?? null,lastStartSeconds:starts.at(-1) ?? null,
    versionConfidence,versionReason:invalidServerTiming ? 'Some music-server lyric timestamps fall outside this recording.'
      : serverStarts.length ? 'Timed lyrics supplied by the music server; audio timing remains unverified.'
      : exactMetadata ? 'Title, album and nearby duration agree; audio timing remains unverified.'
      : starts.length ? 'A nearby-duration lyric version was found, but album or full title differs.' : 'No usable timed lyrics.',
    candidateCount:alternatives.length,firstSpreadSeconds:spread(alternatives.map(a => a[0]!)),
    tailSpreadSeconds:spread(alternatives.map(a => a.at(-1)!)),
    selected:selected ? {id:selected.id ?? null,title:selected.trackName ?? '',artist:selected.artistName ?? '',
      album:selected.albumName ?? '',durationSeconds:Number(selected.duration)} : null,
    instrumental,reviewedHeadSeconds:null,reviewedTailSeconds:null,
  };
}

function loadSubbeatsLyrics(stateDir:string):Record<string,Evidence> {
  try { return subbeatsLyricFileSchema.parse(JSON.parse(readFileSync(evidencePath(stateDir),'utf8'))).tracks; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error('Cannot read saved Sub/Beats lyric evidence. Existing corrections were not overwritten.', {cause:error});
  }
}

export function readSubbeatsLyrics(stateDir:string):Record<string,Evidence> {
  try { return loadSubbeatsLyrics(stateDir); }
  catch {
    console.warn('[subbeats] Lyric evidence unavailable; pairing remains uncertain.');
    return {};
  }
}

// Serialize preparation and explicit scans across processes. A crashed writer
// leaves the lock for inspection rather than risking the reviewed corrections.
export async function saveSubbeatsLyrics(stateDir:string, tracks:Record<string,Evidence>) {
  const root=join(stateDir,'subbeats'),lock=join(root,'.lyric-evidence.lock');
  mkdirSync(root,{recursive:true});
  try { mkdirSync(lock); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('Sub/Beats lyric evidence is locked. Retry after the other save finishes; if interrupted, check and remove .lyric-evidence.lock.');
    }
    throw error;
  }
  try {
    const previous=loadSubbeatsLyrics(stateDir);
    for (const [id,row] of Object.entries(tracks)) {
      previous[id]={...row,...(previous[id]?.bundleKey===row.bundleKey ? {
        reviewedHeadSeconds:previous[id]!.reviewedHeadSeconds,
        reviewedTailSeconds:previous[id]!.reviewedTailSeconds,
      } : {})};
    }
    await writeFileAtomic(evidencePath(stateDir),JSON.stringify(subbeatsLyricFileSchema.parse({version:1,tracks:previous}),null,2)+'\n');
  } finally {
    rmdirSync(lock);
  }
}

export function withSubbeatsLyrics(jobs:Job[],stateDir:string):Job[] {
  const saved=readSubbeatsLyrics(stateDir);
  return jobs.map(job => ({...job,lyricEvidence:saved[job.id]?.bundleKey===job.bundleKey ? saved[job.id] : undefined}));
}
