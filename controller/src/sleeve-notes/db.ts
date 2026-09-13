// Sleeve Notes owns a small sidecar database. It never writes to Navidrome or
// to the existing library index: provider knowledge has a separate lifecycle.
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { STATE_DIR } from '../config.js';

export const DB_PATH = `${STATE_DIR}/sleeve-notes.db`;

let db: Database.Database | null = null;

export function open(): Database.Database {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  migrate(db);
  return db;
}

export function close(): void {
  if (!db) return;
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch {}
  db.close();
  db = null;
}

export function migrate(d: Database.Database): void {
  const version = (d.pragma('user_version', { simple: true }) as number) || 0;
  if (version < 1) {
    d.exec(`
    CREATE TABLE entities (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('artist', 'release', 'track', 'external')),
      local_id TEXT,
      title TEXT NOT NULL,
      artist TEXT,
      release_title TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_sleeve_entities_local ON entities(kind, local_id);

    CREATE TABLE provider_identities (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL REFERENCES entities(id),
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      match_confidence REAL,
      resolution_state TEXT NOT NULL CHECK (resolution_state IN ('unresolved', 'confident', 'ambiguous', 'unavailable', 'no-match')),
      retrieved_at TEXT NOT NULL,
      UNIQUE(provider, provider_id)
    );

    CREATE TABLE claims (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL REFERENCES entities(id),
      provider_identity_id TEXT NOT NULL REFERENCES provider_identities(id),
      claim_type TEXT NOT NULL,
      wording TEXT NOT NULL,
      classification TEXT NOT NULL,
      fresh_until TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      corrected_wording TEXT,
      suppressed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_sleeve_claims_entity ON claims(entity_id, enabled);

    CREATE TABLE evidence (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL REFERENCES claims(id),
      provider TEXT NOT NULL,
      source_url TEXT NOT NULL,
      attribution TEXT NOT NULL,
      excerpt TEXT,
      structured_json TEXT,
      retrieved_at TEXT NOT NULL
    );

    CREATE TABLE relationships (
      id TEXT PRIMARY KEY,
      from_entity_id TEXT NOT NULL REFERENCES entities(id),
      to_entity_id TEXT NOT NULL REFERENCES entities(id),
      provider_identity_id TEXT NOT NULL REFERENCES provider_identities(id),
      relationship_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(from_entity_id, to_entity_id, provider_identity_id, relationship_type)
    );

    CREATE TABLE provider_coverage (
      provider TEXT NOT NULL,
      entity_id TEXT NOT NULL REFERENCES entities(id),
      state TEXT NOT NULL CHECK (state IN ('unknown', 'queued', 'fetching', 'ready', 'no-match', 'retry-at', 'stale')),
      checked_at TEXT,
      retry_at TEXT,
      PRIMARY KEY(provider, entity_id)
    );

    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      entity_id TEXT NOT NULL REFERENCES entities(id),
      kind TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'retry-at', 'complete', 'failed', 'cancelled')),
      priority INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      run_after TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(provider, entity_id, kind)
    );

    CREATE TABLE uses (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL REFERENCES claims(id),
      consumer TEXT NOT NULL,
      track_id TEXT,
      aired_at TEXT,
      final_text TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_sleeve_uses_claim ON uses(claim_id, created_at DESC);
    `);
    d.pragma('user_version = 1');
  }
  if (version < 2) {
    // A provider song can legitimately resolve to several local copies (for
    // example an original release and a compilation).  Keep that mapping out
    // of provider_identities, which is deliberately one row per provider ID.
    d.exec(`
      CREATE TABLE provider_local_matches (
        provider_identity_id TEXT NOT NULL REFERENCES provider_identities(id),
        local_track_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('confident', 'ambiguous')),
        matched_at TEXT NOT NULL,
        PRIMARY KEY(provider_identity_id, local_track_id)
      );
      CREATE INDEX idx_sleeve_provider_local_matches_track
        ON provider_local_matches(local_track_id);
    `);
    d.pragma('user_version = 2');
  }
}

export function schemaVersion(): number {
  return (open().pragma('user_version', { simple: true }) as number) || 0;
}
