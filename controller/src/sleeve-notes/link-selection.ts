// Local, bounded Sleeve Notes selection for the ordinary DJ link prompt.
// This module never calls a provider; an unavailable or unmatched store is a
// clean miss and leaves the regular Verified Facts packet untouched.
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import * as settings from '../settings.js';
import { open } from './db.js';
import { recordLiveDjRejection } from './moderation.js';

const EXACT_CLAIM_COOLDOWN_MS = 21 * 24 * 60 * 60 * 1000;
const TOPIC_COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000;
const RELATIONSHIP_COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000;
const PENDING_RESERVATION_MS = 2 * 60 * 60 * 1000;
// A measured vocal entry below this leaves no useful room for an Extended
// Sleeve Note. Skip the lookup entirely so the ordinary link writer receives
// the track without an optional Spark to force into its opening sentence.
export const EXTENDED_SLEEVE_NOTE_MIN_VOCAL_RUNWAY_MS = 2_000;
const ENTITY_COOLDOWN_MS = {
  recording: 21 * 24 * 60 * 60 * 1000,
  release: 45 * 24 * 60 * 60 * 1000,
  'release-group': 45 * 24 * 60 * 60 * 1000,
  artist: 90 * 24 * 60 * 60 * 1000,
} as const;
const MAX_COOLDOWN_MS = Math.max(
  TOPIC_COOLDOWN_MS,
  RELATIONSHIP_COOLDOWN_MS,
  ...Object.values(ENTITY_COOLDOWN_MS),
);

const EXTENDED_NOTE_TEXT_STOP_WORDS = new Set([
  'about', 'after', 'again', 'along', 'also', 'among', 'because', 'before', 'being',
  'between', 'both', 'came', 'created', 'during', 'from', 'group', 'groups', 'have',
  'into', 'made', 'more', 'most', 'other', 'over', 'record', 'records', 'their',
  'there', 'these', 'they', 'this', 'those', 'through', 'under', 'were', 'which',
  'while', 'with', 'without', 'would', 'album', 'albums', 'band', 'bands', 'track',
  'tracks', 'song', 'songs', 'music', 'artist', 'artists',
]);

/** High-precision wording signal; paraphrases may remain undetected. */
export function extendedSleeveNoteHasClearTextSignal(
  text: string,
  wording: string,
  trackArtist: unknown,
  trackTitle: unknown,
): boolean {
  const tokens = (value: string) => value.toLocaleLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || [];
  const contextText = [trackArtist, trackTitle]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  const contextTerms = new Set(tokens(contextText));
  const terms = new Set(tokens(wording).filter((token) =>
    !EXTENDED_NOTE_TEXT_STOP_WORDS.has(token) && !contextTerms.has(token)));
  if (terms.size < 2) return false;
  const spoken = new Set(tokens(text));
  let matches = 0;
  for (const term of terms) {
    if (spoken.has(term) && ++matches >= 2) return true;
  }
  return false;
}

export interface ExtendedSleeveNote {
  claimId: string;
  entityType: 'artist' | 'recording' | 'release' | 'release-group';
  entityId: string;
  category: string;
  topic: string;
  /** Wording selected for this generation; Full remains available to other consumers. */
  wording: string;
  fullWording: string;
  shortWording: string | null;
  provider: string;
  attribution: string;
  sourceUrl: string;
  relationshipKey: string | null;
  localTrackId: string;
}

export interface SleeveNoteSelectionCandidate extends ExtendedSleeveNote {
  sourceContent: string;
  evidence: string;
}

export interface SleeveNoteRecentUse {
  claimId: string;
  entityType: ExtendedSleeveNote['entityType'];
  entityId: string;
  topic: string;
  relationshipKey: string | null;
  suppliedAt: string;
  airedAt: string | null;
  releasedAt: string | null;
  detectionStatus: 'detected' | 'not-detected';
  qualityRejectionReason?: string | null;
}

export type ExtendedSleeveNoteAvailability = 'disabled' | 'unavailable' | 'available' | 'cooldown';

export interface ExtendedSleeveNoteInspection {
  status: ExtendedSleeveNoteAvailability;
  note: ExtendedSleeveNote | null;
  candidateCount: number;
}

const ENTITY_PRIORITY: Record<ExtendedSleeveNote['entityType'], number> = {
  recording: 0,
  release: 1,
  'release-group': 1,
  artist: 2,
};

const CATEGORY_PRIORITY: Record<string, number> = {
  'track-stories': 0,
  'release-stories': 1,
  'musical-connections': 2,
  recognition: 4,
  milestones: 5,
  'artist-stories': 6,
  credits: 7,
};

/** Unknown vocal timing remains eligible; only a known sub-two-second entry skips Sparks. */
export function extendedSleeveNoteAllowedForVocalRunway(firstVocalMs: number | null): boolean {
  return firstVocalMs == null
    || !Number.isFinite(firstVocalMs)
    || firstVocalMs < 0
    || firstVocalMs >= EXTENDED_SLEEVE_NOTE_MIN_VOCAL_RUNWAY_MS;
}

function relationshipKey(provider: string, sourceContent: string, evidence: string): string | null {
  if (provider !== 'genius') return null;
  try {
    const sourceId = (JSON.parse(sourceContent) as { identity?: { providerId?: unknown } })?.identity?.providerId;
    const targetId = (JSON.parse(evidence) as { target?: { providerId?: unknown } })?.target?.providerId;
    if (sourceId == null || targetId == null) return null;
    // Sorting makes an inverse relationship share the same local suppression
    // key, without sending raw Genius payloads to the prompt.
    return [`genius:${String(sourceId)}`, `genius:${String(targetId)}`].sort().join('|');
  } catch {
    return null;
  }
}

function eligibleProvider(provider: string): boolean {
  if (provider === 'wikipedia') return true;
  if (provider === 'genius') return settings.get().sleeveNotes.providers.genius.enabled === true;
  if (provider === 'musicbrainz-series') return true;
  return false;
}

function isRecent(iso: string, nowMs: number, cooldownMs: number): boolean {
  const at = Date.parse(iso);
  return Number.isFinite(at) && at > nowMs - cooldownMs;
}

function isNovel(candidate: SleeveNoteSelectionCandidate, uses: readonly SleeveNoteRecentUse[], nowMs: number): boolean {
  for (const use of uses) {
    const reservationActive = !use.airedAt && !use.releasedAt
      && isRecent(use.suppliedAt, nowMs, PENDING_RESERVATION_MS);
    // A link airing does not prove the DJ used its offered claim. Cool down
    // only when the spoken text had a clear claim signal and the clip aired.
    const claimAiredAt = use.detectionStatus === 'detected' ? use.airedAt : null;
    const creditRejectedAt = candidate.category === 'credits' && use.claimId === candidate.claimId
      && use.qualityRejectionReason ? use.airedAt : null;
    if (!reservationActive && !claimAiredAt && !creditRejectedAt) continue;
    const usedAt = reservationActive ? use.suppliedAt : claimAiredAt ?? creditRejectedAt!;
    const cooldownActive = (windowMs: number) => isRecent(usedAt, nowMs, windowMs);
    if (use.claimId === candidate.claimId && cooldownActive(EXACT_CLAIM_COOLDOWN_MS)) return false;
    if (use.entityType === candidate.entityType && use.entityId === candidate.entityId) {
      if (use.topic === candidate.topic && cooldownActive(TOPIC_COOLDOWN_MS)) return false;
      if (cooldownActive(ENTITY_COOLDOWN_MS[candidate.entityType])) return false;
    }
    if (candidate.relationshipKey && use.relationshipKey === candidate.relationshipKey
      && cooldownActive(RELATIONSHIP_COOLDOWN_MS)) return false;
  }
  return true;
}

function recentUsesForCandidates(
  db: Database.Database,
  candidates: readonly SleeveNoteSelectionCandidate[],
  nowMs: number,
): SleeveNoteRecentUse[] {
  const claimIds = [...new Set(candidates.map((candidate) => candidate.claimId))];
  const entities: Array<[string, string]> = [];
  const entityKeys = new Set<string>();
  for (const candidate of candidates) {
    const key = `${candidate.entityType}\u0000${candidate.entityId}`;
    if (entityKeys.has(key)) continue;
    entityKeys.add(key);
    entities.push([candidate.entityType, candidate.entityId]);
  }
  const relationshipKeys = [...new Set(candidates
    .map((candidate) => candidate.relationshipKey)
    .filter((key): key is string => !!key))];

  const relevantParts = [
    `claim_id IN (${claimIds.map(() => '?').join(', ')})`,
    ...entities.map(() => '(entity_type = ? AND entity_id = ?)'),
  ];
  const relevantParams: string[] = [...claimIds];
  for (const [entityType, entityId] of entities) relevantParams.push(entityType, entityId);
  if (relationshipKeys.length) {
    relevantParts.push(`relationship_key IN (${relationshipKeys.map(() => '?').join(', ')})`);
    relevantParams.push(...relationshipKeys);
  }

  const relevant = `(${relevantParts.join(' OR ')})`;
  const recentCutoff = new Date(nowMs - MAX_COOLDOWN_MS).toISOString();
  const reservationCutoff = new Date(nowMs - PENDING_RESERVATION_MS).toISOString();
  return db.prepare(`SELECT claim_id AS claimId, entity_type AS entityType,
      entity_id AS entityId, topic, relationship_key AS relationshipKey,
      supplied_at AS suppliedAt, aired_at AS airedAt, released_at AS releasedAt,
      detection_status AS detectionStatus,
      dj_quality_rejection_reason AS qualityRejectionReason
    FROM sleeve_claim_uses
    WHERE (aired_at >= ? AND ${relevant})
      OR (aired_at IS NULL AND released_at IS NULL AND supplied_at >= ? AND ${relevant})`)
    .all(recentCutoff, ...relevantParams, reservationCutoff, ...relevantParams) as SleeveNoteRecentUse[];
}

/** Prefer stories and connections; use credits when no stronger spark is eligible. */
export function selectMostSpecificEligibleClaim(
  candidates: readonly SleeveNoteSelectionCandidate[],
  uses: readonly SleeveNoteRecentUse[],
  nowMs = Date.now(),
): SleeveNoteSelectionCandidate | null {
  return [...candidates]
    .filter((candidate) => isNovel(candidate, uses, nowMs))
    .sort((a, b) => (ENTITY_PRIORITY[a.entityType] - ENTITY_PRIORITY[b.entityType])
      || Number(a.category === 'credits') - Number(b.category === 'credits')
      || ((CATEGORY_PRIORITY[a.category] ?? 99) - (CATEGORY_PRIORITY[b.category] ?? 99))
      || a.topic.localeCompare(b.topic)
      || a.claimId.localeCompare(b.claimId))[0] ?? null;
}

function exactMusicBrainzArtistId(db: Database.Database, artistName: unknown): string | null {
  const name = typeof artistName === 'string' ? artistName.trim() : '';
  if (!name) return null;
  // Only a unique exact canonical-name match is safe before the recording has
  // resolved. Compound credits, aliases and duplicate artist names stay misses.
  const matches = db.prepare(`SELECT id FROM sleeve_artists
    WHERE musicbrainz_id IS NOT NULL AND trim(name) = ? COLLATE NOCASE
    LIMIT 2`).all(name) as Array<{ id: string }>;
  return matches.length === 1 ? matches[0].id : null;
}

function loadCandidates(
  db: Database.Database,
  localTrackId: string,
  currentArtist: unknown,
): SleeveNoteSelectionCandidate[] {
  const matches = db.prepare(`SELECT a.recording_id AS recordingId, r.artist_id AS artistId,
      (SELECT rr.release_id FROM sleeve_recording_releases rr
        WHERE rr.recording_id = r.id AND rr.is_canonical_home = 1 LIMIT 1) AS releaseId,
      (SELECT release.musicbrainz_release_group_id
        FROM sleeve_recording_releases rr
        JOIN sleeve_releases release ON release.id = rr.release_id
        WHERE rr.recording_id = r.id AND rr.is_canonical_home = 1 LIMIT 1) AS releaseGroupId
    FROM sleeve_local_attachments a
    JOIN sleeve_recordings r ON r.id = a.recording_id
    WHERE a.local_track_id = ? AND a.match_state = 'matched' AND r.match_state = 'matched'
    LIMIT 1`).get(localTrackId) as {
      recordingId: string; artistId: string | null; releaseId: string | null; releaseGroupId: string | null;
    } | undefined;
  const recordingId = matches?.recordingId ?? null;
  const releaseId = matches?.releaseId ?? null;
  const releaseGroupId = matches?.releaseGroupId ?? null;
  const artistId = matches?.artistId ?? exactMusicBrainzArtistId(db, currentArtist);
  const rows = db.prepare(`SELECT c.id AS claimId, c.entity_type AS entityType,
      c.entity_id AS entityId, c.category, c.topic, c.wording,
      c.short_wording AS shortWording, c.evidence,
      s.provider, s.attribution, s.source_url AS sourceUrl, s.content AS sourceContent
    FROM sleeve_claims c
    JOIN sleeve_source_documents s ON s.id = c.source_document_id
    WHERE c.enabled = 1
      AND length(trim(c.wording)) > 0 AND length(trim(c.evidence)) > 0
      AND length(trim(s.source_url)) > 0
      AND (c.airtime_scope = 'general' OR (c.airtime_scope = 'matching-release-only'
        AND EXISTS (SELECT 1 FROM sleeve_local_attachments local
          WHERE local.local_track_id = ?
            AND lower(trim(local.release_title)) = lower(trim(c.matching_release_title))))
        OR (c.airtime_scope = 'matching-track-only' AND EXISTS (
          SELECT 1 FROM sleeve_local_attachments local
          WHERE local.local_track_id = ?
            AND lower(trim(local.title)) = lower(trim(c.matching_track_title)))))
      AND ((c.entity_type = 'recording' AND c.entity_id = ?)
        OR (? IS NOT NULL AND c.entity_type = 'release' AND c.entity_id = ?)
        OR (? IS NOT NULL AND c.entity_type = 'release-group' AND c.entity_id = ?
          AND s.provider <> 'musicbrainz-series')
        OR (? IS NOT NULL AND c.entity_type = 'artist' AND c.entity_id = ?)
        OR (? IS NULL AND EXISTS (
          SELECT 1 FROM sleeve_series_library_claims library_claim
          JOIN sleeve_musicbrainz_series_members member
            ON member.series_mbid = library_claim.series_mbid
            AND member.entity_mbid = library_claim.member_mbid
          WHERE library_claim.local_track_id = ? AND library_claim.claim_id = c.id
        )))
    ORDER BY c.updated_at DESC`)
    .all(localTrackId, localTrackId, recordingId, releaseId, releaseId, releaseGroupId, releaseGroupId, artistId, artistId,
      recordingId, localTrackId) as Array<{
      claimId: string; entityType: ExtendedSleeveNote['entityType']; entityId: string;
      category: string; topic: string; wording: string; shortWording: string; evidence: string;
      provider: string; attribution: string; sourceUrl: string; sourceContent: string;
    }>;

  const byClaim = new Map<string, SleeveNoteSelectionCandidate>();
  for (const row of rows) {
    if (!eligibleProvider(row.provider) || !(row.category in CATEGORY_PRIORITY)
      || (row.category === 'credits' && row.provider !== 'genius')) continue;
    const candidate: SleeveNoteSelectionCandidate = {
      claimId: row.claimId,
      entityType: row.entityType,
      entityId: row.entityId,
      category: row.category,
      topic: row.topic,
      wording: row.wording,
      fullWording: row.wording,
      shortWording: row.shortWording.trim() || null,
      provider: row.provider,
      attribution: row.attribution,
      sourceUrl: row.sourceUrl,
      sourceContent: row.sourceContent,
      evidence: row.evidence,
      relationshipKey: relationshipKey(row.provider, row.sourceContent, row.evidence),
      localTrackId,
    };
    byClaim.set(candidate.claimId, candidate);
  }
  return [...byClaim.values()];
}

/** Synchronous local lookup with the reason a note is or is not available. */
export function inspectExtendedSleeveNote(
  current: { id?: unknown; artist?: unknown } | null | undefined,
  nowMs = Date.now(),
  requireShortWording = false,
): ExtendedSleeveNoteInspection {
  if (settings.get().djBehaviour.extendedSleeveNotes !== true) {
    return { status: 'disabled', note: null, candidateCount: 0 };
  }
  const localTrackId = String(current?.id ?? '').trim();
  if (!localTrackId) return { status: 'unavailable', note: null, candidateCount: 0 };
  const db = open();
  const candidates = loadCandidates(db, localTrackId, current?.artist)
    .filter((candidate) => !requireShortWording || candidate.shortWording
      || candidate.provider !== 'genius' || candidate.entityType !== 'release-group');
  if (!candidates.length) return { status: 'unavailable', note: null, candidateCount: 0 };
  const latestUses = recentUsesForCandidates(db, candidates, nowMs);
  const selected = selectMostSpecificEligibleClaim(candidates, latestUses, nowMs);
  if (!selected) return { status: 'cooldown', note: null, candidateCount: candidates.length };
  const { sourceContent: _sourceContent, evidence: _evidence, ...publicNote } = selected;
  return { status: 'available', note: publicNote, candidateCount: candidates.length };
}

/** Synchronous local lookup; returns null when the feature is off or unmatched. */
export function selectExtendedSleeveNote(current: { id?: unknown; artist?: unknown } | null | undefined, nowMs = Date.now()): ExtendedSleeveNote | null {
  return inspectExtendedSleeveNote(current, nowMs).note;
}

/** Record the claim and rendered line supplied to the model for repetition control. */
export function recordExtendedSleeveNoteSupplied(
  note: ExtendedSleeveNote,
  finalText: string,
): string {
  const id = randomUUID();
  const db = open();
  const attachment = db.prepare(`SELECT artist, title FROM sleeve_local_attachments
    WHERE local_track_id = ?`).get(note.localTrackId) as {
      artist: string | null; title: string | null;
    } | undefined;
  const detectionStatus = extendedSleeveNoteHasClearTextSignal(
    finalText, note.wording, attachment?.artist, attachment?.title,
  ) ? 'detected' : 'not-detected';
  db.prepare(`INSERT INTO sleeve_claim_uses (
    id, claim_id, entity_type, entity_id, category, topic, relationship_key,
    local_track_id, consumer, supplied_at, final_text, offered_wording, detection_status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'generateLink', ?, ?, ?, ?)`)
    .run(id, note.claimId, note.entityType, note.entityId, note.category, note.topic,
      note.relationshipKey, note.localTrackId, new Date().toISOString(), finalText,
      note.wording, detectionStatus);
  return id;
}

/** Record the normalized text handed to a speech engine for this selected spark. */
export function recordExtendedSleeveNoteTtsRequest(useId: string, text: string): void {
  const db = open();
  const offered = db.prepare(`SELECT spark.offered_wording AS wording,
      attachment.artist AS trackArtist, attachment.title AS trackTitle
    FROM sleeve_claim_uses spark
    LEFT JOIN sleeve_local_attachments attachment ON attachment.local_track_id = spark.local_track_id
    WHERE spark.id = ?`).get(useId) as {
      wording: string; trackArtist: string | null; trackTitle: string | null;
    } | undefined;
  if (!offered) return;
  const detectionStatus = extendedSleeveNoteHasClearTextSignal(
    text, offered.wording, offered.trackArtist, offered.trackTitle,
  ) ? 'detected' : 'not-detected';
  db.prepare(`UPDATE sleeve_claim_uses
    SET tts_text = ?, tts_requested_at = COALESCE(tts_requested_at, ?), detection_status = ?
    WHERE id = ?`)
    .run(text, new Date().toISOString(), detectionStatus, useId);
}

/** Store an explicit DJ quality verdict until its link actually reaches air. */
export function markExtendedSleeveNoteQualityRejection(useId: string, reason: string): void {
  open().prepare(`UPDATE sleeve_claim_uses SET dj_quality_rejection_reason = ? WHERE id = ?`)
    .run(reason.trim().slice(0, 240), useId);
}

/** Record a moment-specific pass for diagnostics; it never counts as a quality rejection. */
export function markExtendedSleeveNoteContextPass(useId: string, reason: string): void {
  open().prepare(`UPDATE sleeve_claim_uses SET dj_context_pass_reason = ? WHERE id = ?`)
    .run(reason.trim().slice(0, 240), useId);
}

/** Mark the linked speech as aired only after Liquidsoap confirms its live edge. */
export function recordExtendedSleeveNoteAired(useId: string, airedAt: number): void {
  const db = open();
  db.prepare(`UPDATE sleeve_claim_uses
    SET aired_at = COALESCE(aired_at, ?), released_at = NULL
    WHERE id = ?`)
    .run(new Date(airedAt).toISOString(), useId);
  const rejection = db.prepare(`SELECT claim_id AS claimId,
    dj_quality_rejection_reason AS reason FROM sleeve_claim_uses WHERE id = ?`)
    .get(useId) as { claimId: string; reason: string | null } | undefined;
  if (rejection?.reason) recordLiveDjRejection(rejection.claimId, useId, rejection.reason);
}

/** Release a pending reservation while retaining its audit history. */
export function releaseExtendedSleeveNoteReservation(useId: string): void {
  open().prepare(`UPDATE sleeve_claim_uses
    SET released_at = COALESCE(released_at, ?)
    WHERE id = ? AND aired_at IS NULL`)
    .run(new Date().toISOString(), useId);
}
