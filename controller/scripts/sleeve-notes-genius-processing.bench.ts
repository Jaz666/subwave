// Offline replay into a disposable snapshot. Import config only after STATE_DIR
// points to that snapshot; the supplied source is opened read-only.
import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setImmediate as yieldToController } from 'node:timers/promises';
import type { SleeveProviderResult } from '../src/sleeve-notes/provider.js';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Usage: tsx scripts/sleeve-notes-genius-processing.bench.ts /path/to/sleeve-notes.db');
const root = await mkdtemp(join(tmpdir(), 'subwave-genius-processing-'));
process.env.STATE_DIR = root;
globalThis.fetch = async () => { throw new Error('Network disabled during offline Genius replay'); };
let source: Database.Database | undefined;
let closeDatabase: (() => void) | undefined;
let stopCompute: (() => void) | undefined;
function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, medianMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
    p95Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0, maxMs: sorted.at(-1) ?? 0 };
}
try {
  source = new Database(resolve(sourcePath), { readonly: true, fileMustExist: true });
  await source.backup(join(root, 'sleeve-notes.db'));
  source.close();
  const { open, close } = await import('../src/sleeve-notes/db.js');
  closeDatabase = close;
  const { retainGeniusResult } = await import('../src/sleeve-notes/research-repository.js');
  const { reconcileConnectionsInBackground, stopConnectionCompute } = await import('../src/sleeve-notes/connection-compute.js');
  stopCompute = stopConnectionCompute;
  const { registerGeniusTraversal, expandGeniusSamples } = await import('../src/sleeve-notes/genius-traversal.js');
  const { enqueueNextGeniusLibrarySeed } = await import('../src/sleeve-notes/genius-seeding.js');
  const db = open();
  const rows = db.prepare(`SELECT source.content, recording.id, recording.title, artist.name AS artist
    FROM sleeve_source_documents source JOIN sleeve_recordings recording ON recording.id = source.entity_id
    LEFT JOIN sleeve_artists artist ON artist.id = recording.artist_id
    WHERE source.provider = 'genius' AND source.entity_type = 'recording' AND source.content_kind = 'structured-json'
    ORDER BY length(source.content) DESC LIMIT 30`).all() as Array<{
      content: string; id: string; title: string; artist: string | null;
    }>;
  if (!rows.length) throw new Error('No stored Genius recording results to replay');
  const counts = Object.fromEntries(['sleeve_claims', 'sleeve_connection_edges', 'sleeve_connection_library_tracks']
    .map(table => [table, (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n]));
  const timings: number[] = [], parseTimes: number[] = [], registrationTimes: number[] = [], expansionTimes: number[] = [];
  const memoryBefore = process.memoryUsage().rss;
  let maxRelationships = 0;
  for (const row of rows) {
    const parseStart = performance.now();
    const result = JSON.parse(row.content) as SleeveProviderResult;
    parseTimes.push(performance.now() - parseStart);
    if (!result.identity || !Array.isArray(result.relationships) || !Array.isArray(result.credits)) {
      throw new Error('Stored source is not an approved Genius projection');
    }
    maxRelationships = Math.max(maxRelationships, result.relationships.length);
    // Exercise new source/claim insertion, rather than duplicate-cache no-ops.
    result.retrievedAt = new Date().toISOString();
    const started = performance.now();
    retainGeniusResult(row, result);
    timings.push(performance.now() - started);
    const registerStart = performance.now();
    registerGeniusTraversal(row, result);
    registrationTimes.push(performance.now() - registerStart);
    if (db.prepare('SELECT 1 FROM sleeve_connection_artist_population WHERE id=1').get()) {
      let done = false;
      while (!done) {
        await yieldToController();
        const expansionStart = performance.now();
        done = expandGeniusSamples(row.id);
        expansionTimes.push(performance.now() - expansionStart);
      }
    }
    await yieldToController();
  }
  const seedTimes: number[] = [];
  let seedsQueued = 0;
  for (let i = 0; i < 20; i++) {
    const started = performance.now();
    if (enqueueNextGeniusLibrarySeed()) seedsQueued++;
    seedTimes.push(performance.now() - started);
    // Disposable DB only: allow the next selection without fetching anything.
    db.prepare(`UPDATE sleeve_research_jobs SET state='complete' WHERE capability='library-seed' AND state='queued'`).run();
    await yieldToController();
  }
  // Measure publication separately: production builds this patch in the child.
  // This synchronous calculation is confined to this offline benchmark process.
  const { buildConnectionLibraryPatch, publishConnectionLibraryPatch } = await import('../src/sleeve-notes/library-connections.js');
  const computeStart = performance.now();
  const patch = buildConnectionLibraryPatch(db);
  const isolatedCalculationMs = performance.now() - computeStart;
  const publishStart = performance.now();
  if (!publishConnectionLibraryPatch(db, patch)) throw new Error('Unexpected stale publication');
  const synchronousPublicationMs = performance.now() - publishStart;
  const reconciliations: number[] = [];
  for (let i = 0; i < 3; i++) {
    const started = performance.now();
    if (await reconcileConnectionsInBackground(db) === null) throw new Error('Unexpected stale isolated patch');
    reconciliations.push(performance.now() - started);
    await yieldToController();
  }
  console.log(JSON.stringify({ offline: true, counts, replay: 'largest 30 retained projections, fresh source insertion',
    maxStoredBytes: Math.max(...rows.map(row => Buffer.byteLength(row.content))), maxRelationships,
    storedJsonParsing: summary(parseTimes), synchronousSourceAndClaimRetention: summary(timings),
    librarySeedSelection: summary(seedTimes), seedsQueued,
    traversalRegistration: summary(registrationTimes), traversalExpansionBatches: summary(expansionTimes),
    isolatedCalculationMs, synchronousPublicationMs,
    publishedChanges: { edges: patch.upsert.length, removals: patch.remove.length, matchGroups: patch.matches.length },
    unchangedBackgroundReconciliationWallTime: summary(reconciliations),
    parentRssGrowthMiB: (process.memoryUsage().rss - memoryBefore) / 1024 / 1024,
    limitations: ['No raw HTTP response projection or network timing', 'Traversal uses only the existing artist cache; no artist refresh is made',
      'Reconciliation includes child startup and publication; timings are wall time',
      'RSS includes the deliberately in-process calculation used to measure publication; not production controller growth',
      'Not a live controller latency or contention test'] }, null, 2));
} finally {
  stopCompute?.(); closeDatabase?.();
  if (source?.open) source.close();
  await rm(root, { recursive: true, force: true });
}
