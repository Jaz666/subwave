// Revision-pinned, preview-only regeneration of retained Wikipedia Sleeve
// Notes. The local database is opened read-only; this script never writes
// claims or research jobs. Review the saved JSON before any separate apply.

import Database from 'better-sqlite3';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { STATE_DIR } from '../src/config.js';
import * as settings from '../src/settings.js';
import { LlmResearcher } from '../src/sleeve-notes/llm-researcher.js';
import {
  MAX_CANDIDATES_PER_ARTIST_RESEARCH,
  wikipediaNoteCategories,
  addValidatedShortWordings,
  interleaveResearchCandidates,
  splitResearchSource,
  validateAndRepairFullCandidates,
  validateResearchCandidates,
  type ResearchCandidate,
  type ResearchJob,
  type SleeveNoteCategory,
  type ValidatedResearch,
} from '../src/sleeve-notes/researcher.js';

const requestedTimeoutMs = Number.parseInt(process.env.SLEEVE_NOTES_REPLAY_TIMEOUT_MS ?? '180000', 10);
const REQUEST_TIMEOUT_MS = Number.isInteger(requestedTimeoutMs) && requestedTimeoutMs >= 45_000
  ? requestedTimeoutMs
  : 120_000;

type SourceRow = {
  id: string;
  entityType: 'artist' | 'recording' | 'release' | 'release-group';
  entityId: string;
  entityName: string | null;
  sourceUrl: string;
  revisionId: string | null;
  contentHash: string;
  content: string;
};

type ReplayEntry = {
  sourceDocumentId: string;
  entityType: SourceRow['entityType'];
  entityId: string;
  entityName: string | null;
  sourceUrl: string;
  revisionId: string;
  contentHash: string;
  sourceCharacters: number;
  sourceCharactersSent: number;
  sourceTruncated: boolean;
  sourceSections: number;
  status: 'complete' | 'failed';
  reviewComplete: boolean | null;
  replaceWithEmpty: boolean | null;
  modelCandidateCount: number;
  currentClaims: Array<{
    id: string; category: string; topic: string; wording: string; shortWording: string; evidence: string;
  }>;
  accepted: Array<ResearchCandidate & { original: ResearchCandidate; reviewDecision: null }>;
  rejected: ValidatedResearch['rejected'];
  error?: string;
};

type ReplayReport = {
  format: 'subwave-sleeve-notes-wikipedia-replay-v2';
  status: 'preview-only';
  runState: 'running' | 'complete' | 'interrupted';
  createdAt: string;
  databasePath: string;
  sourceProvider: 'wikipedia';
  selection: { frozenRevisionsOnly: true; totalEligibleSources: number; offset: number; limit: number | null };
  counts: { processed: number; complete: number; failed: number; currentClaims: number; proposedClaims: number; rejectedCandidates: number };
  entries: ReplayEntry[];
};

function optionsFromArgs(args: string[]): Map<string, string> {
  const options = new Map<string, string>();
  for (const arg of args) {
    if (arg === '--help') {
      options.set('help', 'true');
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const split = arg.indexOf('=');
    if (split < 0) throw new Error(`Use --name=value for replay options: ${arg}`);
    options.set(arg.slice(2, split), arg.slice(split + 1));
  }
  return options;
}

function integerOption(options: Map<string, string>, name: string, fallback: number, min: number): number {
  const raw = options.get(name);
  if (raw == null) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min) throw new Error(`--${name} must be an integer >= ${min}`);
  return value;
}

function categoriesFor(entityType: SourceRow['entityType']): readonly SleeveNoteCategory[] {
  return wikipediaNoteCategories(entityType);
}

function timestampSlug(date: Date): string {
  return date.toISOString().replaceAll(':', '').replaceAll('-', '').replace(/\.\d{3}Z$/, 'Z');
}

async function atomicJsonWrite(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.partial`;
  // Cached Wikipedia text and generated proposals contain no station secrets;
  // the preview exists for host-side human review outside the root-run
  // controller container.
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o644 });
  await rename(temporary, path);
}

async function main() {
  const options = optionsFromArgs(process.argv.slice(2));
  const offset = integerOption(options, 'offset', 0, 0);
  const limit = options.has('limit') ? integerOption(options, 'limit', 0, 1) : null;
  const databasePath = resolve(STATE_DIR, 'sleeve-notes.db');
  const outputPath = resolve(options.get('out') || resolve(
    STATE_DIR,
    'sleeve-notes-research-previews',
    `wikipedia-replay-${timestampSlug(new Date())}.json`,
  ));
  if (options.has('help')) {
    console.log('Usage: npm run sleeve-notes:wikipedia-replay -- [--limit=COUNT] [--offset=COUNT] [--out=/path/file.json]');
    console.log('Reads frozen Wikipedia revisions and writes a preview JSON; it does not change the database.');
    return;
  }
  if (existsSync(outputPath)) throw new Error(`Refusing to overwrite existing preview: ${outputPath}`);

  await settings.load();
  // Host-side runs may point at a provider URL that is only resolvable in
  // Compose. This override changes only the process-local settings cache.
  const replayBaseUrl = process.env.SLEEVE_NOTES_REPLAY_BASE_URL?.trim().replace(/\/+$/, '');
  if (replayBaseUrl) {
    const llm = settings.get().llm;
    llm.baseUrl = replayBaseUrl;
    llm.providerBaseUrls = { ...(llm.providerBaseUrls ?? {}), [llm.provider]: replayBaseUrl };
  }

  const db = new Database(databasePath, { readonly: true, fileMustExist: true, timeout: 10_000 });
  const shortColumnExists = (db.pragma('table_info(sleeve_claims)') as Array<{ name: string }>)
    .some((column) => column.name === 'short_wording');
  const shortSelection = shortColumnExists ? 'claim.short_wording' : "''";
  const sourceRows = db.prepare(`SELECT source.id, source.entity_type AS entityType,
      source.entity_id AS entityId,
      CASE source.entity_type
        WHEN 'artist' THEN (SELECT artist.name FROM sleeve_artists artist WHERE artist.id = source.entity_id)
        WHEN 'recording' THEN (SELECT recording.title FROM sleeve_recordings recording WHERE recording.id = source.entity_id)
        WHEN 'release' THEN (SELECT release.title FROM sleeve_releases release WHERE release.id = source.entity_id)
        WHEN 'release-group' THEN (SELECT MIN(release.title) FROM sleeve_releases release WHERE release.musicbrainz_release_group_id = source.entity_id)
        ELSE NULL
      END AS entityName,
      source.source_url AS sourceUrl, source.revision_id AS revisionId,
      source.content_hash AS contentHash, source.content
    FROM sleeve_source_documents source
    WHERE source.provider = 'wikipedia' AND source.revision_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM sleeve_source_documents newer
        WHERE newer.provider = source.provider
          AND newer.entity_type = source.entity_type
          AND newer.entity_id = source.entity_id
          AND newer.revision_id IS NOT NULL
          AND (newer.retrieved_at > source.retrieved_at
            OR (newer.retrieved_at = source.retrieved_at AND newer.id > source.id))
      )
    ORDER BY source.entity_type, source.entity_id, source.retrieved_at, source.id`).all() as SourceRow[];
  const selectedRows = sourceRows.slice(offset, limit == null ? undefined : offset + limit);
  const replay: ReplayReport = {
    format: 'subwave-sleeve-notes-wikipedia-replay-v2',
    status: 'preview-only',
    runState: 'running',
    createdAt: new Date().toISOString(),
    databasePath,
    sourceProvider: 'wikipedia',
    selection: { frozenRevisionsOnly: true, totalEligibleSources: sourceRows.length, offset, limit },
    counts: { processed: 0, complete: 0, failed: 0, currentClaims: 0, proposedClaims: 0, rejectedCandidates: 0 },
    entries: [],
  };
  const lookupClaims = db.prepare(`SELECT claim.id, claim.category, claim.topic, claim.wording,
      ${shortSelection} AS shortWording, claim.evidence
    FROM sleeve_claims claim
    JOIN sleeve_source_documents claim_source ON claim_source.id = claim.source_document_id
    WHERE claim.entity_type = ? AND claim.entity_id = ? AND claim.enabled = 1
      AND claim_source.provider = 'wikipedia'
    ORDER BY claim.category, claim.topic, claim.id`);
  const researcher = new LlmResearcher();
  await mkdir(dirname(outputPath), { recursive: true });
  await atomicJsonWrite(outputPath, replay);

  let stopRequested = false;
  let activeController: AbortController | null = null;
  const requestStop = () => {
    stopRequested = true;
    activeController?.abort();
  };
  process.once('SIGINT', requestStop);
  process.once('SIGTERM', requestStop);

  sourceLoop: for (const [index, source] of selectedRows.entries()) {
    if (stopRequested) break;
    const categories = categoriesFor(source.entityType);
    const fullJob: ResearchJob = {
      id: `preview:${source.id}:full`,
      document: {
        id: source.id,
        entityId: source.entityId,
        entityName: source.entityName,
        provider: 'wikipedia',
        sourceUrl: source.sourceUrl,
        revisionId: source.revisionId,
        text: source.content,
      },
      categories,
      maxCandidates: MAX_CANDIDATES_PER_ARTIST_RESEARCH,
      requireShortWording: false,
    };
    const sections = splitResearchSource(source.content);
    const existingClaims = lookupClaims.all(source.entityType, source.entityId) as Array<{
      id: string; category: string; topic: string; wording: string; shortWording: string; evidence: string;
    }>;
    replay.counts.currentClaims += existingClaims.length;
    let entry: ReplayEntry;
    try {
      const acceptedBySection: ResearchCandidate[][] = [];
      const rejected: ValidatedResearch['rejected'] = [];
      let modelCandidateCount = 0;
      for (const [sectionIndex, text] of sections.entries()) {
        if (stopRequested) break sourceLoop;
        const job: ResearchJob = {
          ...fullJob,
          id: `preview:${source.id}:section:${sectionIndex + 1}`,
          document: { ...fullJob.document, text },
        };
        const controller = new AbortController();
        activeController = controller;
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          const candidates = await researcher.extract(job, controller.signal);
          modelCandidateCount += candidates.length;
          const fullValidated = await validateAndRepairFullCandidates(job, researcher, candidates, controller.signal);
          const validated = await addValidatedShortWordings(job, researcher, fullValidated.accepted, controller.signal);
          validated.rejected.unshift(...fullValidated.rejected);
          researcher.recordOutcome(job, validated);
          acceptedBySection.push(validated.accepted);
          rejected.push(...validated.rejected);
          console.log(`[sleeve-notes-replay] ${index + 1}/${selectedRows.length} ${source.entityName || source.entityId} section ${sectionIndex + 1}/${sections.length}: ${validated.accepted.length} retained, ${validated.rejected.length} rejected`);
        } finally {
          clearTimeout(timeout);
          activeController = null;
        }
      }
      if (stopRequested) break;
      const validated = validateResearchCandidates(fullJob, interleaveResearchCandidates(acceptedBySection));
      rejected.push(...validated.rejected);
      entry = {
        sourceDocumentId: source.id,
        entityType: source.entityType,
        entityId: source.entityId,
        entityName: source.entityName,
        sourceUrl: source.sourceUrl,
        revisionId: source.revisionId!,
        contentHash: source.contentHash,
        sourceCharacters: source.content.length,
        sourceCharactersSent: sections.reduce((sum, section) => sum + section.length, 0),
        sourceTruncated: false,
        sourceSections: sections.length,
        status: 'complete',
        reviewComplete: null,
        replaceWithEmpty: null,
        modelCandidateCount,
        currentClaims: existingClaims,
        accepted: validated.accepted.map((candidate) => ({ ...candidate, original: { ...candidate }, reviewDecision: null })),
        rejected,
      };
      replay.counts.complete += 1;
      replay.counts.proposedClaims += validated.accepted.length;
      replay.counts.rejectedCandidates += rejected.length;
    } catch (error) {
      if (stopRequested) break;
      entry = {
        sourceDocumentId: source.id,
        entityType: source.entityType,
        entityId: source.entityId,
        entityName: source.entityName,
        sourceUrl: source.sourceUrl,
        revisionId: source.revisionId!,
        contentHash: source.contentHash,
        sourceCharacters: source.content.length,
        sourceCharactersSent: sections.reduce((sum, section) => sum + section.length, 0),
        sourceTruncated: false,
        sourceSections: sections.length,
        status: 'failed',
        reviewComplete: null,
        replaceWithEmpty: null,
        modelCandidateCount: 0,
        currentClaims: existingClaims,
        accepted: [],
        rejected: [],
        error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
      };
      replay.counts.failed += 1;
    }
    replay.entries.push(entry);
    replay.counts.processed += 1;
    await atomicJsonWrite(outputPath, replay);
    console.log(`[sleeve-notes-replay] ${index + 1}/${selectedRows.length} ${source.entityName || source.entityId}: ${entry.status}, ${entry.accepted.length} proposed, ${entry.rejected.length} rejected`);
  }

  replay.selection = { ...replay.selection, limit };
  replay.runState = stopRequested ? 'interrupted' : 'complete';
  await atomicJsonWrite(outputPath, replay);
  db.close();
  process.removeListener('SIGINT', requestStop);
  process.removeListener('SIGTERM', requestStop);
  console.log(`Preview saved: ${basename(outputPath)}`);
  console.log(`Processed ${replay.counts.processed}/${sourceRows.length} frozen revisions; ${replay.counts.proposedClaims} accepted proposals, ${replay.counts.rejectedCandidates} rejected candidates, ${replay.counts.failed} failed requests.`);
  if (stopRequested) process.exitCode = 130;
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exit(1);
});
