// Compare synced lyric boundaries with the library's current intro/outro cues.
// --save publishes source-bound evidence for auditions, never library cues/ranges.
import { config } from '../src/config.js';
import { readFileSync } from 'node:fs';
import { loadSecretsIntoEnv } from '../src/setup/secrets.js';
import { loadNavidromeConfig } from '../src/setup/config.js';
import * as settings from '../src/settings.js';
import * as library from '../src/music/library.js';
import * as db from '../src/music/library-db.js';
import { readSubbeatsQueue } from '../src/music/subbeats-store.js';
import { saveSubbeatsLyrics } from '../src/music/subbeats-lyrics.js';
import { lookupSubbeatsLyrics } from '../src/music/subbeats-lyric-refresh.js';
import type { subbeatsLyricEvidenceSchema } from '../src/schemas/subbeats.js';

function idsFromArgs(args: string[]): string[] {
  const listAt = args.indexOf('--ids');
  const fileAt = args.indexOf('--ids-file');
  const list = listAt >= 0 ? args[listAt + 1] : undefined;
  const file = fileAt >= 0 ? args[fileAt + 1] : undefined;
  if (args.includes('--prepared')) {
    return readSubbeatsQueue(config.stateDir).jobs
      .filter(job => job.status === 'prepared' && job.bundleKey)
      .map(job => job.id);
  }
  if (list && !list.startsWith('--')) return [...new Set(list.split(',').map(id => id.trim()).filter(Boolean))];
  if (file && !file.startsWith('--')) {
    return [...new Set(readFileSync(file, 'utf8').split(/\r?\n/).map(line => line.replace(/#.*/, '').trim()).filter(Boolean))];
  }
  throw new Error('Use --prepared, --ids id1,id2, or --ids-file PATH');
}

async function main() {
  await loadSecretsIntoEnv();
  await loadNavidromeConfig();
  await settings.load();
  await library.load();
  const args = process.argv.slice(2);
  const ids = idsFromArgs(args);
  const jobs=readSubbeatsQueue(config.stateDir).jobs;
  const saved:Record<string,ReturnType<typeof subbeatsLyricEvidenceSchema.parse>>={};
  const rows = [];
  for (const id of ids) {
    const track = db.getTrack(id);
    if (!track) {
      rows.push({ id, status: 'not-in-library' });
      continue;
    }
    try {
      const job=jobs.find(job => job.id===id);
      if (!job?.bundleKey) { rows.push({id,status:'not-prepared'}); continue; }
      console.error(`[lyric-boundary-scan] ${rows.length+1}/${ids.length}: ${track.artist} — ${track.title}`);
      const evidence=await lookupSubbeatsLyrics(id,job.bundleKey);
      saved[id]=evidence;
      rows.push({
        id, artist: track.artist, title: track.title,...evidence,
        pending:false,firstLyricMs:evidence.firstSeconds===null ? null : evidence.firstSeconds*1000,
        lastLyricStartMs:evidence.lastStartSeconds===null ? null : evidence.lastStartSeconds*1000,lastLyricEndMs:null,
        subwaveInstrumental:evidence.instrumental,
        reviewReason:evidence.firstSeconds!==null && evidence.instrumental===true ? 'synced-lyrics-vs-instrumental-flag' : null,
        introMs: track.introMs, outroStartMs: track.outro?.startMs ?? null,
      });
    } catch {
      rows.push({ id, artist: track.artist, title: track.title, status: 'lyrics-server-unavailable' });
    }
  }
  if (args.includes('--save')) {
    await saveSubbeatsLyrics(config.stateDir,saved);
    console.error('[lyric-boundary-scan] Saved Sub/Beats lyric evidence. Existing reviewed boundaries were preserved.');
  }
  console.log(JSON.stringify({ tracks: rows }, null, 2));
}

main().catch(error => {
  console.error(`[lyric-boundary-scan] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
