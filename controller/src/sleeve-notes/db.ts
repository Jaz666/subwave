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
  if (version < 3) {
    // A directly queued/played record already has a Navidrome track ID. Its
    // provider identity is a confident local attachment, not a relationship
    // target waiting for a background Navidrome search.
    d.exec(`UPDATE provider_identities
      SET resolution_state = 'confident'
      WHERE entity_id IN (
        SELECT id FROM entities WHERE kind = 'track' AND local_id IS NOT NULL
      )`);
    d.pragma('user_version = 3');
  }
  if (version < 4) {
    // Discovery is distinct from identity: one song can be encountered by the
    // station and also discovered from several relationship roots.
    d.exec(`
      CREATE TABLE discoveries (
        entity_id TEXT NOT NULL REFERENCES entities(id),
        root_entity_id TEXT NOT NULL REFERENCES entities(id),
        origin TEXT NOT NULL CHECK (origin IN ('station', 'relationship')),
        depth INTEGER NOT NULL CHECK (depth IN (0, 1)),
        discovered_at TEXT NOT NULL,
        PRIMARY KEY(entity_id, root_entity_id, origin)
      );
      CREATE INDEX idx_sleeve_discoveries_root ON discoveries(root_entity_id, depth);
      ALTER TABLE jobs ADD COLUMN depth INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE jobs ADD COLUMN root_entity_id TEXT REFERENCES entities(id);
    `);
    d.pragma('user_version = 4');
  }
  if (version < 5) {
    // The first Genius-only experiment was deliberately track-centric.  Its
    // identity and claim rows cannot be safely reinterpreted as canonical
    // artist/recording/release knowledge, so start the replacement store
    // empty rather than carrying an apparently-valid but misleading history.
    d.exec(`
      -- Delete dependent experiment rows before their parents. Existing
      -- stations enable SQLite foreign keys, so deleting provider identities
      -- before claims would leave the replacement schema half-created.
      DELETE FROM uses;
      DELETE FROM evidence;
      DELETE FROM relationships;
      DELETE FROM provider_local_matches;
      DELETE FROM claims;
      DELETE FROM provider_coverage;
      DELETE FROM discoveries;
      DELETE FROM jobs;
      DELETE FROM provider_identities;
      DELETE FROM entities;

      CREATE TABLE sleeve_artists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_name TEXT,
        musicbrainz_id TEXT UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sleeve_recordings (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        artist_id TEXT REFERENCES sleeve_artists(id),
        musicbrainz_id TEXT UNIQUE,
        match_state TEXT NOT NULL CHECK (match_state IN ('unmatched', 'ambiguous', 'matched')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_sleeve_recordings_artist ON sleeve_recordings(artist_id);

      CREATE TABLE sleeve_releases (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        musicbrainz_release_id TEXT UNIQUE,
        musicbrainz_release_group_id TEXT,
        primary_type TEXT,
        status TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sleeve_recording_releases (
        recording_id TEXT NOT NULL REFERENCES sleeve_recordings(id),
        release_id TEXT NOT NULL REFERENCES sleeve_releases(id),
        release_date TEXT,
        country TEXT,
        artist_credit TEXT,
        is_compilation INTEGER NOT NULL DEFAULT 0,
        is_first_official_non_compilation INTEGER NOT NULL DEFAULT 0,
        is_canonical_home INTEGER NOT NULL DEFAULT 0,
        selection_reason TEXT,
        PRIMARY KEY(recording_id, release_id)
      );
      CREATE INDEX idx_sleeve_recording_releases_recording ON sleeve_recording_releases(recording_id, release_date);

      CREATE TABLE sleeve_local_attachments (
        local_track_id TEXT PRIMARY KEY,
        recording_id TEXT REFERENCES sleeve_recordings(id),
        title TEXT NOT NULL,
        artist TEXT,
        release_title TEXT,
        musicbrainz_recording_id TEXT,
        match_state TEXT NOT NULL CHECK (match_state IN ('unmatched', 'ambiguous', 'matched')),
        first_encountered_at TEXT NOT NULL,
        last_encountered_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_sleeve_local_attachments_recording ON sleeve_local_attachments(recording_id);

      CREATE TABLE sleeve_encounters (
        id TEXT PRIMARY KEY,
        local_track_id TEXT NOT NULL REFERENCES sleeve_local_attachments(local_track_id),
        source TEXT NOT NULL CHECK (source IN ('queue', 'played')),
        encountered_at TEXT NOT NULL,
        UNIQUE(local_track_id, source, encountered_at)
      );
      CREATE INDEX idx_sleeve_encounters_recent ON sleeve_encounters(encountered_at DESC);

      CREATE TABLE sleeve_research_jobs (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        subject_type TEXT NOT NULL CHECK (subject_type IN ('local-track', 'artist', 'recording', 'release')),
        subject_id TEXT NOT NULL,
        capability TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'retry-at', 'complete', 'failed', 'cancelled')),
        priority INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        run_after TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(provider, subject_type, subject_id, capability)
      );
      CREATE INDEX idx_sleeve_research_jobs_due ON sleeve_research_jobs(provider, state, run_after, priority DESC);

      CREATE TABLE sleeve_provider_requests (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        capability TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        completed_at TEXT,
        outcome TEXT NOT NULL CHECK (outcome IN ('started', 'ready', 'no-match', 'failed', 'rate-limited')),
        status_code INTEGER
      );
      CREATE INDEX idx_sleeve_provider_requests_provider_time ON sleeve_provider_requests(provider, requested_at);

      CREATE TABLE sleeve_source_documents (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('artist', 'recording', 'release')),
        entity_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        source_url TEXT NOT NULL,
        revision_id TEXT,
        content_hash TEXT NOT NULL,
        content_kind TEXT NOT NULL CHECK (content_kind IN ('bounded-text', 'structured-json')),
        content TEXT NOT NULL,
        attribution TEXT NOT NULL,
        retrieved_at TEXT NOT NULL,
        UNIQUE(provider, source_url, revision_id, content_hash)
      );

      CREATE TABLE sleeve_claims (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('artist', 'recording', 'release')),
        entity_id TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('artist-stories', 'track-stories', 'musical-connections', 'milestones', 'credits')),
        topic TEXT NOT NULL,
        wording TEXT NOT NULL,
        source_document_id TEXT NOT NULL REFERENCES sleeve_source_documents(id),
        evidence TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(entity_type, entity_id, category, topic, source_document_id)
      );
      CREATE INDEX idx_sleeve_claims_selection ON sleeve_claims(entity_type, entity_id, category, enabled);
    `);
    d.pragma('user_version = 5');
  }
}

export function schemaVersion(): number {
  return (open().pragma('user_version', { simple: true }) as number) || 0;
}
