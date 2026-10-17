import { randomUUID } from 'node:crypto';
import { open } from './db.js';
import type { ProviderIdentity, SleeveEntityInput, SleeveProviderResult } from './provider.js';

export interface StoredEntity {
  id: string;
  kind: SleeveEntityInput['kind'];
  localId: string | null;
  title: string;
  artist: string | null;
  releaseTitle: string | null;
}

export function upsertEntity(input: SleeveEntityInput): StoredEntity {
  const db = open();
  const now = new Date().toISOString();
  const existing = input.localId
    ? db.prepare('SELECT * FROM entities WHERE kind = ? AND local_id = ?').get(input.kind, input.localId) as StoredEntity | undefined
    : undefined;
  if (existing) {
    db.prepare(`UPDATE entities SET title = ?, artist = ?, release_title = ?, updated_at = ? WHERE id = ?`)
      .run(input.title, input.artist ?? null, input.releaseTitle ?? null, now, existing.id);
    return { ...existing, title: input.title, artist: input.artist ?? null, releaseTitle: input.releaseTitle ?? null };
  }
  const entity: StoredEntity = {
    id: randomUUID(), kind: input.kind, localId: input.localId ?? null,
    title: input.title, artist: input.artist ?? null, releaseTitle: input.releaseTitle ?? null,
  };
  db.prepare(`INSERT INTO entities (id, kind, local_id, title, artist, release_title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(entity.id, entity.kind, entity.localId, entity.title, entity.artist, entity.releaseTitle, now, now);
  return entity;
}

export function coverageFor(provider: string, entityId: string): { state: string; checkedAt: string | null; retryAt: string | null } | null {
  const row = open().prepare(`SELECT state, checked_at AS checkedAt, retry_at AS retryAt
    FROM provider_coverage WHERE provider = ? AND entity_id = ?`).get(provider, entityId) as { state: string; checkedAt: string | null; retryAt: string | null } | undefined;
  return row ?? null;
}

export function entityFor(id: string): StoredEntity | null {
  const row = open().prepare(`SELECT id, kind, local_id AS localId, title, artist, release_title AS releaseTitle
    FROM entities WHERE id = ?`).get(id) as StoredEntity | undefined;
  return row ?? null;
}

export interface SleeveJob {
  id: string;
  provider: string;
  entityId: string;
  kind: 'fetch' | 'resolve';
  state: 'queued' | 'running' | 'retry-at' | 'complete' | 'failed' | 'cancelled';
  priority: number;
  attempts: number;
  runAfter: string | null;
  depth: 0 | 1;
  rootEntityId: string | null;
}

/** Insert a durable candidate once. Re-admission can only raise its priority. */
export function enqueueJob(input: { provider: string; entityId: string; kind: SleeveJob['kind']; priority?: number; depth?: 0 | 1; rootEntityId?: string }): SleeveJob {
  const db = open();
  const now = new Date().toISOString();
  const priority = input.priority ?? 0;
  db.prepare(`INSERT INTO jobs (id, provider, entity_id, kind, state, priority, attempts, depth, root_entity_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'queued', ?, 0, ?, ?, ?, ?)
    ON CONFLICT(provider, entity_id, kind) DO UPDATE SET
      priority = MAX(jobs.priority, excluded.priority),
      state = CASE WHEN jobs.state IN ('complete', 'failed', 'cancelled') THEN jobs.state ELSE jobs.state END,
      updated_at = excluded.updated_at`)
    .run(randomUUID(), input.provider, input.entityId, input.kind, priority, input.depth ?? 0, input.rootEntityId ?? input.entityId, now, now);
  db.prepare(`INSERT INTO provider_coverage (provider, entity_id, state)
    VALUES (?, ?, 'queued') ON CONFLICT(provider, entity_id) DO NOTHING`)
    .run(input.provider, input.entityId);
  return db.prepare(`SELECT id, provider, entity_id AS entityId, kind, state, priority, attempts,
    run_after AS runAfter, depth, root_entity_id AS rootEntityId FROM jobs WHERE provider = ? AND entity_id = ? AND kind = ?`)
    .get(input.provider, input.entityId, input.kind) as SleeveJob;
}

export function nextDueJob(provider: string, now = new Date().toISOString()): SleeveJob | null {
  const db = open();
  const job = db.prepare(`SELECT id, provider, entity_id AS entityId, kind, state, priority, attempts,
      run_after AS runAfter, depth, root_entity_id AS rootEntityId FROM jobs
    WHERE provider = ? AND state IN ('queued', 'retry-at')
      AND (run_after IS NULL OR run_after <= ?)
    ORDER BY priority DESC, created_at ASC LIMIT 1`).get(provider, now) as SleeveJob | undefined;
  return job ?? null;
}

export function recordDiscovery(input: { entityId: string; rootEntityId: string; origin: 'station' | 'relationship'; depth: 0 | 1 }): void {
  open().prepare(`INSERT INTO discoveries (entity_id, root_entity_id, origin, depth, discovered_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(entity_id, root_entity_id, origin) DO UPDATE SET discovered_at = excluded.discovered_at`)
    .run(input.entityId, input.rootEntityId, input.origin, input.depth, new Date().toISOString());
}

export function markJobRunning(id: string): void {
  const now = new Date().toISOString();
  open().prepare(`UPDATE jobs SET state = 'running', attempts = attempts + 1, updated_at = ? WHERE id = ?`)
    .run(now, id);
}

export function finishJob(id: string, entityId: string, provider: string, state: 'ready' | 'no-match'): void {
  const now = new Date().toISOString();
  const db = open();
  db.prepare(`UPDATE jobs SET state = 'complete', updated_at = ? WHERE id = ?`).run(now, id);
  db.prepare(`INSERT INTO provider_coverage (provider, entity_id, state, checked_at, retry_at)
    VALUES (?, ?, ?, ?, NULL)
    ON CONFLICT(provider, entity_id) DO UPDATE SET state = excluded.state, checked_at = excluded.checked_at, retry_at = NULL`)
    .run(provider, entityId, state, now);
}

export function retryJob(id: string, entityId: string, provider: string, attempts: number, delayMs: number): void {
  const now = new Date();
  const retryAt = new Date(now.getTime() + delayMs).toISOString();
  const db = open();
  db.prepare(`UPDATE jobs SET state = 'retry-at', run_after = ?, updated_at = ? WHERE id = ?`)
    .run(retryAt, now.toISOString(), id);
  db.prepare(`INSERT INTO provider_coverage (provider, entity_id, state, retry_at)
    VALUES (?, ?, 'retry-at', ?)
    ON CONFLICT(provider, entity_id) DO UPDATE SET state = 'retry-at', retry_at = excluded.retry_at`)
    .run(provider, entityId, retryAt);
}

export function sourceCounts(provider: string): Record<string, number> {
  const rows = open().prepare(`SELECT state, COUNT(*) AS count FROM provider_coverage WHERE provider = ? GROUP BY state`)
    .all(provider) as Array<{ state: string; count: number }>;
  return Object.fromEntries(rows.map((row) => [row.state, row.count]));
}

export interface SleeveNotesReadout {
  entities: Array<{
    id: string; kind: string; title: string; artist: string | null; releaseTitle: string | null;
    local: boolean; providerId: string | null; resolutionState: string | null;
    coverage: string | null; discoveredAt: string | null; relationships: number;
  }>;
  relationships: Array<{
    id: string; type: string; fromTitle: string; fromArtist: string | null;
    toTitle: string; toArtist: string | null; createdAt: string;
  }>;
  jobs: Array<{
    id: string; kind: string; state: string; priority: number; attempts: number;
    depth: number; title: string; artist: string | null; updatedAt: string;
  }>;
}

/** Small admin-only projection for observing collection while Phase 2 beds in. */
export function databaseReadout(provider: string, limit = 80): SleeveNotesReadout {
  const db = open();
  const capped = Math.max(1, Math.min(limit, 200));
  const entities = db.prepare(`SELECT e.id, e.kind, e.title, e.artist AS artist, e.release_title AS releaseTitle,
      e.local_id IS NOT NULL AS local, p.provider_id AS providerId, p.resolution_state AS resolutionState,
      c.state AS coverage, MAX(d.discovered_at) AS discoveredAt, COUNT(DISTINCT r.id) AS relationships
    FROM entities e
    LEFT JOIN provider_identities p ON p.entity_id = e.id AND p.provider = ?
    LEFT JOIN provider_coverage c ON c.entity_id = e.id AND c.provider = ?
    LEFT JOIN discoveries d ON d.entity_id = e.id
    LEFT JOIN relationships r ON r.from_entity_id = e.id OR r.to_entity_id = e.id
    GROUP BY e.id
    ORDER BY discoveredAt DESC NULLS LAST, e.updated_at DESC
    LIMIT ?`).all(provider, provider, capped) as SleeveNotesReadout['entities'];
  const relationships = db.prepare(`SELECT r.id, r.relationship_type AS type,
      source.title AS fromTitle, source.artist AS fromArtist,
      target.title AS toTitle, target.artist AS toArtist, r.created_at AS createdAt
    FROM relationships r
    JOIN entities source ON source.id = r.from_entity_id
    JOIN entities target ON target.id = r.to_entity_id
    JOIN provider_identities p ON p.id = r.provider_identity_id
    WHERE p.provider = ?
    ORDER BY r.created_at DESC LIMIT ?`).all(provider, capped) as SleeveNotesReadout['relationships'];
  const jobs = db.prepare(`SELECT j.id, j.kind, j.state, j.priority, j.attempts, j.depth,
      e.title, e.artist AS artist, j.updated_at AS updatedAt
    FROM jobs j JOIN entities e ON e.id = j.entity_id
    WHERE j.provider = ? ORDER BY j.updated_at DESC LIMIT ?`).all(provider, capped) as SleeveNotesReadout['jobs'];
  return { entities, relationships, jobs };
}

export interface StoredProviderIdentity {
  id: string;
  entityId: string;
  provider: string;
  providerId: string;
}

export function upsertProviderIdentity(input: { entityId: string; provider: string; identity: ProviderIdentity; resolutionState?: string }): StoredProviderIdentity {
  const db = open();
  const existing = db.prepare(`SELECT id, entity_id AS entityId, provider, provider_id AS providerId
    FROM provider_identities WHERE provider = ? AND provider_id = ?`).get(input.provider, input.identity.providerId) as StoredProviderIdentity | undefined;
  const now = new Date().toISOString();
  if (existing) {
    // A relationship target is initially an external-only entity.  If that
    // same Genius song is later played by the station, make the local track
    // canonical and carry its already-collected graph across to it.
    if (existing.entityId !== input.entityId && canPromoteExternalEntity(db, existing.entityId, input.entityId)) {
      mergeExternalEntityInDatabase(db, existing.entityId, input.entityId);
    }
    db.prepare(`UPDATE provider_identities SET entity_id = ?, canonical_url = ?, retrieved_at = ?,
      resolution_state = ? WHERE id = ?`).run(input.entityId, input.identity.canonicalUrl, now, input.resolutionState ?? 'unresolved', existing.id);
    return { ...existing, entityId: input.entityId };
  }
  const stored = { id: randomUUID(), entityId: input.entityId, provider: input.provider, providerId: input.identity.providerId };
  db.prepare(`INSERT INTO provider_identities (id, entity_id, provider, provider_id, canonical_url, resolution_state, retrieved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(stored.id, stored.entityId, stored.provider, stored.providerId, input.identity.canonicalUrl, input.resolutionState ?? 'unresolved', now);
  return stored;
}

function canPromoteExternalEntity(db: ReturnType<typeof open>, externalEntityId: string, localEntityId: string): boolean {
  const rows = db.prepare(`SELECT id, kind, local_id AS localId FROM entities WHERE id IN (?, ?)`)
    .all(externalEntityId, localEntityId) as Array<{ id: string; kind: string; localId: string | null }>;
  const external = rows.find((row) => row.id === externalEntityId);
  const local = rows.find((row) => row.id === localEntityId);
  return external?.kind === 'external' && local?.kind === 'track' && !!local.localId;
}

/** Move relationship-derived knowledge onto the first directly encountered local track. */
export function mergeExternalEntityInDatabase(db: ReturnType<typeof open>, externalEntityId: string, localEntityId: string): void {
  const relationshipRows = db.prepare(`SELECT provider_identity_id AS providerIdentityId, relationship_type AS relationshipType,
      from_entity_id AS fromEntityId, to_entity_id AS toEntityId, created_at AS createdAt
    FROM relationships WHERE from_entity_id = ? OR to_entity_id = ?`).all(externalEntityId, externalEntityId) as Array<{
      providerIdentityId: string; relationshipType: string; fromEntityId: string; toEntityId: string; createdAt: string;
    }>;
  const discoveryRows = db.prepare(`SELECT root_entity_id AS rootEntityId, origin, depth, discovered_at AS discoveredAt
    FROM discoveries WHERE entity_id = ? OR root_entity_id = ?`).all(externalEntityId, externalEntityId) as Array<{
      rootEntityId: string; origin: 'station' | 'relationship'; depth: 0 | 1; discoveredAt: string;
    }>;

  for (const row of relationshipRows) {
    const fromEntityId = row.fromEntityId === externalEntityId ? localEntityId : row.fromEntityId;
    const toEntityId = row.toEntityId === externalEntityId ? localEntityId : row.toEntityId;
    if (fromEntityId === toEntityId) continue;
    db.prepare(`INSERT INTO relationships (id, from_entity_id, to_entity_id, provider_identity_id, relationship_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(from_entity_id, to_entity_id, provider_identity_id, relationship_type) DO NOTHING`)
      .run(randomUUID(), fromEntityId, toEntityId, row.providerIdentityId, row.relationshipType, row.createdAt);
  }
  db.prepare(`DELETE FROM relationships WHERE from_entity_id = ? OR to_entity_id = ?`).run(externalEntityId, externalEntityId);

  for (const row of discoveryRows) {
    const rootEntityId = row.rootEntityId === externalEntityId ? localEntityId : row.rootEntityId;
    db.prepare(`INSERT INTO discoveries (entity_id, root_entity_id, origin, depth, discovered_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(entity_id, root_entity_id, origin) DO UPDATE SET
        discovered_at = MAX(discoveries.discovered_at, excluded.discovered_at)`)
      .run(localEntityId, rootEntityId, row.origin, row.depth, row.discoveredAt);
  }
  db.prepare(`DELETE FROM discoveries WHERE entity_id = ? OR root_entity_id = ?`).run(externalEntityId, externalEntityId);

  db.prepare(`UPDATE claims SET entity_id = ? WHERE entity_id = ?`).run(localEntityId, externalEntityId);

  db.prepare(`INSERT OR IGNORE INTO provider_coverage (provider, entity_id, state, checked_at, retry_at)
    SELECT provider, ?, state, checked_at, retry_at FROM provider_coverage WHERE entity_id = ?`)
    .run(localEntityId, externalEntityId);
  db.prepare(`DELETE FROM provider_coverage WHERE entity_id = ?`).run(externalEntityId);
  db.prepare(`DELETE FROM jobs WHERE entity_id = ?`).run(externalEntityId);
  db.prepare(`UPDATE jobs SET root_entity_id = ? WHERE root_entity_id = ?`).run(localEntityId, externalEntityId);
  db.prepare(`UPDATE provider_identities SET entity_id = ? WHERE entity_id = ?`).run(localEntityId, externalEntityId);
  db.prepare(`DELETE FROM entities WHERE id = ?`).run(externalEntityId);
}

export function retainRelationship(input: { fromEntityId: string; toEntityId: string; providerIdentityId: string; type: string }): void {
  open().prepare(`INSERT INTO relationships (id, from_entity_id, to_entity_id, provider_identity_id, relationship_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(from_entity_id, to_entity_id, provider_identity_id, relationship_type) DO NOTHING`)
    .run(randomUUID(), input.fromEntityId, input.toEntityId, input.providerIdentityId, input.type, new Date().toISOString());
}

export function retainLocalMatches(providerIdentityId: string, trackIds: string[], state: 'confident' | 'ambiguous'): void {
  const db = open();
  const stmt = db.prepare(`INSERT INTO provider_local_matches (provider_identity_id, local_track_id, state, matched_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(provider_identity_id, local_track_id) DO UPDATE SET state = excluded.state, matched_at = excluded.matched_at`);
  const now = new Date().toISOString();
  const insert = db.transaction(() => trackIds.forEach((trackId) => stmt.run(providerIdentityId, trackId, state, now)));
  insert();
}

/** Persist a narrow, source-scoped projection. This accepts no raw payload. */
export function retainProviderResult(entityId: string, provider: string, result: SleeveProviderResult, options: { includeRelationships?: boolean } = {}): string[] {
  const db = open();
  const now = new Date().toISOString();
  const targets: string[] = [];
  const save = db.transaction(() => {
    const sourceEntity = entityFor(entityId);
    const identity = upsertProviderIdentity({
      entityId, provider, identity: result.identity,
      resolutionState: sourceEntity?.kind === 'track' && !!sourceEntity.localId ? 'confident' : 'unresolved',
    });
    for (const credit of result.credits) {
      const wording = `${credit.role === 'Producer' ? 'Produced by' : 'Written by'} ${credit.names.join(', ')}`;
      const claimId = randomUUID();
      db.prepare(`INSERT INTO claims (id, entity_id, provider_identity_id, claim_type, wording, classification, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'structured-credit', ?, ?)`)
        .run(claimId, entityId, identity.id, credit.role.toLowerCase(), wording, now, now);
      db.prepare(`INSERT INTO evidence (id, claim_id, provider, source_url, attribution, structured_json, retrieved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(randomUUID(), claimId, provider, result.identity.canonicalUrl, result.attribution,
          JSON.stringify({ role: credit.role, names: credit.names }), result.retrievedAt);
    }
    for (const relationship of options.includeRelationships === false ? [] : result.relationships) {
      const knownTarget = entityForProviderIdentity(provider, relationship.target.providerId);
      const target = knownTarget ?? upsertEntity({ kind: 'external', title: relationship.target.title, artist: relationship.target.artist });
      // Provider IDs are unique across the source, so this makes external-only
      // relation targets stable until background Navidrome resolution runs.
      upsertProviderIdentity({ entityId: target.id, provider, identity: relationship.target });
      retainRelationship({ fromEntityId: entityId, toEntityId: target.id, providerIdentityId: identity.id, type: relationship.type });
      targets.push(target.id);
    }
    finishCoverageInTransaction(db, provider, entityId, now);
  });
  save();
  return [...new Set(targets)];
}

function entityForProviderIdentity(provider: string, providerId: string): StoredEntity | null {
  const row = open().prepare(`SELECT e.id, e.kind, e.local_id AS localId, e.title, e.artist, e.release_title AS releaseTitle
    FROM provider_identities p JOIN entities e ON e.id = p.entity_id
    WHERE p.provider = ? AND p.provider_id = ?`).get(provider, providerId) as StoredEntity | undefined;
  return row ?? null;
}

export function identityForEntity(provider: string, entityId: string): StoredProviderIdentity | null {
  const row = open().prepare(`SELECT id, entity_id AS entityId, provider, provider_id AS providerId
    FROM provider_identities WHERE provider = ? AND entity_id = ? LIMIT 1`).get(provider, entityId) as StoredProviderIdentity | undefined;
  return row ?? null;
}

export function setResolutionState(providerIdentityId: string, state: 'confident' | 'ambiguous' | 'unavailable'): void {
  open().prepare(`UPDATE provider_identities SET resolution_state = ? WHERE id = ?`).run(state, providerIdentityId);
}

/**
 * Apply only the live-ID map confirmed by the Navidrome reconcile walk.
 *
 * This is intentionally a consumer of PR #1255's `trackMap`, not an attempt
 * to reproduce Navidrome's canonical-ID transform.  The map has already been
 * validated against the freshly-walked Navidrome catalogue, so deleted tracks
 * remain untouched and no guessed local match can be made playable.
 */
export function remapLocalTrackIds(trackMap: ReadonlyMap<string, string>): { entities: number; matches: number; uses: number } {
  return remapLocalTrackIdsInDatabase(open(), trackMap);
}

export function remapLocalTrackIdsInDatabase(db: ReturnType<typeof open>, trackMap: ReadonlyMap<string, string>): { entities: number; matches: number; uses: number } {
  let entities = 0;
  let matches = 0;
  let uses = 0;
  const updateEntity = db.prepare(`UPDATE entities SET local_id = ?, updated_at = ? WHERE kind = 'track' AND local_id = ?`);
  // A post-upgrade background resolve may already have found the canonical
  // local id. Merge that duplicate rather than letting the composite key turn
  // the otherwise-safe rotation into a failed transaction.
  const removeDuplicateMatch = db.prepare(`DELETE FROM provider_local_matches
    WHERE local_track_id = ? AND provider_identity_id IN
      (SELECT provider_identity_id FROM provider_local_matches WHERE local_track_id = ?)`);
  const updateMatch = db.prepare(`UPDATE provider_local_matches SET local_track_id = ? WHERE local_track_id = ?`);
  const updateUse = db.prepare(`UPDATE uses SET track_id = ? WHERE track_id = ?`);
  db.transaction(() => {
    for (const [oldId, newId] of trackMap) {
      if (!oldId || !newId || oldId === newId) continue;
      entities += updateEntity.run(newId, new Date().toISOString(), oldId).changes;
      removeDuplicateMatch.run(newId, oldId);
      matches += updateMatch.run(newId, oldId).changes;
      uses += updateUse.run(newId, oldId).changes;
    }
  })();
  return { entities, matches, uses };
}

function finishCoverageInTransaction(db: ReturnType<typeof open>, provider: string, entityId: string, now: string): void {
  db.prepare(`UPDATE jobs SET state = 'complete', updated_at = ? WHERE provider = ? AND entity_id = ? AND kind = 'fetch'`)
    .run(now, provider, entityId);
  db.prepare(`INSERT INTO provider_coverage (provider, entity_id, state, checked_at, retry_at)
    VALUES (?, ?, 'ready', ?, NULL)
    ON CONFLICT(provider, entity_id) DO UPDATE SET state = 'ready', checked_at = excluded.checked_at, retry_at = NULL`)
    .run(provider, entityId, now);
}
