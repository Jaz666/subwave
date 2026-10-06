// Add a conservative subset of a completed Wikipedia replay without replacing
// any existing claim. The original preview remains the audit record.

import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { STATE_DIR } from '../src/config.js';
import {
  MAX_CANDIDATES_PER_ARTIST_RESEARCH,
  wikipediaNoteCategories,
  validateResearchCandidates,
  type ResearchCandidate,
  type SleeveNoteCategory,
} from '../src/sleeve-notes/researcher.js';

type Entry = {
  sourceDocumentId: string;
  entityType: 'artist' | 'recording' | 'release' | 'release-group';
  entityId: string;
  entityName: string | null;
  sourceUrl: string;
  revisionId: string;
  contentHash: string;
  status: 'complete' | 'failed';
  accepted: ResearchCandidate[];
};

function option(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function categoriesFor(entityType: Entry['entityType']): readonly SleeveNoteCategory[] {
  return wikipediaNoteCategories(entityType);
}

// These entities contain known wording errors from the replay audit. Keep
// their proposals staged for an individual review, without penalising their
// existing station claims.
const heldForReview = new Set([
  'Carly Simon', 'Suzanne Vega', 'Talking Heads', 'Papa Roach', 'The Walker Brothers',
  'DEVO', 'London Calling', "Let's Dance", 'Mercy', 'Pale Green Ghosts', 'Paranoid',
  'The Final Cut', 'Penguin Cafe Orchestra', 'Dragon New Warm Mountain I Believe in You',
  'Kintsugi', 'London 0 Hull 4',
]);

function directlyQuoted(candidate: ResearchCandidate): boolean {
  const full = candidate.wording.trim().replace(/[.!?]+$/u, '').toLocaleLowerCase();
  return full.length >= 35 && candidate.evidence.toLocaleLowerCase().includes(full);
}

async function main(): Promise<void> {
  const previewPath = option('file');
  if (!previewPath) throw new Error('Provide --file=/path/to/completed-preview.json');
  const apply = option('apply') === 'yes';
  const report = JSON.parse(await readFile(resolve(previewPath), 'utf8')) as {
    format?: string; status?: string; runState?: string; entries?: Entry[];
  };
  if (report.format !== 'subwave-sleeve-notes-wikipedia-replay-v2'
    || report.status !== 'preview-only' || report.runState !== 'complete'
    || !Array.isArray(report.entries)) throw new Error('Expected a completed Wikipedia replay preview.');

  const db = new Database(resolve(STATE_DIR, 'sleeve-notes.db'), { fileMustExist: true, timeout: 10_000 });
  try {
    const findSource = db.prepare(`SELECT provider, entity_type AS entityType, entity_id AS entityId,
        source_url AS sourceUrl, revision_id AS revisionId, content_hash AS contentHash, content
      FROM sleeve_source_documents WHERE id = ?`);
    const batch: Array<{ entry: Entry; candidates: ResearchCandidate[] }> = [];
    const seen = new Set<string>();
    let held = 0;
    let indirect = 0;
    for (const entry of report.entries) {
      if (entry.status !== 'complete') continue;
      if (!entry.sourceDocumentId || seen.has(entry.sourceDocumentId)) throw new Error('Duplicate or missing source ID.');
      seen.add(entry.sourceDocumentId);
      if (heldForReview.has(entry.entityName ?? '')) { held += entry.accepted.length; continue; }
      const candidates = entry.accepted.filter((candidate) => directlyQuoted(candidate));
      indirect += entry.accepted.length - candidates.length;
      if (!candidates.length) continue;
      const source = findSource.get(entry.sourceDocumentId) as {
        provider: string; entityType: string; entityId: string; sourceUrl: string;
        revisionId: string | null; contentHash: string; content: string;
      } | undefined;
      if (!source || source.provider !== 'wikipedia' || source.entityType !== entry.entityType
        || source.entityId !== entry.entityId || source.sourceUrl !== entry.sourceUrl
        || source.revisionId !== entry.revisionId || source.contentHash !== entry.contentHash
        || createHash('sha256').update(source.content).digest('hex') !== entry.contentHash) {
        throw new Error(`Frozen source changed: ${entry.sourceUrl}`);
      }
      const validated = validateResearchCandidates({
        id: `merge:${entry.sourceDocumentId}`,
        document: { id: entry.sourceDocumentId, entityId: entry.entityId,
          entityName: entry.entityName, provider: 'wikipedia', sourceUrl: entry.sourceUrl,
          revisionId: entry.revisionId, text: source.content },
        categories: categoriesFor(entry.entityType),
        maxCandidates: MAX_CANDIDATES_PER_ARTIST_RESEARCH,
        requireShortWording: true,
      }, candidates);
      if (validated.rejected.length || validated.accepted.length !== candidates.length) {
        throw new Error(`Selected proposal no longer validates: ${entry.sourceUrl}`);
      }
      batch.push({ entry, candidates: validated.accepted });
    }

    const proposed = batch.reduce((total, row) => total + row.candidates.length, 0);
    console.log(`Preflight: ${proposed} directly evidenced proposals from ${batch.length} sources; ${held} held for known issues; ${indirect} other proposals remain staged.`);
    if (!apply) {
      console.log('No database changes made. Add --apply=yes to merge this batch additively.');
      return;
    }
    if (!proposed) throw new Error('Nothing to merge.');

    const now = new Date().toISOString();
    const insert = db.prepare(`INSERT INTO sleeve_claims (id, entity_type, entity_id, category, topic,
        wording, short_wording, source_document_id, evidence, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(entity_type, entity_id, category, topic, source_document_id) DO UPDATE SET
        short_wording = CASE WHEN sleeve_claims.short_wording = '' THEN excluded.short_wording ELSE sleeve_claims.short_wording END,
        updated_at = CASE WHEN sleeve_claims.short_wording = '' THEN excluded.updated_at ELSE sleeve_claims.updated_at END
        WHERE sleeve_claims.operator_state = 'auto'`);
    const existing = db.prepare(`SELECT id, short_wording AS shortWording FROM sleeve_claims
      WHERE entity_type = ? AND entity_id = ? AND category = ? AND topic = ? AND source_document_id = ?`);
    const merge = db.transaction(() => {
      let added = 0;
      let suppliedShort = 0;
      let retained = 0;
      for (const { entry, candidates } of batch) {
        for (const candidate of candidates) {
          const previous = existing.get(entry.entityType, entry.entityId, candidate.category,
            candidate.topic, entry.sourceDocumentId) as { id: string; shortWording: string } | undefined;
          insert.run(randomUUID(), entry.entityType, entry.entityId, candidate.category,
            candidate.topic, candidate.wording, candidate.shortWording ?? '',
            entry.sourceDocumentId, candidate.evidence, now, now);
          if (!previous) added++;
          else if (!previous.shortWording) suppliedShort++;
          else retained++;
        }
      }
      return { added, suppliedShort, retained };
    });
    const result = merge.immediate();
    console.log(`Merged ${result.added} new claims; supplied Short wording to ${result.suppliedShort} existing claims; kept ${result.retained} existing matches. No claims were disabled or removed.`);
  } finally {
    db.close();
  }
}

main().catch((error) => { console.error('FATAL:', error); process.exitCode = 1; });
