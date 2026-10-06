// Read-only pilot for the source-first Genius album researcher. It uses saved
// biographies and writes proposed claims to JSON; no station rows are changed.
import Database from 'better-sqlite3';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { STATE_DIR } from '../src/config.js';
import * as settings from '../src/settings.js';
import { LlmResearcher } from '../src/sleeve-notes/llm-researcher.js';
import {
  MAX_CANDIDATES_PER_ARTIST_RESEARCH,
  RELEASE_GROUP_NOTE_CATEGORIES,
  completeGeniusAlbumCandidates,
  validateAndRepairFullCandidates,
  validateResearchCandidates,
  type ResearchJob,
} from '../src/sleeve-notes/researcher.js';

const PILOT_SLUGS = [
  '/Foo-fighters/Echoes-silence-patience-grace',
  '/Billie-eilish/Hit-me-hard-and-soft',
  '/Tycho/Weather',
  '/John-grant/Boy-from-michigan',
  '/Manic-street-preachers/Send-away-the-tigers',
];

type SourceRow = {
  id: string; entityId: string; entityName: string | null;
  sourceUrl: string; content: string;
};

async function main(): Promise<void> {
  await settings.load();
  const replayBaseUrl = process.env.SLEEVE_NOTES_REPLAY_BASE_URL?.trim().replace(/\/+$/, '');
  if (replayBaseUrl) {
    const llm = settings.get().llm;
    llm.baseUrl = replayBaseUrl;
    llm.providerBaseUrls = { ...(llm.providerBaseUrls ?? {}), [llm.provider]: replayBaseUrl };
  }
  const db = new Database(resolve(STATE_DIR, 'sleeve-notes.db'), {
    readonly: true, fileMustExist: true, timeout: 10_000,
  });
  const rows = db.prepare(`SELECT source.id, source.entity_id AS entityId,
      (SELECT MIN(release.title) FROM sleeve_releases release
        WHERE release.musicbrainz_release_group_id = source.entity_id) AS entityName,
      source.source_url AS sourceUrl, source.content
    FROM sleeve_source_documents source
    WHERE source.provider = 'genius' AND source.entity_type = 'release-group'
    ORDER BY source.retrieved_at DESC`).all() as SourceRow[];
  db.close();
  const requestedLimit = Number.parseInt(process.env.SLEEVE_NOTES_ALBUM_PREVIEW_LIMIT ?? '3', 10);
  const pilotSlugs = PILOT_SLUGS.slice(0, Number.isInteger(requestedLimit) ? requestedLimit : 3);
  const sources = pilotSlugs.map((slug) => rows.find((row) => row.sourceUrl.includes(slug)))
    .filter((row): row is SourceRow => !!row);
  if (sources.length !== pilotSlugs.length) throw new Error('One or more saved pilot biographies are missing');
  const researcher = new LlmResearcher();
  const entries = [];
  for (const source of sources) {
    const job: ResearchJob = {
      id: `genius-album-preview:${source.id}`,
      document: { ...source, id: source.id, entityId: source.entityId,
        provider: 'genius', sourceUrl: source.sourceUrl, revisionId: null, text: source.content },
      categories: RELEASE_GROUP_NOTE_CATEGORIES,
      maxCandidates: MAX_CANDIDATES_PER_ARTIST_RESEARCH,
      requireShortWording: false,
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 480_000);
    try {
      const proposed = await researcher.extract(job, controller.signal);
      const full = await validateAndRepairFullCandidates(job, researcher, proposed, controller.signal);
      const completed = await completeGeniusAlbumCandidates(job, researcher, full.accepted, controller.signal);
      const final = validateResearchCandidates(job, completed.accepted);
      entries.push({ sourceUrl: source.sourceUrl, album: source.entityName,
        proposed, accepted: final.accepted,
        rejected: [...full.rejected, ...completed.rejected, ...final.rejected] });
      console.log(`${source.entityName}: ${final.accepted.length} proposed claims, ${proposed.length} passage candidates`);
    } catch (error) {
      entries.push({ sourceUrl: source.sourceUrl, album: source.entityName,
        error: error instanceof Error ? error.message : String(error) });
      console.warn(`${source.entityName}: preview failed`);
    } finally {
      clearTimeout(timeout);
    }
  }
  const path = resolve(STATE_DIR, 'sleeve-notes-research-previews',
    `genius-album-source-first-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ status: 'preview-only', createdAt: new Date().toISOString(), entries }, null, 2)}\n`);
  console.log(`Preview saved: ${path}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
