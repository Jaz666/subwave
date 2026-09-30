import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { open } from './db.js';
import type { CanonicalMusicBrainzRecording, MusicBrainzSeriesSnapshot } from '../music/musicbrainz.js';
import type { ResearchCandidate } from './researcher.js';
import type { ProviderRelationship, SleeveProviderResult } from './provider.js';
import {
  DEFAULT_MUSICBRAINZ_SERIES,
  MUSICBRAINZ_SERIES_BY_ID,
  type DefaultMusicBrainzSeries,
} from './musicbrainz-series-catalog.js';

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

export interface ArtistForResearch { id: string; name: string; musicBrainzId: string; }

export function artistForResearch(id: string): ArtistForResearch | null {
  const row = open().prepare('SELECT id, name, musicbrainz_id AS musicBrainzId FROM sleeve_artists WHERE id = ?').get(id) as ArtistForResearch | undefined;
  return row ?? null;
}

export function startProviderRequest(input: { provider: string; capability: string }): string {
  const id = randomUUID();
  open().prepare(`INSERT INTO sleeve_provider_requests (id, provider, capability, requested_at, outcome)
    VALUES (?, ?, ?, ?, 'started')`).run(id, input.provider, input.capability, new Date().toISOString());
  return id;
}

export function finishProviderRequest(id: string, outcome: 'ready' | 'no-match' | 'failed' | 'rate-limited', statusCode: number | null = null): void {
  open().prepare(`UPDATE sleeve_provider_requests SET outcome = ?, status_code = ?, completed_at = ? WHERE id = ?`)
    .run(outcome, statusCode, new Date().toISOString(), id);
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

/** Return the station's selected canonical release for a matched local track. */
export function canonicalReleaseForLocalTrack(localTrackId: string): { title: string; date: string | null } | null {
  const id = String(localTrackId ?? '').trim();
  if (!id) return null;
  const row = open().prepare(`SELECT release.title, rr.release_date AS date
    FROM sleeve_local_attachments attachment
    JOIN sleeve_recordings recording ON recording.id = attachment.recording_id
    JOIN sleeve_recording_releases rr ON rr.recording_id = recording.id AND rr.is_canonical_home = 1
    JOIN sleeve_releases release ON release.id = rr.release_id
    WHERE attachment.local_track_id = ? AND attachment.match_state = 'matched'
      AND recording.match_state = 'matched'
    LIMIT 1`).get(id) as { title: string; date: string | null } | undefined;
  return row ?? null;
}

export interface RecordingForGenius { id: string; title: string; artist: string | null; }

export function recordingForGenius(id: string): RecordingForGenius | null {
  const row = open().prepare(`SELECT r.id, r.title, a.name AS artist
    FROM sleeve_recordings r LEFT JOIN sleeve_artists a ON a.id = r.artist_id
    WHERE r.id = ? AND r.match_state = 'matched' AND a.name IS NOT NULL`).get(id) as RecordingForGenius | undefined;
  return row ?? null;
}

export function retainSourceDocument(input: {
  entityType: 'artist' | 'recording' | 'release' | 'release-group';
  entityId: string;
  provider: string;
  sourceUrl: string;
  revisionId: string | null;
  contentKind: 'bounded-text' | 'structured-json';
  content: string;
  attribution: string;
}): string {
  return retainSourceDocumentInDatabase(open(), input);
}

function retainSourceDocumentInDatabase(db: Database.Database, input: {
  entityType: 'artist' | 'recording' | 'release' | 'release-group';
  entityId: string;
  provider: string;
  sourceUrl: string;
  revisionId: string | null;
  contentKind: 'bounded-text' | 'structured-json';
  content: string;
  attribution: string;
}): string {
  const contentHash = createHash('sha256').update(input.content).digest('hex');
  db.prepare(`INSERT INTO sleeve_source_documents (id, entity_type, entity_id, provider,
    source_url, revision_id, content_hash, content_kind, content, attribution, retrieved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, entity_type, entity_id, source_url, revision_id, content_hash) DO UPDATE SET
      retrieved_at = excluded.retrieved_at, attribution = excluded.attribution`)
    .run(randomUUID(), input.entityType, input.entityId, input.provider, input.sourceUrl,
      input.revisionId, contentHash, input.contentKind, input.content, input.attribution,
      new Date().toISOString());
  const row = db.prepare(`SELECT id FROM sleeve_source_documents
    WHERE provider = ? AND entity_type = ? AND entity_id = ? AND source_url = ?
      AND revision_id IS ? AND content_hash = ?`)
    .get(input.provider, input.entityType, input.entityId, input.sourceUrl,
      input.revisionId, contentHash) as { id: string } | undefined;
  if (!row) throw new Error('Sleeve Notes source document was not retained');
  return row.id;
}

const MUSICBRAINZ_SERIES_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const MUSICBRAINZ_SERIES_LEASE_MS = 15 * 60 * 1000;

export interface DueMusicBrainzSeries extends DefaultMusicBrainzSeries {
  attempts: number;
}

function ensureDefaultMusicBrainzSeriesRows(db: Database.Database, now: Date): void {
  const insert = db.prepare(`INSERT INTO sleeve_musicbrainz_series (
    series_mbid, series_name, entity_type, ranked, series_order,
    edition_group, edition_year, next_refresh_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(series_mbid) DO UPDATE SET
    series_name = excluded.series_name, entity_type = excluded.entity_type,
    ranked = excluded.ranked, series_order = excluded.series_order,
    edition_group = excluded.edition_group, edition_year = excluded.edition_year,
    updated_at = excluded.updated_at`);
  for (const series of DEFAULT_MUSICBRAINZ_SERIES) {
    insert.run(series.id, series.label, series.entityType, series.ranked ? 1 : 0, series.order,
      series.editionGroup ?? null, series.editionYear ?? null, new Date(0).toISOString(), now.toISOString());
  }
}

/** Reserve one due allowlisted Series refresh; the short lease survives a process restart. */
export function reserveDueMusicBrainzSeries(now = new Date()): DueMusicBrainzSeries | null {
  const db = open();
  return db.transaction((): DueMusicBrainzSeries | null => {
    ensureDefaultMusicBrainzSeriesRows(db, now);
    const row = db.prepare(`SELECT series_mbid AS id, attempts
      FROM sleeve_musicbrainz_series WHERE next_refresh_at <= ?
      ORDER BY series_order ASC LIMIT 1`).get(now.toISOString()) as { id: string; attempts: number } | undefined;
    if (!row) return null;
    const series = MUSICBRAINZ_SERIES_BY_ID.get(row.id);
    if (!series) return null;
    const leaseUntil = new Date(now.getTime() + MUSICBRAINZ_SERIES_LEASE_MS).toISOString();
    db.prepare(`UPDATE sleeve_musicbrainz_series
      SET next_refresh_at = ?, attempts = attempts + 1, last_error = NULL, updated_at = ?
      WHERE series_mbid = ?`).run(leaseUntil, now.toISOString(), row.id);
    return { ...series, attempts: row.attempts + 1 };
  }).immediate();
}

/** Retry a failed Series fetch without blocking other MusicBrainz capabilities. */
export function deferMusicBrainzSeriesRefresh(id: string, error: string, delayMs: number, now = new Date()): void {
  const boundedError = error.slice(0, 500);
  const next = new Date(now.getTime() + Math.max(60_000, delayMs)).toISOString();
  open().prepare(`UPDATE sleeve_musicbrainz_series
    SET next_refresh_at = ?, last_error = ?, updated_at = ? WHERE series_mbid = ?`)
    .run(next, boundedError, now.toISOString(), id);
}

export interface RetainedMusicBrainzSeriesSnapshot { members: number; claimsEnabled: number; }

/** Replace one cached list snapshot and refresh only already matched local entities. */
export function retainMusicBrainzSeriesSnapshot(
  series: DefaultMusicBrainzSeries,
  snapshot: MusicBrainzSeriesSnapshot,
  now = new Date(),
): RetainedMusicBrainzSeriesSnapshot {
  if (snapshot.id !== series.id) throw new Error('MusicBrainz Series response ID did not match the requested list');
  const db = open();
  return db.transaction((): RetainedMusicBrainzSeriesSnapshot => {
    ensureDefaultMusicBrainzSeriesRows(db, now);
    const previous = db.prepare(`SELECT entity_mbid AS entityMbid
      FROM sleeve_musicbrainz_series_members WHERE series_mbid = ?`).all(series.id) as Array<{ entityMbid: string }>;
    const incoming = new Map(snapshot.members.map((member) => [member.id, member]));
    const affected = new Set([...previous.map((member) => member.entityMbid), ...incoming.keys()]);

    db.prepare('DELETE FROM sleeve_musicbrainz_series_members WHERE series_mbid = ?').run(series.id);
    const insertMember = db.prepare(`INSERT INTO sleeve_musicbrainz_series_members
      (series_mbid, entity_mbid, entity_title, rank_value) VALUES (?, ?, ?, ?)`);
    for (const member of incoming.values()) {
      insertMember.run(series.id, member.id, member.title, member.rank);
    }

    let claimsEnabled = 0;
    for (const memberId of affected) {
      if (series.entityType === 'recording') {
        claimsEnabled += reconcileRecordingRecognitionInDatabase(db, memberId, [series.id]);
      } else {
        const familyIds = series.editionGroup === '1001-albums'
          ? DEFAULT_MUSICBRAINZ_SERIES.filter((item) => item.editionGroup === '1001-albums').map((item) => item.id)
          : [series.id];
        claimsEnabled += reconcileReleaseGroupRecognitionInDatabase(db, memberId, familyIds);
      }
    }

    const fetchedAt = now.toISOString();
    const nextRefresh = new Date(now.getTime() + MUSICBRAINZ_SERIES_REFRESH_MS).toISOString();
    db.prepare(`UPDATE sleeve_musicbrainz_series SET fetched_at = ?, next_refresh_at = ?,
      attempts = 0, last_error = NULL, updated_at = ? WHERE series_mbid = ?`)
      .run(fetchedAt, nextRefresh, fetchedAt, series.id);
    return { members: snapshot.members.length, claimsEnabled };
  }).immediate();
}

function seriesSourceUrl(seriesId: string): string {
  return `https://musicbrainz.org/series/${encodeURIComponent(seriesId)}`;
}

function disableSeriesClaimsForLocalEntity(
  db: Database.Database,
  seriesIds: readonly string[],
  entityType: 'recording' | 'release',
  entityId: string,
): void {
  if (!seriesIds.length) return;
  const urls = seriesIds.map(seriesSourceUrl);
  const placeholders = urls.map(() => '?').join(', ');
  db.prepare(`UPDATE sleeve_claims SET enabled = 0
    WHERE entity_type = ? AND entity_id = ? AND category = 'recognition'
      AND source_document_id IN (
        SELECT id FROM sleeve_source_documents
        WHERE provider = 'musicbrainz-series' AND source_url IN (${placeholders})
      )`).run(entityType, entityId, ...urls);
}

function recognitionWording(
  series: DefaultMusicBrainzSeries,
  title: string,
  rank: string | null,
): string {
  if (series.editionGroup === '1001-albums' && series.editionYear) {
    const action = series.editionYear === 2005 ? 'was included in' : 'was added to';
    return `“${title}” ${action} the ${series.editionYear} edition of 1001 Albums You Must Hear Before You Die.`;
  }
  if (series.ranked && rank) return `“${title}” was ranked number ${rank} in ${series.label}.`;
  return `“${title}” was included in ${series.label}.`;
}

function retainSeriesRecognitionClaim(
  db: Database.Database,
  series: DefaultMusicBrainzSeries,
  entityType: 'recording' | 'release',
  entityId: string,
  member: { id: string; title: string; rank: string | null },
  now: Date,
): void {
  const sourceUrl = seriesSourceUrl(series.id);
  const evidence = JSON.stringify({
    seriesId: series.id,
    seriesName: series.label,
    localEntityId: entityId,
    memberType: series.entityType,
    memberId: member.id,
    memberTitle: member.title,
    rank: series.ranked ? member.rank : null,
    editionYear: series.editionYear ?? null,
  });
  const sourceDocumentId = retainSourceDocumentInDatabase(db, {
    entityType, entityId, provider: 'musicbrainz-series', sourceUrl,
    revisionId: null, contentKind: 'structured-json', content: evidence,
    attribution: 'MusicBrainz data, CC0',
  });
  const topic = series.editionGroup === '1001-albums'
    ? '1001 Albums You Must Hear Before You Die'
    : series.label;
  db.prepare(`INSERT INTO sleeve_claims (
    id, entity_type, entity_id, category, topic, wording, source_document_id,
    evidence, enabled, created_at, updated_at
  ) VALUES (?, ?, ?, 'recognition', ?, ?, ?, ?, 1, ?, ?)
  ON CONFLICT(entity_type, entity_id, category, topic, source_document_id) DO UPDATE SET
    wording = excluded.wording, evidence = excluded.evidence,
    enabled = 1, updated_at = excluded.updated_at`)
    .run(randomUUID(), entityType, entityId, topic,
      recognitionWording(series, member.title, series.ranked ? member.rank : null),
      sourceDocumentId, evidence, now.toISOString(), now.toISOString());
}

function reconcileRecordingRecognitionInDatabase(
  db: Database.Database,
  recordingMbid: string,
  seriesIds: readonly string[],
): number {
  const recordings = db.prepare(`SELECT r.id, r.title
    FROM sleeve_recordings r WHERE r.musicbrainz_id = ? AND r.match_state = 'matched'`)
    .all(recordingMbid) as Array<{ id: string; title: string }>;
  if (!recordings.length) return 0;
  let count = 0;
  for (const recording of recordings) {
    disableSeriesClaimsForLocalEntity(db, seriesIds, 'recording', recording.id);
    for (const seriesId of seriesIds) {
      const series = MUSICBRAINZ_SERIES_BY_ID.get(seriesId);
      if (!series) continue;
      const member = db.prepare(`SELECT entity_mbid AS id, entity_title AS title, rank_value AS rank
        FROM sleeve_musicbrainz_series_members WHERE series_mbid = ? AND entity_mbid = ?`)
        .get(series.id, recordingMbid) as { id: string; title: string; rank: string | null } | undefined;
      if (!member) continue;
      retainSeriesRecognitionClaim(db, series, 'recording', recording.id,
        { ...member, title: recording.title }, new Date());
      count++;
    }
  }
  return count;
}

function releaseGroupMembersInCatalogOrder(db: Database.Database, releaseGroupMbid: string, seriesIds: readonly string[]): Array<{
  series: DefaultMusicBrainzSeries; member: { id: string; title: string; rank: string | null };
}> {
  const result: Array<{ series: DefaultMusicBrainzSeries; member: { id: string; title: string; rank: string | null } }> = [];
  for (const seriesId of seriesIds) {
    const series = MUSICBRAINZ_SERIES_BY_ID.get(seriesId);
    if (!series) continue;
    const member = db.prepare(`SELECT entity_mbid AS id, entity_title AS title, rank_value AS rank
      FROM sleeve_musicbrainz_series_members WHERE series_mbid = ? AND entity_mbid = ?`)
      .get(series.id, releaseGroupMbid) as { id: string; title: string; rank: string | null } | undefined;
    if (member) result.push({ series, member });
  }
  return result.sort((a, b) => a.series.order - b.series.order);
}

function reconcileReleaseGroupRecognitionInDatabase(
  db: Database.Database,
  releaseGroupMbid: string,
  seriesIds: readonly string[],
): number {
  const releases = db.prepare(`SELECT DISTINCT r.id, r.title
    FROM sleeve_releases r
    JOIN sleeve_recording_releases rr ON rr.release_id = r.id AND rr.is_canonical_home = 1
    JOIN sleeve_recordings recording ON recording.id = rr.recording_id AND recording.match_state = 'matched'
    WHERE r.musicbrainz_release_group_id = ?`)
    .all(releaseGroupMbid) as Array<{ id: string; title: string }>;
  if (!releases.length) return 0;
  const refresh1001Family = seriesIds.some((id) => MUSICBRAINZ_SERIES_BY_ID.get(id)?.editionGroup === '1001-albums');
  const familyIds = refresh1001Family
    ? DEFAULT_MUSICBRAINZ_SERIES.filter((series) => series.editionGroup === '1001-albums').map((series) => series.id)
    : [];
  const independentIds = seriesIds.filter((id) => MUSICBRAINZ_SERIES_BY_ID.get(id)?.editionGroup !== '1001-albums');
  const effectiveSeriesIds = [...familyIds, ...independentIds];
  const foundFamily = familyIds.length
    ? releaseGroupMembersInCatalogOrder(db, releaseGroupMbid, familyIds)[0] ?? null
    : null;
  const foundIndependent = releaseGroupMembersInCatalogOrder(db, releaseGroupMbid, independentIds);
  const now = new Date();
  let count = 0;
  for (const release of releases) {
    disableSeriesClaimsForLocalEntity(db, effectiveSeriesIds, 'release', release.id);
    if (foundFamily) {
      // The 1001 follow-up lists are additions. When the same album is found
      // in more than one cached edition, retain the earliest edition wording.
      retainSeriesRecognitionClaim(db, foundFamily.series, 'release', release.id,
        { ...foundFamily.member, title: release.title }, now);
      count++;
    }
    for (const entry of foundIndependent) {
      retainSeriesRecognitionClaim(db, entry.series, 'release', release.id,
        { ...entry.member, title: release.title }, now);
      count++;
    }
  }
  return count;
}

/** Reattach already cached Series facts as soon as a new canonical match lands. */
function materializeCachedMusicBrainzSeriesInDatabase(
  db: Database.Database,
  recordingMbid: string,
  releaseGroupMbids: readonly string[],
): void {
  const recordingSeriesIds = DEFAULT_MUSICBRAINZ_SERIES
    .filter((series) => series.entityType === 'recording').map((series) => series.id);
  reconcileRecordingRecognitionInDatabase(db, recordingMbid, recordingSeriesIds);
  const releaseGroupSeriesIds = DEFAULT_MUSICBRAINZ_SERIES
    .filter((series) => series.entityType === 'release-group').map((series) => series.id);
  for (const releaseGroupMbid of new Set(releaseGroupMbids.filter(Boolean))) {
    reconcileReleaseGroupRecognitionInDatabase(db, releaseGroupMbid, releaseGroupSeriesIds);
  }
}

function relationshipClaim(recording: RecordingForGenius, relationship: ProviderRelationship): ResearchCandidate | null {
  const source = `${recording.title}${recording.artist ? ` by ${recording.artist}` : ''}`;
  const target = `${relationship.target.title}${relationship.target.artist ? ` by ${relationship.target.artist}` : ''}`;
  const wording = {
    samples: `${source} samples ${target}.`, sampled_in: `${source} is sampled in ${target}.`,
    cover_of: `${source} is a cover of ${target}.`, covered_by: `${source} has been covered by ${target}.`,
  }[relationship.type];
  if (!wording) return null;
  return { category: 'musical-connections', topic: `${relationship.type.replaceAll('_', ' ')}: ${target}`.slice(0, 100), wording, evidence: JSON.stringify(relationship) };
}

/** Store only the provider adapter's lyrics-free allowlist. */
export function retainGeniusResult(recording: RecordingForGenius, result: SleeveProviderResult): void {
  const sourceDocumentId = retainSourceDocument({ entityType: 'recording', entityId: recording.id, provider: 'genius',
    sourceUrl: result.identity.canonicalUrl, revisionId: null, contentKind: 'structured-json',
    content: JSON.stringify(result), attribution: result.attribution });
  const candidates: ResearchCandidate[] = [
    ...result.credits.map((credit): ResearchCandidate => ({ category: 'credits',
      topic: `${credit.role}: ${credit.names.join(', ')}`.slice(0, 100),
      wording: `${recording.title} is credited to ${credit.names.join(', ')} for ${credit.role.toLowerCase()}.`, evidence: JSON.stringify(credit) })),
    ...result.relationships.map((relationship) => relationshipClaim(recording, relationship))
      .filter((candidate): candidate is ResearchCandidate => candidate !== null),
  ];
  retainResearchClaims({ entityType: 'recording', entityId: recording.id, sourceDocumentId, candidates });
}

export type ProviderRequestOutcome = 'ready' | 'no-match' | 'failed' | 'rate-limited';
export type ProviderRequestReservation = { requestId: string } | { waitMs: number };

/** Atomically enforce the station's conservative Genius request budget. */
export function reserveGeniusProviderRequest(now = new Date()): ProviderRequestReservation {
  const db = open();
  return db.transaction((): ProviderRequestReservation => {
    const nowMs = now.getTime();
    const minuteCutoff = new Date(nowMs - 60_000).toISOString();
    const dayCutoff = new Date(nowMs - 86_400_000).toISOString();
    const failures = db.prepare(`SELECT outcome, status_code AS statusCode, requested_at AS requestedAt
      FROM sleeve_provider_requests WHERE provider = 'genius' AND requested_at >= ?
      ORDER BY requested_at DESC LIMIT 100`).all(dayCutoff) as Array<{ outcome: string; statusCode: number | null; requestedAt: string }>;
    let consecutiveFailures = 0;
    for (const request of failures) {
      const retryable = request.outcome === 'rate-limited'
        || (request.statusCode !== null && request.statusCode >= 500)
        || (request.outcome === 'failed' && request.statusCode === null);
      if (!retryable) break;
      consecutiveFailures++;
    }
    if (consecutiveFailures) {
      const delayMs = Math.min(60_000 * 2 ** Math.min(consecutiveFailures - 1, 6), 3_600_000);
      const backoffUntil = Date.parse(failures[0].requestedAt) + delayMs;
      if (backoffUntil > nowMs) return { waitMs: backoffUntil - nowMs };
    }
    const recent = db.prepare(`SELECT requested_at AS requestedAt FROM sleeve_provider_requests
      WHERE provider = 'genius' AND requested_at >= ? ORDER BY requested_at`).all(minuteCutoff) as Array<{ requestedAt: string }>;
    if (recent.length >= 3) return { waitMs: Math.max(1_000, Date.parse(recent[0].requestedAt) + 60_000 - nowMs) };
    const daily = db.prepare(`SELECT requested_at AS requestedAt FROM sleeve_provider_requests
      WHERE provider = 'genius' AND requested_at >= ? ORDER BY requested_at`).all(dayCutoff) as Array<{ requestedAt: string }>;
    if (daily.length >= 4_320) return { waitMs: Math.max(1_000, Date.parse(daily[0].requestedAt) + 86_400_000 - nowMs) };
    const requestId = randomUUID();
    db.prepare(`INSERT INTO sleeve_provider_requests (id, provider, capability, requested_at, outcome)
      VALUES (?, 'genius', 'connections', ?, 'started')`).run(requestId, now.toISOString());
    return { requestId };
  }).immediate();
}

export function finishGeniusProviderRequest(id: string, outcome: ProviderRequestOutcome, statusCode: number | null): void {
  open().prepare(`UPDATE sleeve_provider_requests SET completed_at = ?, outcome = ?, status_code = ? WHERE id = ? AND provider = 'genius'`)
    .run(new Date().toISOString(), outcome, statusCode, id);
}

export function requeueResearchJob(id: string): void {
  open().prepare(`UPDATE sleeve_research_jobs SET state = 'queued', run_after = NULL, updated_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), id);
}

export interface SourceDocumentForResearch {
  id: string;
  entityId: string;
  provider: string;
  sourceUrl: string;
  revisionId: string | null;
  content: string;
}

export function latestSourceDocumentForResearch(entityType: 'artist' | 'recording' | 'release' | 'release-group', entityId: string, provider: string): SourceDocumentForResearch | null {
  const row = open().prepare(`SELECT id, entity_id AS entityId, provider, source_url AS sourceUrl,
    revision_id AS revisionId, content FROM sleeve_source_documents
    WHERE entity_type = ? AND entity_id = ? AND provider = ?
    ORDER BY retrieved_at DESC LIMIT 1`).get(entityType, entityId, provider) as SourceDocumentForResearch | undefined;
  return row ?? null;
}

export function retainResearchClaims(input: {
  entityType: 'artist' | 'recording' | 'release' | 'release-group';
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

/** Return work left marked running when a controller process was interrupted. */
export function recoverInterruptedResearchJobs(): number {
  return recoverInterruptedResearchJobsInDatabase(open());
}

export function recoverInterruptedResearchJobsInDatabase(db: Database.Database, now = new Date()): number {
  const result = db.prepare(`UPDATE sleeve_research_jobs
    SET state = 'queued', run_after = NULL, updated_at = ?
    WHERE state = 'running'`).run(now.toISOString());
  return result.changes;
}

export interface WikipediaClaimRebuild {
  claimsRemoved: number;
  jobsQueued: number;
}

export interface WikipediaResearchRequeue {
  artistsWithCachedSources: number;
  releaseGroupsWithCachedSources: number;
  jobsQueued: number;
}

/** Queue extraction against cached Wikipedia text without changing claims or sources. */
export function requeueCachedWikipediaResearch(now = new Date()): WikipediaResearchRequeue {
  const db = open();
  const timestamp = now.toISOString();
  const transaction = db.transaction(() => {
    const artistsWithCachedSources = (db.prepare(`SELECT COUNT(DISTINCT entity_id) AS count
      FROM sleeve_source_documents WHERE provider = 'wikipedia' AND entity_type = 'artist'`)
      .get() as { count: number }).count;
    const releaseGroupsWithCachedSources = (db.prepare(`SELECT COUNT(DISTINCT entity_id) AS count
      FROM sleeve_source_documents WHERE provider = 'wikipedia' AND entity_type = 'release-group'`)
      .get() as { count: number }).count;
    db.prepare(`INSERT OR IGNORE INTO sleeve_research_jobs (
      id, provider, subject_type, subject_id, capability, state, priority,
      attempts, run_after, created_at, updated_at
    ) SELECT lower(hex(randomblob(16))), 'researcher', 'artist', s.entity_id,
      'extract-wikipedia', 'queued', 300, 0, NULL, ?, ?
      FROM sleeve_source_documents s
      WHERE s.provider = 'wikipedia' AND s.entity_type = 'artist'
      GROUP BY s.entity_id`).run(timestamp, timestamp);
    const jobsQueued = db.prepare(`UPDATE sleeve_research_jobs
      SET state = 'queued', attempts = 0, run_after = NULL, updated_at = ?
      WHERE provider = 'researcher' AND subject_type = 'artist'
        AND capability = 'extract-wikipedia'
        AND EXISTS (SELECT 1 FROM sleeve_source_documents s
          WHERE s.provider = 'wikipedia' AND s.entity_type = 'artist'
            AND s.entity_id = sleeve_research_jobs.subject_id)`)
      .run(timestamp).changes;
    db.prepare(`INSERT OR IGNORE INTO sleeve_research_jobs (
      id, provider, subject_type, subject_id, capability, state, priority,
      attempts, run_after, created_at, updated_at
    ) SELECT lower(hex(randomblob(16))), 'researcher', 'release', s.entity_id,
      'extract-wikipedia-release-group', 'queued', 350, 0, NULL, ?, ?
      FROM sleeve_source_documents s
      WHERE s.provider = 'wikipedia' AND s.entity_type = 'release-group'
      GROUP BY s.entity_id`).run(timestamp, timestamp);
    const releaseGroupJobsQueued = db.prepare(`UPDATE sleeve_research_jobs
      SET state = 'queued', attempts = 0, run_after = NULL, updated_at = ?
      WHERE provider = 'researcher' AND subject_type = 'release'
        AND capability = 'extract-wikipedia-release-group'
        AND EXISTS (SELECT 1 FROM sleeve_source_documents s
          WHERE s.provider = 'wikipedia' AND s.entity_type = 'release-group'
            AND s.entity_id = sleeve_research_jobs.subject_id)`)
      .run(timestamp).changes;
    return {
      artistsWithCachedSources,
      releaseGroupsWithCachedSources,
      jobsQueued: jobsQueued + releaseGroupJobsQueued,
    };
  });
  return transaction.immediate();
}

/**
 * Discard only claims derived from cached Wikipedia prose and replay their
 * extraction jobs. No identity or provider work is repeated: a safer evidence
 * validator can therefore rebuild the editorial layer without hammering APIs.
 */
export function rebuildWikipediaClaims(): WikipediaClaimRebuild {
  return rebuildWikipediaClaimsInDatabase(open());
}

export function rebuildWikipediaClaimsInDatabase(db: Database.Database, now = new Date()): WikipediaClaimRebuild {
  const timestamp = now.toISOString();
  const transaction = db.transaction(() => {
    const claimsRemoved = db.prepare(`DELETE FROM sleeve_claims
      WHERE source_document_id IN (
        SELECT id FROM sleeve_source_documents
        WHERE provider = 'wikipedia' AND entity_type = 'artist'
      )`).run().changes;
    db.prepare(`INSERT OR IGNORE INTO sleeve_research_jobs (
      id, provider, subject_type, subject_id, capability, state, priority,
      attempts, run_after, created_at, updated_at
    ) SELECT lower(hex(randomblob(16))), 'researcher', 'artist', entity_id,
      'extract-wikipedia', 'queued', 300, 0, NULL, ?, ?
      FROM sleeve_source_documents
      WHERE provider = 'wikipedia' AND entity_type = 'artist'
      GROUP BY entity_id`).run(timestamp, timestamp);
    const jobsQueued = db.prepare(`UPDATE sleeve_research_jobs
      SET state = 'queued', attempts = 0, run_after = NULL, updated_at = ?
      WHERE provider = 'researcher' AND subject_type = 'artist'
        AND capability = 'extract-wikipedia'
        AND EXISTS (
          SELECT 1 FROM sleeve_source_documents s
          WHERE s.provider = 'wikipedia' AND s.entity_type = 'artist'
            AND s.entity_id = sleeve_research_jobs.subject_id
        )`).run(timestamp).changes;
    return { claimsRemoved, jobsQueued };
  });
  return transaction();
}

/**
 * Replay only one artist's cached Wikipedia research. The research job is
 * artist-scoped, so every cached Wikipedia claim for that artist is replaced
 * together; provider identity and source retrieval remain untouched.
 */
export function rebuildWikipediaClaimsForArtist(artistId: string): WikipediaClaimRebuild {
  return rebuildWikipediaClaimsForArtistInDatabase(open(), artistId);
}

export function rebuildWikipediaClaimsForArtistInDatabase(
  db: Database.Database, artistId: string, now = new Date(),
): WikipediaClaimRebuild {
  const timestamp = now.toISOString();
  const transaction = db.transaction(() => {
    const sourceExists = db.prepare(`SELECT 1 FROM sleeve_source_documents
      WHERE provider = 'wikipedia' AND entity_type = 'artist' AND entity_id = ? LIMIT 1`).get(artistId);
    if (!sourceExists) return { claimsRemoved: 0, jobsQueued: 0 };
    const claimsRemoved = db.prepare(`DELETE FROM sleeve_claims
      WHERE entity_type = 'artist' AND entity_id = ? AND source_document_id IN (
        SELECT id FROM sleeve_source_documents
        WHERE provider = 'wikipedia' AND entity_type = 'artist' AND entity_id = ?
      )`).run(artistId, artistId).changes;
    db.prepare(`INSERT OR IGNORE INTO sleeve_research_jobs (
      id, provider, subject_type, subject_id, capability, state, priority,
      attempts, run_after, created_at, updated_at
    ) VALUES (lower(hex(randomblob(16))), 'researcher', 'artist', ?,
      'extract-wikipedia', 'queued', 300, 0, NULL, ?, ?)`).run(artistId, timestamp, timestamp);
    const jobsQueued = db.prepare(`UPDATE sleeve_research_jobs
      SET state = 'queued', attempts = 0, run_after = NULL, updated_at = ?
      WHERE provider = 'researcher' AND subject_type = 'artist' AND subject_id = ?
        AND capability = 'extract-wikipedia'`).run(timestamp, artistId).changes;
    return { claimsRemoved, jobsQueued };
  });
  return transaction();
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

/** Shared pause after MusicBrainz tells us it is unavailable or rate-limited. */
export function musicBrainzOutageDelay(attempts: number): number {
  const minutes = [5, 15, 30, 60][Math.min(Math.max(0, attempts - 1), 3)];
  return minutes * 60_000;
}

/** Retry spacing for the multi-request MusicBrainz → Wikidata → Wikipedia path. */
export function wikipediaRetryDelay(attempts: number): number {
  const minutes = [1, 5, 15, 30, 60][Math.min(Math.max(0, attempts - 1), 4)];
  return minutes * 60_000;
}

/** Shared pause when one Wikimedia/MusicBrainz endpoint reports an outage. */
export function wikipediaOutageDelay(attempts: number): number {
  const minutes = [5, 15, 30, 60][Math.min(Math.max(0, attempts - 1), 3)];
  return minutes * 60_000;
}

export function deferWikipediaResearchJobsInDatabase(db: Database.Database, delayMs: number, now = new Date()): number {
  const runAfter = new Date(now.getTime() + delayMs).toISOString();
  return db.prepare(`UPDATE sleeve_research_jobs
    SET state = 'retry-at', run_after = ?, updated_at = ?
    WHERE provider = 'wikipedia' AND capability IN ('biography', 'release-group-biography')
      AND state IN ('queued', 'retry-at')`).run(runAfter, now.toISOString()).changes;
}

export function deferWikipediaResearchJobs(delayMs: number): number {
  return deferWikipediaResearchJobsInDatabase(open(), delayMs);
}

export function retryResearchJobInDatabase(db: Database.Database, id: string, delayMs = 5 * 60_000, now = new Date()): void {
  const runAfter = new Date(now.getTime() + delayMs).toISOString();
  db.prepare(`UPDATE sleeve_research_jobs
    SET state = 'retry-at', run_after = ?, updated_at = ? WHERE id = ?`)
    .run(runAfter, now.toISOString(), id);
}

/**
 * A 503 is a provider-level condition, not one bad track. Put every pending
 * external match behind one durable retry window so the single worker cannot
 * turn an outage into a five-second stream of requests.
 */
export function deferMusicBrainzMatchesInDatabase(db: Database.Database, delayMs: number, now = new Date()): number {
  const runAfter = new Date(now.getTime() + delayMs).toISOString();
  return db.prepare(`UPDATE sleeve_research_jobs
    SET state = 'retry-at', run_after = ?, updated_at = ?
    WHERE provider = 'musicbrainz' AND subject_type = 'local-track' AND capability = 'match'
      AND state IN ('queued', 'retry-at')`).run(runAfter, now.toISOString()).changes;
}

export function deferMusicBrainzMatches(delayMs: number): number {
  return deferMusicBrainzMatchesInDatabase(open(), delayMs);
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
    materializeCachedMusicBrainzSeriesInDatabase(db, result.id,
      result.releases.map((release) => release.releaseGroupId).filter((id): id is string => !!id));
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

/**
 * Queue album-level Wikipedia discovery for every known canonical release
 * group. This also backfills groups already matched before the capability was
 * added; existing jobs and retained source documents are left alone.
 */
export function enqueueMissingWikipediaReleaseGroupJobs(now = new Date()): number {
  const timestamp = now.toISOString();
  const db = open();
  return db.transaction(() => {
    const discoveryJobs = db.prepare(`INSERT OR IGNORE INTO sleeve_research_jobs (
      id, provider, subject_type, subject_id, capability, state, priority,
      attempts, run_after, created_at, updated_at
    ) SELECT lower(hex(randomblob(16))), 'wikipedia', 'release', groups.releaseGroupId,
      'release-group-biography', 'queued', 350, 0, NULL, ?, ?
      FROM (
        SELECT DISTINCT r.musicbrainz_release_group_id AS releaseGroupId
        FROM sleeve_releases r
        JOIN sleeve_recording_releases rr ON rr.release_id = r.id AND rr.is_canonical_home = 1
        WHERE r.musicbrainz_release_group_id IS NOT NULL
          AND trim(r.musicbrainz_release_group_id) <> ''
      ) groups
      WHERE NOT EXISTS (
        SELECT 1 FROM sleeve_source_documents s
        WHERE s.entity_type = 'release-group' AND s.entity_id = groups.releaseGroupId
          AND s.provider = 'wikipedia'
      )
      AND NOT EXISTS (
        SELECT 1 FROM sleeve_research_jobs j
        WHERE j.provider = 'wikipedia' AND j.subject_type = 'release'
          AND j.subject_id = groups.releaseGroupId AND j.capability = 'release-group-biography'
      )`).run(timestamp, timestamp).changes;
    const extractionJobs = db.prepare(`INSERT OR IGNORE INTO sleeve_research_jobs (
      id, provider, subject_type, subject_id, capability, state, priority,
      attempts, run_after, created_at, updated_at
    ) SELECT lower(hex(randomblob(16))), 'researcher', 'release', s.entity_id,
      'extract-wikipedia-release-group', 'queued', 350, 0, NULL, ?, ?
      FROM sleeve_source_documents s
      WHERE s.entity_type = 'release-group' AND s.provider = 'wikipedia'
        AND NOT EXISTS (
          SELECT 1 FROM sleeve_research_jobs j
          WHERE j.provider = 'researcher' AND j.subject_type = 'release'
            AND j.subject_id = s.entity_id AND j.capability = 'extract-wikipedia-release-group'
        )`).run(timestamp, timestamp).changes;
    return discoveryJobs + extractionJobs;
  }).immediate();
}

export interface ResearchStoreSummary {
  localAttachments: number;
  encounters: number;
  pendingMatches: number;
  retainedClaims: number;
  researchJobs: number;
}

export interface ResearchStoreCoverage { processed: number; queued: number; 'retry-at': number; failed: number; }

export function researchStoreCoverage(): ResearchStoreCoverage {
  const rows = open().prepare(`SELECT state, COUNT(*) AS count FROM sleeve_research_jobs
    WHERE provider = 'genius' AND capability = 'connections' GROUP BY state`).all() as Array<{ state: string; count: number }>;
  const counts = Object.fromEntries(rows.map((row) => [row.state, row.count])) as Record<string, number>;
  return { processed: counts.complete ?? 0, queued: counts.queued ?? 0,
    'retry-at': counts['retry-at'] ?? 0, failed: counts.failed ?? 0 };
}

export interface ResearchStoreReadout extends ResearchStoreSummary {
  artists: Array<{ name: string; musicbrainzId: string | null; sources: number; claims: number }>;
  claims: Array<{ artist: string | null; recording: string | null; category: string; topic: string; wording: string; evidence: string; sourceUrl: string; provider: string }>;
  jobs: Array<{ provider: string; subjectType: string; capability: string; state: string; priority: number; attempts: number; runAfter: string | null; updatedAt: string }>;
  jobSummary: Array<{ provider: string; capability: string; state: string; jobs: number; attempts: number; nextDue: string | null; updatedAt: string }>;
  providerSummary: Array<{ provider: string; capability: string; outcome: string; status: number | null; requests: number; lastRequestedAt: string }>;
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
    retainedClaims: count('SELECT COUNT(*) AS count FROM sleeve_claims WHERE enabled = 1'),
    researchJobs: count('SELECT COUNT(*) AS count FROM sleeve_research_jobs'),
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
  const claims = db.prepare(`SELECT COALESCE(a.name, ra.name) AS artist,
    COALESCE(r.title, local_release.title, (SELECT rg_release.title FROM sleeve_releases rg_release
      WHERE c.entity_type = 'release-group'
        AND rg_release.musicbrainz_release_group_id = c.entity_id
      ORDER BY rg_release.title LIMIT 1)) AS recording,
    c.category, c.topic, c.wording, c.evidence, s.source_url AS sourceUrl, s.provider FROM sleeve_claims c
    LEFT JOIN sleeve_artists a ON c.entity_type = 'artist' AND c.entity_id = a.id
    LEFT JOIN sleeve_recordings r ON c.entity_type = 'recording' AND c.entity_id = r.id
    LEFT JOIN sleeve_releases local_release ON c.entity_type = 'release' AND c.entity_id = local_release.id
    LEFT JOIN sleeve_artists ra ON ra.id = r.artist_id
    JOIN sleeve_source_documents s ON s.id = c.source_document_id
    WHERE c.enabled = 1 ORDER BY c.updated_at DESC LIMIT ?`).all(capped) as ResearchStoreReadout['claims'];
  const jobs = db.prepare(`SELECT provider, subject_type AS subjectType, capability, state, priority,
    attempts, run_after AS runAfter, updated_at AS updatedAt
    FROM sleeve_research_jobs ORDER BY updated_at DESC LIMIT ?`).all(capped) as ResearchStoreReadout['jobs'];
  const jobSummary = db.prepare(`SELECT provider, capability, state, COUNT(*) AS jobs,
    SUM(attempts) AS attempts, MIN(run_after) AS nextDue, MAX(updated_at) AS updatedAt
    FROM sleeve_research_jobs GROUP BY provider, capability, state
    ORDER BY provider, capability, state`).all() as ResearchStoreReadout['jobSummary'];
  const providerSummary = db.prepare(`SELECT provider, capability, outcome, status_code AS status,
    COUNT(*) AS requests, MAX(requested_at) AS lastRequestedAt
    FROM sleeve_provider_requests GROUP BY provider, capability, outcome, status_code
    ORDER BY provider, capability, requests DESC`).all() as ResearchStoreReadout['providerSummary'];
  return { ...summary, artists, claims, jobs, jobSummary, providerSummary };
}
