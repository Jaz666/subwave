// Apply only a human-reviewed Wikipedia replay preview. The source revision,
// content hash, reviewer decisions and evidence are rechecked before a single
// transaction disables stale claims and upserts accepted replacements.

import Database from 'better-sqlite3';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { STATE_DIR } from '../src/config.js';
import { applyReviewedWikipediaReplay } from '../src/sleeve-notes/research-repository.js';
import {
  MAX_CANDIDATES_PER_ARTIST_RESEARCH,
  wikipediaNoteCategories,
  validateResearchCandidates,
  type ResearchCandidate,
  type SleeveNoteCategory,
} from '../src/sleeve-notes/researcher.js';

type PreviewCandidate = ResearchCandidate & {
  original: ResearchCandidate;
  reviewDecision: 'keep' | 'revise' | 'reject' | null;
};

type PreviewEntry = {
  sourceDocumentId: string;
  entityType: 'artist' | 'recording' | 'release' | 'release-group';
  entityId: string;
  entityName: string | null;
  sourceUrl: string;
  revisionId: string | null;
  contentHash: string;
  status: 'complete' | 'failed';
  reviewComplete: boolean | null;
  replaceWithEmpty: boolean | null;
  accepted: PreviewCandidate[];
};

function getOption(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function categoriesFor(entityType: PreviewEntry['entityType']): readonly SleeveNoteCategory[] {
  return wikipediaNoteCategories(entityType);
}

async function main() {
  const previewPath = getOption('file');
  if (!previewPath) throw new Error('Provide --file=/path/to/reviewed-preview.json');
  const applyRequested = getOption('apply') === 'yes';
  const report = JSON.parse(await readFile(resolve(previewPath), 'utf8')) as {
    format?: string;
    status?: string;
    runState?: string;
    entries?: PreviewEntry[];
  };
  if (report.format !== 'subwave-sleeve-notes-wikipedia-replay-v2' || report.status !== 'preview-only'
    || !Array.isArray(report.entries)) throw new Error('The file is not a supported Wikipedia replay preview.');
  if (report.runState !== 'complete') {
    throw new Error('The replay did not complete. Resume with an offset or run a deliberate limited batch before review.');
  }

  const batch: Array<{
    sourceDocumentId: string;
    entityType: PreviewEntry['entityType'];
    entityId: string;
    revisionId: string;
    contentHash: string;
    candidates: ResearchCandidate[];
  }> = [];
  const seenSources = new Set<string>();
  const readDb = new Database(resolve(STATE_DIR, 'sleeve-notes.db'), {
    readonly: true, fileMustExist: true, timeout: 10_000,
  });
  const findSource = readDb.prepare(`SELECT source.provider, source.entity_type AS entityType, source.entity_id AS entityId,
      source.source_url AS sourceUrl, source.revision_id AS revisionId, source.content_hash AS contentHash, source.content,
      CASE source.entity_type
        WHEN 'artist' THEN (SELECT artist.name FROM sleeve_artists artist WHERE artist.id = source.entity_id)
        WHEN 'recording' THEN (SELECT recording.title FROM sleeve_recordings recording WHERE recording.id = source.entity_id)
        WHEN 'release' THEN (SELECT release.title FROM sleeve_releases release WHERE release.id = source.entity_id)
        WHEN 'release-group' THEN (SELECT MIN(release.title) FROM sleeve_releases release WHERE release.musicbrainz_release_group_id = source.entity_id)
        ELSE NULL
      END AS entityName
    FROM sleeve_source_documents source WHERE source.id = ?`);

  for (const entry of report.entries) {
    if (entry.status === 'failed') continue;
    if (entry.status !== 'complete' || !entry.sourceDocumentId || seenSources.has(entry.sourceDocumentId)) {
      throw new Error(`Invalid or repeated source entry: ${entry.sourceDocumentId || '(missing id)'}`);
    }
    seenSources.add(entry.sourceDocumentId);
    if (entry.reviewComplete !== true) throw new Error(`Mark the source review complete first: ${entry.sourceUrl}`);
    if (!entry.revisionId || !entry.contentHash || !Array.isArray(entry.accepted)) {
      throw new Error(`Source preview is missing its frozen revision identity: ${entry.sourceUrl}`);
    }
    const source = findSource.get(entry.sourceDocumentId) as {
      provider: string; entityType: string; entityId: string; sourceUrl: string;
      revisionId: string | null; contentHash: string; content: string; entityName: string | null;
    } | undefined;
    if (!['artist', 'recording', 'release', 'release-group'].includes(entry.entityType)) {
      throw new Error(`Unsupported source entity type in preview: ${entry.entityType}`);
    }
    if (!source || source.provider !== 'wikipedia' || source.entityType !== entry.entityType
      || source.entityId !== entry.entityId || source.sourceUrl !== entry.sourceUrl
      || source.revisionId !== entry.revisionId || source.contentHash !== entry.contentHash
      || source.entityName !== entry.entityName
      || createHash('sha256').update(source.content).digest('hex') !== entry.contentHash) {
      throw new Error(`Cached source no longer matches its reviewed revision: ${entry.sourceUrl}`);
    }

    const categories = categoriesFor(entry.entityType);
    const job = {
      id: `review:${entry.sourceDocumentId}`,
      document: {
        id: entry.sourceDocumentId,
        entityId: entry.entityId,
        entityName: source.entityName,
        provider: 'wikipedia',
        sourceUrl: entry.sourceUrl,
        revisionId: entry.revisionId,
        text: source.content,
      },
      categories,
      maxCandidates: MAX_CANDIDATES_PER_ARTIST_RESEARCH,
      requireShortWording: true,
    };
    const reviewedCandidates: ResearchCandidate[] = [];
    for (const proposed of entry.accepted) {
      if (!['keep', 'revise', 'reject'].includes(String(proposed.reviewDecision))) {
        throw new Error(`Choose keep, revise or reject for each proposal from ${entry.sourceUrl}.`);
      }
      if (proposed.reviewDecision === 'reject') continue;
      const sameAsOriginal = proposed.category === proposed.original?.category
        && proposed.topic === proposed.original?.topic
        && proposed.wording === proposed.original?.wording
        && proposed.shortWording === proposed.original?.shortWording
        && proposed.evidence === proposed.original?.evidence;
      if (proposed.reviewDecision === 'keep' && !sameAsOriginal) {
        throw new Error(`A changed proposal must be marked revise: ${entry.sourceUrl} · ${proposed.topic}`);
      }
      reviewedCandidates.push({
        category: proposed.category,
        topic: proposed.topic,
        wording: proposed.wording,
        shortWording: proposed.shortWording,
        evidence: proposed.evidence,
      });
    }
    const validated = validateResearchCandidates(job, reviewedCandidates);
    if (validated.rejected.length || validated.accepted.length !== reviewedCandidates.length) {
      const detail = validated.rejected.map(({ candidate, reason }) => `${candidate.topic}: ${reason}`).join('; ');
      throw new Error(`Reviewed wording failed source validation for ${entry.sourceUrl}: ${detail}`);
    }
    if (validated.accepted.length === 0 && entry.replaceWithEmpty !== true) {
      throw new Error(`Confirm an empty replacement with replaceWithEmpty: true: ${entry.sourceUrl}`);
    }
    batch.push({
      sourceDocumentId: entry.sourceDocumentId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      revisionId: entry.revisionId,
      contentHash: entry.contentHash,
      candidates: validated.accepted,
    });
  }
  readDb.close();

  if (batch.length === 0) throw new Error('The preview has no completed, reviewed sources to apply.');
  const totalAccepted = batch.reduce((sum, entry) => sum + entry.candidates.length, 0);
  console.log(`Preflight passed: ${batch.length} frozen sources, ${totalAccepted} reviewed claims.`);
  if (!applyRequested) {
    console.log('No database changes made. Add --apply=yes to commit this reviewed batch.');
    return;
  }
  const result = applyReviewedWikipediaReplay({ entries: batch });
  console.log(`Applied ${result.acceptedClaims} claims across ${result.sources} sources; disabled ${result.disabledClaims} previous rows before upsert. Historical use records were preserved.`);
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exit(1);
});
