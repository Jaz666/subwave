import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { open } from './db.js';
import type { CanonicalMusicBrainzRecording } from '../music/musicbrainz.js';
import type { ResearchCandidate } from './researcher.js';
import type { ProviderRelationship, SleeveProviderResult } from './provider.js';

export interface LocalEncounterInput {
  localTrackId: string;
  title: string;
  artist: string | null;
  releaseTitle: string | null;
  musicbrainzRecordingId: string | null;
  source: 'queue' | 'played';
  priority: number;
}

/**
 * Record a station encounter and arrange its first, low-cost identity task.
 * It is intentionally idempotent for a local track: repeated queue/watch
 * notifications update recency and raise priority, but never create a flood
 * of MusicBrainz work.
 */
export function admitLocalEncounter(input: LocalEncounterInput): void {
  admitLocalEncounterInDatabase(open(), input);
}

export function admitLocalEncounterInDatabase(db: Database.Database, input: LocalEncounterInput): void {
  const now = new Date().toISOString();
  const priority = Math.max(0, Math.trunc(input.priority));
  const transaction = db.transaction(() => {
    db.prepare(`INSERT INTO sleeve_local_attachments (
      local_track_id, recording_id, title, artist, release_title,
      musicbrainz_recording_id, match_state, first_encountered_at,
      last_encountered_at, updated_at
    ) VALUES (?, NULL, ?, ?, ?, ?, 'unmatched', ?, ?, ?)
    ON CONFLICT(local_track_id) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      release_title = excluded.release_title,
      musicbrainz_recording_id = COALESCE(excluded.musicbrainz_recording_id, sleeve_local_attachments.musicbrainz_recording_id),
      last_encountered_at = excluded.last_encountered_at,
      updated_at = excluded.updated_at`)
      .run(input.localTrackId, input.title, input.artist, input.releaseTitle,
        input.musicbrainzRecordingId, now, now, now);
    db.prepare(`INSERT INTO sleeve_encounters (id, local_track_id, source, encountered_at)
      VALUES (?, ?, ?, ?)`).run(randomUUID(), input.localTrackId, input.source, now);
    db.prepare(`INSERT INTO sleeve_research_jobs (
      id, provider, subject_type, subject_id, capability, state, priority,
      attempts, run_after, created_at, updated_at
    ) VALUES (?, 'musicbrainz', 'local-track', ?, 'match', 'queued', ?, 0, NULL, ?, ?)
    ON CONFLICT(provider, subject_type, subject_id, capability) DO UPDATE SET
      priority = MAX(sleeve_research_jobs.priority, excluded.priority),
      state = CASE WHEN sleeve_research_jobs.state IN ('failed', 'cancelled') THEN 'queued' ELSE sleeve_research_jobs.state END,
      updated_at = excluded.updated_at`)
      .run(randomUUID(), input.localTrackId, priority, now, now);
  });
  transaction();
}

export interface PendingResearchJob {
  id: string;
  provider: string;
  subjectType: 'local-track' | 'artist' | 'recording' | 'release';
  subjectId: string;
  capability: string;
  priority: number;
  attempts: number;
}

/** The later quiet-time worker takes only one durable task at a time. */
export function nextPendingResearchJob(provider: string, filter?: {
  subjectType?: PendingResearchJob['subjectType'];
  capability?: string;
}): PendingResearchJob | null {
  return nextPendingResearchJobInDatabase(open(), provider, filter);
}

export function nextPendingResearchJobInDatabase(db: Database.Database, provider: string, filter?: {
  subjectType?: PendingResearchJob['subjectType'];
  capability?: string;
}): PendingResearchJob | null {
  const clauses = ['provider = ?', "state IN ('queued', 'retry-at')", '(run_after IS NULL OR run_after <= ?)'];
  const values: Array<string> = [provider, new Date().toISOString()];
  if (filter?.subjectType) { clauses.push('subject_type = ?'); values.push(filter.subjectType); }
  if (filter?.capability) { clauses.push('capability = ?'); values.push(filter.capability); }
  const row = db.prepare(`SELECT id, provider, subject_type AS subjectType,
      subject_id AS subjectId, capability, priority, attempts
    FROM sleeve_research_jobs
    WHERE ${clauses.join(' AND ')} ORDER BY priority DESC, created_at ASC LIMIT 1`)
    .get(...values) as PendingResearchJob | undefined;
  return row ?? null;
}

export interface LocalAttachmentForMatch {
  localTrackId: string;
  title: string;
  artist: string | null;
  musicbrainzRecordingId: string | null;
}

export function localAttachmentForMatch(localTrackId: string): LocalAttachmentForMatch | null {
  const row = open().prepare(`SELECT local_track_id AS localTrackId, title, artist,
      musicbrainz_recording_id AS musicbrainzRecordingId
    FROM sleeve_local_attachments WHERE local_track_id = ?`).get(localTrackId) as LocalAttachmentForMatch | undefined;
  return row ?? null;
}

export interface ArtistForResearch { id: string; name: string; }

export function artistForResearch(id: string): ArtistForResearch | null {
  const row = open().prepare('SELECT id, name FROM sleeve_artists WHERE id = ?').get(id) as ArtistForResearch | undefined;
  return row ?? null;
}

export interface CanonicalReleaseForResearch {
  id: string;
  title: string;
  musicbrainzReleaseId: string;
  releaseGroupId: string | null;
  primaryType: string | null;
  status: string | null;
  date: string | null;
  country: string | null;
  selectionReason: string | null;
}

export interface RecordingForGenius {
  id: string;
  title: string;
  artist: string | null;
}

export function recordingForGenius(id: string): RecordingForGenius | null {
  const row = open().prepare(`SELECT r.id, r.title, a.name AS artist
    FROM sleeve_recordings r LEFT JOIN sleeve_artists a ON a.id = r.artist_id
    WHERE r.id = ? AND r.match_state = 'matched' AND a.name IS NOT NULL`).get(id) as RecordingForGenius | undefined;
  return row ?? null;
}

export function canonicalReleaseForResearch(id: string): CanonicalReleaseForResearch | null {
  return canonicalReleaseForResearchInDatabase(open(), id);
}

export function canonicalReleaseForResearchInDatabase(db: Database.Database, id: string): CanonicalReleaseForResearch | null {
  const row = db.prepare(`SELECT r.id, r.title, r.musicbrainz_release_id AS musicbrainzReleaseId,
    r.musicbrainz_release_group_id AS releaseGroupId, r.primary_type AS primaryType, r.status,
    rr.release_date AS date, rr.country, rr.selection_reason AS selectionReason
    FROM sleeve_releases r JOIN sleeve_recording_releases rr ON rr.release_id = r.id
    WHERE r.id = ? AND rr.is_canonical_home = 1`).get(id) as CanonicalReleaseForResearch | undefined;
  return row ?? null;
}

export function retainSourceDocument(input: {
  entityType: 'artist' | 'recording' | 'release';
  entityId: string;
  provider: string;
  sourceUrl: string;
  revisionId: string | null;
  contentKind: 'bounded-text' | 'structured-json';
  content: string;
  attribution: string;
}): string {
  const db = open();
  const contentHash = createHash('sha256').update(input.content).digest('hex');
  db.prepare(`INSERT INTO sleeve_source_documents (id, entity_type, entity_id, provider,
    source_url, revision_id, content_hash, content_kind, content, attribution, retrieved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, source_url, revision_id, content_hash) DO UPDATE SET
      retrieved_at = excluded.retrieved_at, attribution = excluded.attribution`)
    .run(randomUUID(), input.entityType, input.entityId, input.provider, input.sourceUrl,
      input.revisionId, contentHash, input.contentKind, input.content, input.attribution,
      new Date().toISOString());
  const row = db.prepare(`SELECT id FROM sleeve_source_documents
    WHERE provider = ? AND source_url = ? AND revision_id IS ? AND content_hash = ?`)
    .get(input.provider, input.sourceUrl, input.revisionId, contentHash) as { id: string } | undefined;
  if (!row) throw new Error('Sleeve Notes source document was not retained');
  return row.id;
}

function relationshipClaim(recording: RecordingForGenius, relationship: ProviderRelationship): ResearchCandidate | null {
  const source = `${recording.title}${recording.artist ? ` by ${recording.artist}` : ''}`;
  const target = `${relationship.target.title}${relationship.target.artist ? ` by ${relationship.target.artist}` : ''}`;
  const wording = {
    samples: `${source} samples ${target}.`,
    sampled_in: `${source} is sampled in ${target}.`,
    cover_of: `${source} is a cover of ${target}.`,
    covered_by: `${source} has been covered by ${target}.`,
  }[relationship.type];
  if (!wording) return null;
  return {
    category: 'musical-connections',
    topic: `${relationship.type.replaceAll('_', ' ')}: ${target}`.slice(0, 100),
    wording,
    evidence: JSON.stringify(relationship),
  };
}

/** Retain only the provider adapter's lyrics-free allowlist and its claims. */
export function retainGeniusResult(recording: RecordingForGenius, result: SleeveProviderResult): void {
  const content = JSON.stringify(result);
  const sourceDocumentId = retainSourceDocument({
    entityType: 'recording', entityId: recording.id, provider: 'genius',
    sourceUrl: result.identity.canonicalUrl, revisionId: null,
    contentKind: 'structured-json', content, attribution: result.attribution,
  });
  const candidates: ResearchCandidate[] = [
    ...result.credits.map((credit): ResearchCandidate => ({
      category: 'credits',
      topic: `${credit.role}: ${credit.names.join(', ')}`.slice(0, 100),
      wording: `${recording.title} is credited to ${credit.names.join(', ')} for ${credit.role.toLowerCase()}.`,
      evidence: JSON.stringify(credit),
    })),
    ...result.relationships.map((relationship) => relationshipClaim(recording, relationship))
      .filter((candidate): candidate is ResearchCandidate => candidate !== null),
  ];
  retainResearchClaims({ entityType: 'recording', entityId: recording.id, sourceDocumentId, candidates });
}

export type ProviderRequestOutcome = 'ready' | 'no-match' | 'failed' | 'rate-limited';
export type ProviderRequestReservation = { requestId: string } | { waitMs: number };

/** Persist and reserve a request atomically against the station-wide Genius limits. */
export function reserveGeniusProviderRequest(now = new Date()): ProviderRequestReservation {
  const db = open();
  const reserve = db.transaction((): ProviderRequestReservation => {
    const nowMs = now.getTime();
    const minuteCutoff = new Date(nowMs - 60_000).toISOString();
    const dayCutoff = new Date(nowMs - 24 * 60 * 60_000).toISOString();
    const recentFailures = db.prepare(`SELECT outcome, status_code AS statusCode, requested_at AS requestedAt
      FROM sleeve_provider_requests WHERE provider = 'genius' AND requested_at >= ?
      ORDER BY requested_at DESC LIMIT 100`).all(dayCutoff) as Array<{
        outcome: string; statusCode: number | null; requestedAt: string;
      }>;
    let consecutiveFailures = 0;
    for (const request of recentFailures) {
      const retryable = request.outcome === 'rate-limited' || (request.statusCode !== null && request.statusCode >= 500)
        || (request.outcome === 'failed' && request.statusCode === null);
      if (!retryable) break;
      consecutiveFailures++;
    }
    if (consecutiveFailures) {
      const delayMs = Math.min(60_000 * 2 ** Math.min(consecutiveFailures - 1, 6), 60 * 60_000);
      const backoffUntil = new Date(recentFailures[0].requestedAt).getTime() + delayMs;
      if (backoffUntil > nowMs) return { waitMs: backoffUntil - nowMs };
    }
    const daily = db.prepare(`SELECT requested_at AS requestedAt FROM sleeve_provider_requests
      WHERE provider = 'genius' AND requested_at >= ? ORDER BY requested_at`).all(dayCutoff) as Array<{ requestedAt: string }>;
    if (daily.length >= 4_320) {
      return { waitMs: Math.max(1_000, new Date(daily[0].requestedAt).getTime() + 24 * 60 * 60_000 - nowMs) };
    }
    const recent = db.prepare(`SELECT requested_at AS requestedAt FROM sleeve_provider_requests
      WHERE provider = 'genius' AND requested_at >= ? ORDER BY requested_at`).all(minuteCutoff) as Array<{ requestedAt: string }>;
    if (recent.length >= 3) {
      return { waitMs: Math.max(1_000, new Date(recent[0].requestedAt).getTime() + 60_000 - nowMs) };
    }
    const requestId = randomUUID();
    db.prepare(`INSERT INTO sleeve_provider_requests (id, provider, capability, requested_at, outcome)
      VALUES (?, 'genius', 'connections', ?, 'started')`).run(requestId, now.toISOString());
    return { requestId };
  });
  return reserve.immediate();
}

export function finishGeniusProviderRequest(id: string, outcome: ProviderRequestOutcome, statusCode: number | null): void {
  open().prepare(`UPDATE sleeve_provider_requests SET completed_at = ?, outcome = ?, status_code = ?
    WHERE id = ? AND provider = 'genius'`).run(new Date().toISOString(), outcome, statusCode, id);
}

export function retryResearchJob(id: string, delayMs: number): void {
  const runAfter = new Date(Date.now() + Math.max(0, delayMs)).toISOString();
  open().prepare(`UPDATE sleeve_research_jobs SET state = 'retry-at', run_after = ?, updated_at = ? WHERE id = ?`)
    .run(runAfter, new Date().toISOString(), id);
}

export function requeueResearchJob(id: string): void {
  open().prepare(`UPDATE sleeve_research_jobs SET state = 'queued', run_after = NULL, updated_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), id);
}

export interface SourceDocumentForResearch {
  id: string;
  entityId: string;
  provider: string;
  subjectName: string | null;
  sourceUrl: string;
  revisionId: string | null;
  content: string;
}

export function latestSourceDocumentForResearch(entityType: 'artist' | 'recording' | 'release', entityId: string, provider: string): SourceDocumentForResearch | null {
  const row = open().prepare(`SELECT s.id, s.entity_id AS entityId, s.provider, a.name AS subjectName,
    s.source_url AS sourceUrl, s.revision_id AS revisionId, s.content
    FROM sleeve_source_documents s
    LEFT JOIN sleeve_artists a ON s.entity_type = 'artist' AND a.id = s.entity_id
    WHERE s.entity_type = ? AND s.entity_id = ? AND s.provider = ?
    ORDER BY s.retrieved_at DESC LIMIT 1`).get(entityType, entityId, provider) as SourceDocumentForResearch | undefined;
  return row ?? null;
}

export function retainResearchClaims(input: {
  entityType: 'artist' | 'recording' | 'release';
  entityId: string;
  sourceDocumentId: string;
  candidates: readonly ResearchCandidate[];
}): void {
  const db = open();
  const now = new Date().toISOString();
  const insert = db.prepare(`INSERT INTO sleeve_claims (id, entity_type, entity_id, category, topic,
    wording, source_document_id, evidence, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(entity_type, entity_id, category, topic, source_document_id) DO UPDATE SET
      wording = excluded.wording, evidence = excluded.evidence, updated_at = excluded.updated_at`);
  const transaction = db.transaction(() => {
    for (const candidate of input.candidates) {
      insert.run(randomUUID(), input.entityType, input.entityId, candidate.category, candidate.topic,
        candidate.wording, input.sourceDocumentId, candidate.evidence, now, now);
    }
  });
  transaction();
}

export function markResearchJobRunning(id: string): void {
  open().prepare(`UPDATE sleeve_research_jobs SET state = 'running', attempts = attempts + 1,
    updated_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
}

export function finishResearchJob(id: string, state: 'complete' | 'failed'): void {
  open().prepare(`UPDATE sleeve_research_jobs SET state = ?, updated_at = ? WHERE id = ?`)
    .run(state, new Date().toISOString(), id);
}

/** Persist canonical identity and every returned release appearance atomically. */
export function retainCanonicalMusicBrainzMatch(localTrackId: string, result: CanonicalMusicBrainzRecording): void {
  retainCanonicalMusicBrainzMatchInDatabase(open(), localTrackId, result);
}

export function retainCanonicalMusicBrainzMatchInDatabase(db: Database.Database, localTrackId: string, result: CanonicalMusicBrainzRecording): void {
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    let artistId: string | null = null;
    if (result.artist) {
      const existing = db.prepare('SELECT id FROM sleeve_artists WHERE musicbrainz_id = ?').get(result.artist.id) as { id: string } | undefined;
      artistId = existing?.id ?? randomUUID();
      db.prepare(`INSERT INTO sleeve_artists (id, name, sort_name, musicbrainz_id, created_at, updated_at)
        VALUES (?, ?, NULL, ?, ?, ?) ON CONFLICT(musicbrainz_id) DO UPDATE SET
          name = excluded.name, updated_at = excluded.updated_at`)
        .run(artistId, result.artist.name, result.artist.id, now, now);
    }
    const existingRecording = db.prepare('SELECT id FROM sleeve_recordings WHERE musicbrainz_id = ?').get(result.id) as { id: string } | undefined;
    const recordingId = existingRecording?.id ?? randomUUID();
    db.prepare(`INSERT INTO sleeve_recordings (id, title, artist_id, musicbrainz_id, match_state, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'matched', ?, ?) ON CONFLICT(musicbrainz_id) DO UPDATE SET
        title = excluded.title, artist_id = excluded.artist_id, match_state = 'matched', updated_at = excluded.updated_at`)
      .run(recordingId, result.title, artistId, result.id, now, now);
    db.prepare(`UPDATE sleeve_local_attachments SET recording_id = ?, musicbrainz_recording_id = ?,
      match_state = 'matched', updated_at = ? WHERE local_track_id = ?`)
      .run(recordingId, result.id, now, localTrackId);

    const official = result.releases
      .filter((release) => release.status === 'Official' && !release.isCompilation && !!release.date)
      .sort((a, b) => a.date!.localeCompare(b.date!) || a.id.localeCompare(b.id));
    const firstId = official[0]?.id ?? null;
    const homeId = firstId;
    let canonicalReleaseId: string | null = null;
    for (const release of result.releases) {
      const existing = db.prepare('SELECT id FROM sleeve_releases WHERE musicbrainz_release_id = ?').get(release.id) as { id: string } | undefined;
      const releaseId = existing?.id ?? randomUUID();
      db.prepare(`INSERT INTO sleeve_releases (id, title, musicbrainz_release_id, musicbrainz_release_group_id,
        primary_type, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(musicbrainz_release_id) DO UPDATE SET title = excluded.title,
          musicbrainz_release_group_id = excluded.musicbrainz_release_group_id,
          primary_type = excluded.primary_type, status = excluded.status, updated_at = excluded.updated_at`)
        .run(releaseId, release.title, release.id, release.releaseGroupId, release.primaryType, release.status, now, now);
      db.prepare(`INSERT INTO sleeve_recording_releases (recording_id, release_id, release_date, country,
        artist_credit, is_compilation, is_first_official_non_compilation, is_canonical_home, selection_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(recording_id, release_id) DO UPDATE SET release_date = excluded.release_date,
          country = excluded.country, artist_credit = excluded.artist_credit, is_compilation = excluded.is_compilation,
          is_first_official_non_compilation = excluded.is_first_official_non_compilation,
          is_canonical_home = excluded.is_canonical_home, selection_reason = excluded.selection_reason`)
        .run(recordingId, releaseId, release.date, release.country, release.artistCredit, release.isCompilation ? 1 : 0,
          release.id === firstId ? 1 : 0, release.id === homeId ? 1 : 0,
          release.id === homeId ? 'earliest-official-non-compilation' : null);
      if (release.id === homeId) canonicalReleaseId = releaseId;
    }
    // Priorities are intentionally separated by a wide gap. Provider workers
    // select their own due work, while the future cross-provider scheduler can
    // still retain this artist -> release -> track order without guessing from
    // FIFO insertion order.
    if (artistId) enqueueResearchJobInDatabase(db, {
      provider: 'wikipedia', subjectType: 'artist', subjectId: artistId,
      capability: 'biography', priority: 300, now,
    });
    if (canonicalReleaseId) enqueueResearchJobInDatabase(db, {
      provider: 'musicbrainz', subjectType: 'release', subjectId: canonicalReleaseId,
      capability: 'release-context', priority: 200, now,
    });
    enqueueResearchJobInDatabase(db, {
      provider: 'genius', subjectType: 'recording', subjectId: recordingId,
      capability: 'connections', priority: 100, now,
    });
  });
  transaction();
}

function enqueueResearchJobInDatabase(db: Database.Database, input: {
  provider: string;
  subjectType: PendingResearchJob['subjectType'];
  subjectId: string;
  capability: string;
  priority: number;
  now: string;
}): void {
  db.prepare(`INSERT INTO sleeve_research_jobs (
    id, provider, subject_type, subject_id, capability, state, priority,
    attempts, run_after, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, 'queued', ?, 0, NULL, ?, ?)
  ON CONFLICT(provider, subject_type, subject_id, capability) DO UPDATE SET
    priority = MAX(sleeve_research_jobs.priority, excluded.priority),
    state = CASE WHEN sleeve_research_jobs.state IN ('failed', 'cancelled') THEN 'queued' ELSE sleeve_research_jobs.state END,
    updated_at = excluded.updated_at`)
    .run(randomUUID(), input.provider, input.subjectType, input.subjectId,
      input.capability, input.priority, input.now, input.now);
}

export function enqueueResearchJob(input: Omit<Parameters<typeof enqueueResearchJobInDatabase>[1], 'now'>): void {
  enqueueResearchJobInDatabase(open(), { ...input, now: new Date().toISOString() });
}

export interface ResearchStoreSummary {
  localAttachments: number;
  encounters: number;
  pendingMatches: number;
}

export interface ResearchStoreCoverage {
  processed: number;
  queued: number;
  'retry-at': number;
  failed: number;
}

export interface ResearchStoreReadout extends ResearchStoreSummary {
  artists: Array<{ name: string; musicbrainzId: string | null; sources: number; claims: number }>;
  claims: Array<{ artist: string | null; recording: string | null; category: string; topic: string; wording: string; evidence: string; sourceUrl: string; provider: string }>;
  jobs: Array<{ provider: string; subjectType: string; capability: string; state: string; priority: number }>;
}

export function researchStoreSummary(): ResearchStoreSummary {
  return researchStoreSummaryInDatabase(open());
}

export function researchStoreSummaryInDatabase(db: Database.Database): ResearchStoreSummary {
  const count = (sql: string) => (db.prepare(sql).get() as { count: number }).count;
  return {
    localAttachments: count('SELECT COUNT(*) AS count FROM sleeve_local_attachments'),
    encounters: count('SELECT COUNT(*) AS count FROM sleeve_encounters'),
    pendingMatches: count(`SELECT COUNT(*) AS count FROM sleeve_research_jobs
      WHERE provider = 'musicbrainz' AND capability = 'match' AND state IN ('queued', 'retry-at')`),
  };
}

export function researchStoreCoverage(): ResearchStoreCoverage {
  const rows = open().prepare(`SELECT state, COUNT(*) AS count FROM sleeve_research_jobs
    WHERE provider = 'genius' AND capability = 'connections' GROUP BY state`).all() as Array<{ state: string; count: number }>;
  const counts = Object.fromEntries(rows.map((row) => [row.state, row.count])) as Record<string, number>;
  return {
    processed: counts.complete ?? 0,
    queued: counts.queued ?? 0,
    'retry-at': counts['retry-at'] ?? 0,
    failed: counts.failed ?? 0,
  };
}

export function researchStoreReadout(limit = 80): ResearchStoreReadout {
  return researchStoreReadoutInDatabase(open(), limit);
}

export function researchStoreReadoutInDatabase(db: Database.Database, limit = 80): ResearchStoreReadout {
  const capped = Math.max(1, Math.min(200, Math.trunc(limit)));
  const summary = researchStoreSummaryInDatabase(db);
  const artists = db.prepare(`SELECT a.name, a.musicbrainz_id AS musicbrainzId,
    COUNT(DISTINCT s.id) AS sources, COUNT(DISTINCT c.id) AS claims
    FROM sleeve_artists a
    LEFT JOIN sleeve_source_documents s ON (s.entity_type = 'artist' AND s.entity_id = a.id)
      OR (s.entity_type = 'recording' AND s.entity_id IN (SELECT r.id FROM sleeve_recordings r WHERE r.artist_id = a.id))
    LEFT JOIN sleeve_claims c ON c.enabled = 1 AND ((c.entity_type = 'artist' AND c.entity_id = a.id)
      OR (c.entity_type = 'recording' AND c.entity_id IN (SELECT r.id FROM sleeve_recordings r WHERE r.artist_id = a.id)))
    GROUP BY a.id ORDER BY claims DESC, sources DESC, a.name LIMIT ?`).all(capped) as ResearchStoreReadout['artists'];
  const claims = db.prepare(`SELECT COALESCE(a.name, ra.name) AS artist, r.title AS recording,
    c.category, c.topic, c.wording, c.evidence, s.source_url AS sourceUrl, s.provider
    FROM sleeve_claims c
    LEFT JOIN sleeve_artists a ON c.entity_type = 'artist' AND c.entity_id = a.id
    LEFT JOIN sleeve_recordings r ON c.entity_type = 'recording' AND c.entity_id = r.id
    LEFT JOIN sleeve_artists ra ON ra.id = r.artist_id
    JOIN sleeve_source_documents s ON s.id = c.source_document_id
    WHERE c.enabled = 1 ORDER BY c.updated_at DESC LIMIT ?`).all(capped) as ResearchStoreReadout['claims'];
  const jobs = db.prepare(`SELECT provider, subject_type AS subjectType, capability, state, priority
    FROM sleeve_research_jobs ORDER BY updated_at DESC LIMIT ?`).all(capped) as ResearchStoreReadout['jobs'];
  return { ...summary, artists, claims, jobs };
}
