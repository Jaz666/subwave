import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { open } from './db.js';
import type { CanonicalMusicBrainzRecording } from '../music/musicbrainz.js';
import type { ResearchCandidate } from './researcher.js';

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
}): void {
  const contentHash = createHash('sha256').update(input.content).digest('hex');
  open().prepare(`INSERT INTO sleeve_source_documents (id, entity_type, entity_id, provider,
    source_url, revision_id, content_hash, content_kind, content, attribution, retrieved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, source_url, revision_id, content_hash) DO UPDATE SET
      retrieved_at = excluded.retrieved_at, attribution = excluded.attribution`)
    .run(randomUUID(), input.entityType, input.entityId, input.provider, input.sourceUrl,
      input.revisionId, contentHash, input.contentKind, input.content, input.attribution,
      new Date().toISOString());
}

export interface SourceDocumentForResearch {
  id: string;
  entityId: string;
  provider: string;
  sourceUrl: string;
  revisionId: string | null;
  content: string;
}

export function latestSourceDocumentForResearch(entityType: 'artist' | 'recording' | 'release', entityId: string, provider: string): SourceDocumentForResearch | null {
  const row = open().prepare(`SELECT id, entity_id AS entityId, provider, source_url AS sourceUrl,
    revision_id AS revisionId, content FROM sleeve_source_documents
    WHERE entity_type = ? AND entity_id = ? AND provider = ?
    ORDER BY retrieved_at DESC LIMIT 1`).get(entityType, entityId, provider) as SourceDocumentForResearch | undefined;
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

/** A provider outage is not a content verdict. Keep the job durable and pause it. */
export function retryResearchJob(id: string, delayMs = 5 * 60_000): void {
  retryResearchJobInDatabase(open(), id, delayMs);
}

/**
 * Start with one prompt retry after a transient provider blip, then back off
 * enough that an outage cannot keep the quiet-time worker pressing the public
 * MusicBrainz service. The caller records one attempt before asking for this.
 */
export function musicBrainzRetryDelay(attempts: number): number {
  const minutes = [1, 5, 15, 30, 60][Math.min(Math.max(0, attempts - 1), 4)];
  return minutes * 60_000;
}

export function retryResearchJobInDatabase(db: Database.Database, id: string, delayMs = 5 * 60_000, now = new Date()): void {
  const runAfter = new Date(now.getTime() + delayMs).toISOString();
  db.prepare(`UPDATE sleeve_research_jobs
    SET state = 'retry-at', run_after = ?, updated_at = ? WHERE id = ?`)
    .run(runAfter, now.toISOString(), id);
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

export interface ResearchStoreReadout extends ResearchStoreSummary {
  artists: Array<{ name: string; musicbrainzId: string | null; sources: number; claims: number }>;
  claims: Array<{ artist: string; category: string; topic: string; wording: string; evidence: string; sourceUrl: string }>;
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

export function researchStoreReadout(limit = 80): ResearchStoreReadout {
  return researchStoreReadoutInDatabase(open(), limit);
}

export function researchStoreReadoutInDatabase(db: Database.Database, limit = 80): ResearchStoreReadout {
  const capped = Math.max(1, Math.min(200, Math.trunc(limit)));
  const summary = researchStoreSummaryInDatabase(db);
  const artists = db.prepare(`SELECT a.name, a.musicbrainz_id AS musicbrainzId,
    COUNT(DISTINCT s.id) AS sources, COUNT(DISTINCT c.id) AS claims
    FROM sleeve_artists a
    LEFT JOIN sleeve_source_documents s ON s.entity_type = 'artist' AND s.entity_id = a.id
    LEFT JOIN sleeve_claims c ON c.entity_type = 'artist' AND c.entity_id = a.id AND c.enabled = 1
    GROUP BY a.id ORDER BY claims DESC, sources DESC, a.name LIMIT ?`).all(capped) as ResearchStoreReadout['artists'];
  const claims = db.prepare(`SELECT a.name AS artist, c.category, c.topic, c.wording, c.evidence,
    s.source_url AS sourceUrl FROM sleeve_claims c
    JOIN sleeve_artists a ON c.entity_type = 'artist' AND c.entity_id = a.id
    JOIN sleeve_source_documents s ON s.id = c.source_document_id
    WHERE c.enabled = 1 ORDER BY c.updated_at DESC LIMIT ?`).all(capped) as ResearchStoreReadout['claims'];
  const jobs = db.prepare(`SELECT provider, subject_type AS subjectType, capability, state, priority
    FROM sleeve_research_jobs ORDER BY updated_at DESC LIMIT ?`).all(capped) as ResearchStoreReadout['jobs'];
  return { ...summary, artists, claims, jobs };
}
