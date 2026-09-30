// Local, bounded Sleeve Notes selection for the ordinary DJ link prompt.
// This module never calls a provider; an unavailable or unmatched store is a
// clean miss and leaves the regular Verified Facts packet untouched.
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import * as settings from '../settings.js';
import { open } from './db.js';

const EXACT_CLAIM_COOLDOWN_MS = 21 * 24 * 60 * 60 * 1000;
const TOPIC_COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000;
const RELATIONSHIP_COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000;
const ENTITY_COOLDOWN_MS = {
  recording: 21 * 24 * 60 * 60 * 1000,
  release: 45 * 24 * 60 * 60 * 1000,
  'release-group': 45 * 24 * 60 * 60 * 1000,
  artist: 90 * 24 * 60 * 60 * 1000,
} as const;

export interface ExtendedSleeveNote {
  claimId: string;
  entityType: 'artist' | 'recording' | 'release' | 'release-group';
  entityId: string;
  category: string;
  topic: string;
  wording: string;
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
  credits: 3,
  recognition: 4,
  milestones: 5,
  'artist-stories': 6,
};

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
    if (use.claimId === candidate.claimId && isRecent(use.suppliedAt, nowMs, EXACT_CLAIM_COOLDOWN_MS)) return false;
    if (use.entityType === candidate.entityType && use.entityId === candidate.entityId) {
      if (use.topic === candidate.topic && isRecent(use.suppliedAt, nowMs, TOPIC_COOLDOWN_MS)) return false;
      if (isRecent(use.suppliedAt, nowMs, ENTITY_COOLDOWN_MS[candidate.entityType])) return false;
    }
    if (candidate.relationshipKey && use.relationshipKey === candidate.relationshipKey
      && isRecent(use.suppliedAt, nowMs, RELATIONSHIP_COOLDOWN_MS)) return false;
  }
  return true;
}

/** Pure ordering seam: recording first, album/release group second, artist fallback. */
export function selectMostSpecificEligibleClaim(
  candidates: readonly SleeveNoteSelectionCandidate[],
  uses: readonly SleeveNoteRecentUse[],
  nowMs = Date.now(),
): SleeveNoteSelectionCandidate | null {
  return [...candidates]
    .filter((candidate) => isNovel(candidate, uses, nowMs))
    .sort((a, b) => (ENTITY_PRIORITY[a.entityType] - ENTITY_PRIORITY[b.entityType])
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
  if (!recordingId && !artistId) return [];

  const rows = db.prepare(`SELECT c.id AS claimId, c.entity_type AS entityType,
      c.entity_id AS entityId, c.category, c.topic, c.wording, c.evidence,
      s.provider, s.attribution, s.source_url AS sourceUrl, s.content AS sourceContent
    FROM sleeve_claims c
    JOIN sleeve_source_documents s ON s.id = c.source_document_id
    WHERE c.enabled = 1 AND length(trim(c.wording)) > 0 AND length(trim(c.evidence)) > 0
      AND length(trim(s.source_url)) > 0
      AND ((c.entity_type = 'recording' AND c.entity_id = ?)
        OR (? IS NOT NULL AND c.entity_type = 'release' AND c.entity_id = ?)
        OR (? IS NOT NULL AND c.entity_type = 'release-group' AND c.entity_id = ?)
        OR (? IS NOT NULL AND c.entity_type = 'artist' AND c.entity_id = ?))
    ORDER BY c.updated_at DESC`)
    .all(recordingId, releaseId, releaseId, releaseGroupId, releaseGroupId, artistId, artistId) as Array<{
      claimId: string; entityType: ExtendedSleeveNote['entityType']; entityId: string;
      category: string; topic: string; wording: string; evidence: string;
      provider: string; attribution: string; sourceUrl: string; sourceContent: string;
    }>;

  const byClaim = new Map<string, SleeveNoteSelectionCandidate>();
  for (const row of rows) {
    if (!eligibleProvider(row.provider) || !(row.category in CATEGORY_PRIORITY)) continue;
    const candidate: SleeveNoteSelectionCandidate = {
      claimId: row.claimId,
      entityType: row.entityType,
      entityId: row.entityId,
      category: row.category,
      topic: row.topic,
      wording: row.wording,
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
export function inspectExtendedSleeveNote(current: { id?: unknown; artist?: unknown } | null | undefined, nowMs = Date.now()): ExtendedSleeveNoteInspection {
  if (settings.get().djBehaviour.extendedSleeveNotes !== true) {
    return { status: 'disabled', note: null, candidateCount: 0 };
  }
  const localTrackId = String(current?.id ?? '').trim();
  if (!localTrackId) return { status: 'unavailable', note: null, candidateCount: 0 };
  const db = open();
  const candidates = loadCandidates(db, localTrackId, current?.artist);
  if (!candidates.length) return { status: 'unavailable', note: null, candidateCount: 0 };
  const latestUses = db.prepare(`SELECT claim_id AS claimId, entity_type AS entityType,
      entity_id AS entityId, topic, relationship_key AS relationshipKey, supplied_at AS suppliedAt
    FROM sleeve_claim_uses
    WHERE supplied_at >= ?
    ORDER BY supplied_at DESC LIMIT 500`)
    .all(new Date(nowMs - 180 * 24 * 60 * 60 * 1000).toISOString()) as SleeveNoteRecentUse[];
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
export function recordExtendedSleeveNoteSupplied(note: ExtendedSleeveNote, finalText: string): void {
  open().prepare(`INSERT INTO sleeve_claim_uses (
    id, claim_id, entity_type, entity_id, category, topic, relationship_key,
    local_track_id, consumer, supplied_at, final_text
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'generateLink', ?, ?)`)
    .run(randomUUID(), note.claimId, note.entityType, note.entityId, note.category, note.topic,
      note.relationshipKey, note.localTrackId, new Date().toISOString(), finalText);
}
