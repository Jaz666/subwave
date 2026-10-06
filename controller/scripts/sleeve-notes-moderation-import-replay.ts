// Import rejected proposals from a completed, frozen Wikipedia replay.
// The default is read-only preflight. --apply=yes writes only review items.
import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { accessSync, constants } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DB_PATH } from '../src/sleeve-notes/db.js';
import { candidateFingerprint } from '../src/sleeve-notes/moderation.js';
import type { ValidatedResearch } from '../src/sleeve-notes/researcher.js';

type Entry = {
  sourceDocumentId: string;
  entityType: string;
  entityId: string;
  revisionId: string;
  contentHash: string;
  status: string;
  rejected: ValidatedResearch['rejected'];
};
type Replay = {
  format: string;
  runState: string;
  sourceProvider: string;
  counts: { processed: number; rejectedCandidates: number };
  entries: Entry[];
};

async function main(): Promise<void> {
  const file = process.argv.slice(2).find((arg) => arg.startsWith('--file='))?.slice(7);
  const apply = process.argv.includes('--apply=yes');
  if (!file) throw new Error('Use --file=/absolute/path/to/wikipedia-replay.json [--apply=yes]');
  const report = JSON.parse(await readFile(resolve(file), 'utf8')) as Replay;
  if (report.format !== 'subwave-sleeve-notes-wikipedia-replay-v2'
    || report.runState !== 'complete' || report.sourceProvider !== 'wikipedia'
    || !Array.isArray(report.entries) || report.entries.length !== report.counts.processed) {
    throw new Error('Expected a complete frozen Wikipedia replay preview');
  }
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  try {
    const version = db.pragma('user_version', { simple: true }) as number;
    const source = db.prepare(`SELECT provider, entity_type AS entityType, entity_id AS entityId,
      revision_id AS revisionId, content_hash AS contentHash, content
      FROM sleeve_source_documents WHERE id = ?`);
    let rejected = 0;
    let alreadyLive = 0;
    const liveKey = (sourceDocumentId: string, category: string, topic: string, wording: string) =>
      JSON.stringify([sourceDocumentId, category, topic, wording]);
    const live = new Set((db.prepare(`SELECT source_document_id AS sourceDocumentId,
      category, topic, wording FROM sleeve_claims WHERE enabled = 1`).all() as Array<{
        sourceDocumentId: string; category: string; topic: string; wording: string;
      }>).map((claim) => liveKey(claim.sourceDocumentId, claim.category, claim.topic, claim.wording)));
    for (const entry of report.entries) {
      if (entry.status !== 'complete' || !Array.isArray(entry.rejected)) {
        throw new Error(`Incomplete replay entry: ${entry.sourceDocumentId}`);
      }
      const row = source.get(entry.sourceDocumentId) as {
        provider: string; entityType: string; entityId: string;
        revisionId: string; contentHash: string; content: string;
      } | undefined;
      if (!row || row.provider !== 'wikipedia' || row.entityType !== entry.entityType
        || row.entityId !== entry.entityId || row.revisionId !== entry.revisionId
        || row.contentHash !== entry.contentHash
        || createHash('sha256').update(row.content).digest('hex') !== entry.contentHash) {
        throw new Error(`Saved source changed or is missing: ${entry.sourceDocumentId}`);
      }
      for (const item of entry.rejected) {
        if (!item?.candidate || typeof item.reason !== 'string'
          || typeof item.candidate.category !== 'string'
          || typeof item.candidate.topic !== 'string'
          || typeof item.candidate.wording !== 'string'
          || typeof item.candidate.evidence !== 'string') {
          throw new Error(`Invalid rejected candidate: ${entry.sourceDocumentId}`);
        }
        rejected++;
        if (live.has(liveKey(entry.sourceDocumentId, item.candidate.category,
          item.candidate.topic, item.candidate.wording))) alreadyLive++;
      }
    }
    if (rejected !== report.counts.rejectedCandidates) {
      throw new Error('Rejected candidate count differs from the replay receipt');
    }
    console.log(`Verified ${report.entries.length} unchanged sources and ${rejected} rejected proposals.`);
    console.log(`${alreadyLive} exact proposals are already retained as live claims.`);
    if (!apply) {
      console.log('Read-only preflight complete. Add --apply=yes after the controller rebuild to populate Moderation.');
      return;
    }
    if (version < 19) throw new Error('Rebuild the controller first so the moderation database migration is installed');
    try {
      accessSync(DB_PATH, constants.W_OK);
    } catch {
      throw new Error(`The station database is not writable by this host user (${DB_PATH}). `
        + 'Its container-created files are owned by root. Run this import command with sudo; '
        + 'do not change database ownership or permissions while the station is running.');
    }
    const writeDb = new Database(DB_PATH, { fileMustExist: true, timeout: 10_000 });
    try {
      const suppressedKey = (entityType: string, entityId: string, category: string, topic: string) =>
        JSON.stringify([entityType, entityId, category, topic]);
      const suppressed = new Set((writeDb.prepare(`SELECT entity_type AS entityType, entity_id AS entityId,
        category, topic FROM sleeve_claim_suppressions`).all() as Array<{
          entityType: string; entityId: string; category: string; topic: string;
        }>).map((item) => suppressedKey(item.entityType, item.entityId, item.category, item.topic)));
      const insert = writeDb.prepare(`INSERT OR IGNORE INTO sleeve_moderation_candidates (
        id, source_document_id, fingerprint, entity_type, entity_id, category, topic,
        wording, short_wording, evidence, original_json, rejection_reason, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const now = new Date().toISOString();
      let added = 0;
      writeDb.transaction(() => {
        for (const entry of report.entries) {
          for (const { candidate, reason } of entry.rejected) {
            if (live.has(liveKey(entry.sourceDocumentId, candidate.category,
              candidate.topic, candidate.wording))
              || suppressed.has(suppressedKey(entry.entityType, entry.entityId,
                candidate.category, candidate.topic))) continue;
            added += insert.run(randomUUID(), entry.sourceDocumentId, candidateFingerprint(candidate),
              entry.entityType, entry.entityId, candidate.category, candidate.topic,
              candidate.wording, candidate.shortWording ?? '', candidate.evidence,
              JSON.stringify(candidate), reason, now, now).changes;
          }
        }
      }).immediate();
      console.log(`Imported ${added} review items. Existing live claims and moderation decisions were preserved.`);
    } finally { writeDb.close(); }
  } finally { db.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
