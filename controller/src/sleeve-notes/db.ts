// Sleeve Notes owns a small sidecar database. It never writes to Navidrome or
// to the existing library index: provider knowledge has a separate lifecycle.
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, copyFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { dirname } from 'node:path';
import { STATE_DIR } from '../config.js';

export const DB_PATH = `${STATE_DIR}/sleeve-notes.db`;
export const SCHEMA_VERSION = 53;

let db: Database.Database | null = null;
const cachedReads = new AsyncLocalStorage<Database.Database>();

/** Run synchronous cache reads without creating or migrating the station DB. */
export function withCachedRead<T>(read: () => T, path = DB_PATH): T {
  const saved = existsSync(path) ? new Database(path, { readonly: true, fileMustExist: true }) : new Database(':memory:');
  // An absent cache gets an empty ephemeral schema, never a file on disk.
  if (saved.memory) migrate(saved);
  try { return cachedReads.run(saved, read); } finally { saved.close(); }
}

export function open(): Database.Database {
  const cached = cachedReads.getStore();
  if (cached) return cached;
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

let activeResearchWork=0;
let restoringResearch=false;
/** A restore must not replace a database beneath an awaited research job. */
export async function runResearchDatabaseWork(run:()=>Promise<boolean>):Promise<boolean> {
  if(restoringResearch)return false;
  activeResearchWork++;
  try{return await run();}finally{activeResearchWork--;}
}
export function acquireResearchRestore():(()=>void)|null {
  if(restoringResearch||activeResearchWork)return null;
  restoringResearch=true;
  return ()=>{restoringResearch=false;};
}

/** SQLite's online snapshot includes pages still held in the WAL. */
export async function backup(path: string): Promise<void> {
  if(restoringResearch)throw new Error('Sleeve Notes restore is in progress');
  activeResearchWork++;
  const shared=db;
  let source:Database.Database|null=null;
  try {
    // A disabled feature may have an older cached schema. Export is a snapshot,
    // not permission to migrate that cache or create a new one.
    source=shared??new Database(DB_PATH,{readonly:true,fileMustExist:true});
    await source.backup(path);
  } finally {if(!shared)source?.close();activeResearchWork--;}
}

/** Validate and migrate an extracted copy before any station state is changed. */
export function prepareBackupRestore(path: string): void {
  const candidate = new Database(path, { fileMustExist: true });
  try {
    const version = Number(candidate.pragma('user_version', { simple: true }));
    if (version < 1 || version > SCHEMA_VERSION
      || !candidate.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='entities'").get()) {
      throw new Error('Unsupported Sleeve Notes database');
    }
    if (candidate.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Corrupt Sleeve Notes database');
    migrate(candidate);
    candidate.prepare('SELECT id, wording, source_document_id FROM sleeve_claims LIMIT 0').all();
    candidate.prepare('SELECT claim_id, aired_at FROM sleeve_claim_uses LIMIT 0').all();
    candidate.prepare('SELECT use_id FROM sleeve_spark_feedback LIMIT 0').all();
    candidate.prepare('SELECT segment_id FROM sleeve_segment_lines LIMIT 0').all();
    if (candidate.pragma('foreign_key_check').length) throw new Error('Sleeve Notes database has broken references');
    candidate.prepare("UPDATE sleeve_research_jobs SET state='queued', run_after=NULL WHERE state='running'").run();
    candidate.pragma('wal_checkpoint(TRUNCATE)');
    candidate.pragma('journal_mode = DELETE');
  } finally { candidate.close(); }
}

/** Publish a prepared snapshot without yielding between close, swap and reopen. */
export function restorePreparedBackup(path: string): void {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const staged = `${DB_PATH}.${randomUUID()}.restore`;
  try {
    copyFileSync(path, staged);
    close();
    renameSync(staged, DB_PATH);
    rmSync(`${DB_PATH}-wal`, { force: true });
    rmSync(`${DB_PATH}-shm`, { force: true });
    open();
  } finally { rmSync(staged, { force: true }); }
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
  if (version < 6) {
    // Link-time selection records what the writer was actually supplied so
    // later links can avoid repeating the same claim, topic, entity, or
    // relationship. This is deliberately separate from the retired v1 uses
    // table, whose foreign key targets the experimental claims table.
    d.exec(`
      CREATE TABLE sleeve_claim_uses (
        id TEXT PRIMARY KEY,
        claim_id TEXT NOT NULL REFERENCES sleeve_claims(id),
        entity_type TEXT NOT NULL CHECK (entity_type IN ('artist', 'recording', 'release')),
        entity_id TEXT NOT NULL,
        category TEXT NOT NULL,
        topic TEXT NOT NULL,
        relationship_key TEXT,
        local_track_id TEXT,
        consumer TEXT NOT NULL DEFAULT 'generateLink',
        supplied_at TEXT NOT NULL,
        final_text TEXT,
        aired_at TEXT
      );
      CREATE INDEX idx_sleeve_claim_uses_claim ON sleeve_claim_uses(claim_id, supplied_at DESC);
      CREATE INDEX idx_sleeve_claim_uses_topic ON sleeve_claim_uses(entity_type, entity_id, topic, supplied_at DESC);
      CREATE INDEX idx_sleeve_claim_uses_entity ON sleeve_claim_uses(entity_type, entity_id, supplied_at DESC);
      CREATE INDEX idx_sleeve_claim_uses_relationship ON sleeve_claim_uses(relationship_key, supplied_at DESC);
    `);
    d.pragma('user_version = 6');
  }
  if (version < 7) {
    // Recognition is a first-class note category. Rebuild the claims table so
    // the category CHECK remains strict, while preserving the existing claim
    // IDs referenced by the supplied-note history table.
    const foreignKeysWereEnabled = Boolean(d.pragma('foreign_keys', { simple: true }));
    d.pragma('foreign_keys = OFF');
    try {
      d.transaction(() => {
        d.exec(`
          CREATE TABLE sleeve_claims_v7 (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL CHECK (entity_type IN ('artist', 'recording', 'release')),
            entity_id TEXT NOT NULL,
            category TEXT NOT NULL CHECK (category IN ('artist-stories', 'track-stories', 'musical-connections', 'milestones', 'credits', 'recognition')),
            topic TEXT NOT NULL,
            wording TEXT NOT NULL,
            source_document_id TEXT NOT NULL REFERENCES sleeve_source_documents(id),
            evidence TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(entity_type, entity_id, category, topic, source_document_id)
          );
          INSERT INTO sleeve_claims_v7 (
            id, entity_type, entity_id, category, topic, wording,
            source_document_id, evidence, enabled, created_at, updated_at
          ) SELECT
            id, entity_type, entity_id, category, topic, wording,
            source_document_id, evidence, enabled, created_at, updated_at
          FROM sleeve_claims;
          DROP TABLE sleeve_claims;
          ALTER TABLE sleeve_claims_v7 RENAME TO sleeve_claims;
          CREATE INDEX idx_sleeve_claims_selection
            ON sleeve_claims(entity_type, entity_id, category, enabled);

          CREATE TABLE sleeve_musicbrainz_series (
            series_mbid TEXT PRIMARY KEY,
            series_name TEXT NOT NULL,
            entity_type TEXT NOT NULL CHECK (entity_type IN ('recording', 'release-group')),
            ranked INTEGER NOT NULL DEFAULT 0 CHECK (ranked IN (0, 1)),
            series_order INTEGER NOT NULL,
            edition_group TEXT,
            edition_year INTEGER,
            fetched_at TEXT,
            next_refresh_at TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            updated_at TEXT NOT NULL
          );
          CREATE INDEX idx_sleeve_mb_series_refresh
            ON sleeve_musicbrainz_series(next_refresh_at, series_order);

          CREATE TABLE sleeve_musicbrainz_series_members (
            series_mbid TEXT NOT NULL REFERENCES sleeve_musicbrainz_series(series_mbid) ON DELETE CASCADE,
            entity_mbid TEXT NOT NULL,
            entity_title TEXT NOT NULL,
            rank_value TEXT,
            PRIMARY KEY(series_mbid, entity_mbid)
          );
          CREATE INDEX idx_sleeve_mb_series_members_entity
            ON sleeve_musicbrainz_series_members(entity_mbid, series_mbid);
        `);
        d.pragma('user_version = 7');
      }).immediate();
    } finally {
      if (foreignKeysWereEnabled) d.pragma('foreign_keys = ON');
    }
  }
  if (version < 8) {
    // Album stories belong to the release group, across all its editions.
    // Extend the strict entity/category checks and scope source uniqueness to
    // the entity so one Wikipedia page can be retained for each linked entity.
    const foreignKeysWereEnabled = Boolean(d.pragma('foreign_keys', { simple: true }));
    d.pragma('foreign_keys = OFF');
    try {
      d.transaction(() => {
        d.exec(`
          CREATE TABLE sleeve_source_documents_v8 (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL CHECK (entity_type IN ('artist', 'recording', 'release', 'release-group')),
            entity_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            source_url TEXT NOT NULL,
            revision_id TEXT,
            content_hash TEXT NOT NULL,
            content_kind TEXT NOT NULL CHECK (content_kind IN ('bounded-text', 'structured-json')),
            content TEXT NOT NULL,
            attribution TEXT NOT NULL,
            retrieved_at TEXT NOT NULL,
            UNIQUE(provider, entity_type, entity_id, source_url, revision_id, content_hash)
          );
          INSERT INTO sleeve_source_documents_v8 (
            id, entity_type, entity_id, provider, source_url, revision_id,
            content_hash, content_kind, content, attribution, retrieved_at
          ) SELECT
            id, entity_type, entity_id, provider, source_url, revision_id,
            content_hash, content_kind, content, attribution, retrieved_at
          FROM sleeve_source_documents;

          CREATE TABLE sleeve_claims_v8 (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL CHECK (entity_type IN ('artist', 'recording', 'release', 'release-group')),
            entity_id TEXT NOT NULL,
            category TEXT NOT NULL CHECK (category IN ('artist-stories', 'release-stories', 'track-stories', 'musical-connections', 'milestones', 'credits', 'recognition')),
            topic TEXT NOT NULL,
            wording TEXT NOT NULL,
            source_document_id TEXT NOT NULL REFERENCES sleeve_source_documents_v8(id),
            evidence TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(entity_type, entity_id, category, topic, source_document_id)
          );
          INSERT INTO sleeve_claims_v8 (
            id, entity_type, entity_id, category, topic, wording,
            source_document_id, evidence, enabled, created_at, updated_at
          ) SELECT
            id, entity_type, entity_id, category, topic, wording,
            source_document_id, evidence, enabled, created_at, updated_at
          FROM sleeve_claims;

          CREATE TABLE sleeve_claim_uses_v8 (
            id TEXT PRIMARY KEY,
            claim_id TEXT NOT NULL REFERENCES sleeve_claims_v8(id),
            entity_type TEXT NOT NULL CHECK (entity_type IN ('artist', 'recording', 'release', 'release-group')),
            entity_id TEXT NOT NULL,
            category TEXT NOT NULL,
            topic TEXT NOT NULL,
            relationship_key TEXT,
            local_track_id TEXT,
            consumer TEXT NOT NULL DEFAULT 'generateLink',
            supplied_at TEXT NOT NULL,
            final_text TEXT,
            aired_at TEXT
          );
          INSERT INTO sleeve_claim_uses_v8 (
            id, claim_id, entity_type, entity_id, category, topic,
            relationship_key, local_track_id, consumer, supplied_at, final_text, aired_at
          ) SELECT
            id, claim_id, entity_type, entity_id, category, topic,
            relationship_key, local_track_id, consumer, supplied_at, final_text, aired_at
          FROM sleeve_claim_uses;

          DROP TABLE sleeve_claim_uses;
          DROP TABLE sleeve_claims;
          DROP TABLE sleeve_source_documents;
          ALTER TABLE sleeve_source_documents_v8 RENAME TO sleeve_source_documents;
          ALTER TABLE sleeve_claims_v8 RENAME TO sleeve_claims;
          ALTER TABLE sleeve_claim_uses_v8 RENAME TO sleeve_claim_uses;

          CREATE INDEX idx_sleeve_source_entity_provider
            ON sleeve_source_documents(entity_type, entity_id, provider, retrieved_at DESC);
          CREATE INDEX idx_sleeve_claims_selection
            ON sleeve_claims(entity_type, entity_id, category, enabled);
          CREATE INDEX idx_sleeve_claim_uses_claim
            ON sleeve_claim_uses(claim_id, supplied_at DESC);
          CREATE INDEX idx_sleeve_claim_uses_topic
            ON sleeve_claim_uses(entity_type, entity_id, topic, supplied_at DESC);
          CREATE INDEX idx_sleeve_claim_uses_entity
            ON sleeve_claim_uses(entity_type, entity_id, supplied_at DESC);
          CREATE INDEX idx_sleeve_claim_uses_relationship
            ON sleeve_claim_uses(relationship_key, supplied_at DESC);
        `);
        d.pragma('user_version = 8');
      }).immediate();
    } finally {
      if (foreignKeysWereEnabled) d.pragma('foreign_keys = ON');
    }
  }
  if (version < 9) {
    // The first release-group Series parser read a hyphenated JSON key, but
    // MusicBrainz returns `release_group`. Requeue cached empty album lists so
    // the corrected parser can populate them promptly after this upgrade.
    d.transaction(() => {
      d.exec(`UPDATE sleeve_musicbrainz_series
        SET next_refresh_at = '1970-01-01T00:00:00.000Z'
        WHERE entity_type = 'release-group'
          AND fetched_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM sleeve_musicbrainz_series_members member
            WHERE member.series_mbid = sleeve_musicbrainz_series.series_mbid
          )`);
      d.pragma('user_version = 9');
    }).immediate();
  }
  if (version < 10) {
    // Keep the exact spark wording that was offered alongside the speech text
    // eventually handed to TTS. This gives the Overview an honest playback
    // history even if a claim is later corrected or the queued link is trimmed.
    d.exec(`
      ALTER TABLE sleeve_claim_uses ADD COLUMN offered_wording TEXT NOT NULL DEFAULT '';
      ALTER TABLE sleeve_claim_uses ADD COLUMN detection_status TEXT NOT NULL DEFAULT 'not-detected'
        CHECK (detection_status IN ('detected', 'not-detected'));
      ALTER TABLE sleeve_claim_uses ADD COLUMN tts_text TEXT;
      ALTER TABLE sleeve_claim_uses ADD COLUMN tts_requested_at TEXT;
      CREATE INDEX idx_sleeve_claim_uses_tts
        ON sleeve_claim_uses(tts_requested_at DESC);
    `);
    d.pragma('user_version = 10');
  }
  if (version < 11) {
    // A generated link holds a short selection reservation until it airs or is
    // discarded. Only a confirmed aired claim begins the ordinary cooldown.
    d.exec(`ALTER TABLE sleeve_claim_uses ADD COLUMN released_at TEXT;`);
    d.pragma('user_version = 11');
  }
  if (version < 12) {
    // Wikipedia research stores a complete Full form plus compact semantic
    // anchors for a short-runway link. Non-Wikipedia claims retain an empty
    // value and continue to use their existing wording.
    d.exec("ALTER TABLE sleeve_claims ADD COLUMN short_wording TEXT NOT NULL DEFAULT ''");
    d.pragma('user_version = 12');
  }
  if (version < 13) {
    // The first Genius album pilot accepted only description.plain. Albums
    // with a visible description_preview could finish without a source. Retry
    // those at most once after broadening the parser, using the same budget.
    d.prepare(`UPDATE sleeve_research_jobs SET state = 'queued', run_after = NULL,
      updated_at = ? WHERE provider = 'genius' AND subject_type = 'release'
        AND capability = 'album-biography' AND state = 'complete'
        AND NOT EXISTS (SELECT 1 FROM sleeve_source_documents source
          WHERE source.provider = 'genius' AND source.entity_type = 'release-group'
            AND source.entity_id = sleeve_research_jobs.subject_id)`)
      .run(new Date().toISOString());
    d.pragma('user_version = 13');
  }
  if (version < 14) {
    // Album biographies are carried by Genius's description_annotation body,
    // which the first two pilot parsers missed. Revisit completed empty jobs
    // once after teaching the collector to read that API field.
    d.prepare(`UPDATE sleeve_research_jobs SET state = 'queued', run_after = NULL,
      updated_at = ? WHERE provider = 'genius' AND subject_type = 'release'
        AND capability = 'album-biography' AND state = 'complete'
        AND NOT EXISTS (SELECT 1 FROM sleeve_source_documents source
          WHERE source.provider = 'genius' AND source.entity_type = 'release-group'
            AND source.entity_id = sleeve_research_jobs.subject_id)`)
      .run(new Date().toISOString());
    d.pragma('user_version = 14');
  }
  if (version < 15) {
    // Retry only the completed Genius album extraction jobs after improving
    // their source-specific prompts. Their stored biographies are reused, so
    // this does not spend another Genius API request or remove existing claims.
    d.prepare(`UPDATE sleeve_research_jobs SET state = 'queued', run_after = NULL,
      updated_at = ? WHERE provider = 'researcher' AND subject_type = 'release'
        AND capability = 'extract-genius-album' AND state = 'complete'
        AND EXISTS (SELECT 1 FROM sleeve_source_documents source
          WHERE source.provider = 'genius' AND source.entity_type = 'release-group'
            AND source.entity_id = sleeve_research_jobs.subject_id)`)
      .run(new Date().toISOString());
    d.pragma('user_version = 15');
  }
  if (version < 16) {
    // Re-evaluate the bounded Genius album pilot with its story-only source
    // passages. This reuses saved biographies and leaves existing claims in
    // place; it does not queue any additional Genius API fetches.
    d.prepare(`UPDATE sleeve_research_jobs SET state = 'queued', run_after = NULL,
      updated_at = ? WHERE provider = 'researcher' AND subject_type = 'release'
        AND capability = 'extract-genius-album' AND state = 'complete'
        AND EXISTS (SELECT 1 FROM sleeve_source_documents source
          WHERE source.provider = 'genius' AND source.entity_type = 'release-group'
            AND source.entity_id = sleeve_research_jobs.subject_id)`)
      .run(new Date().toISOString());
    d.pragma('user_version = 16');
  }
  if (version < 17) {
    // Restore album identity and title-origin passages after the over-broad
    // pilot filter, then retry saved biographies without another API fetch.
    d.prepare(`UPDATE sleeve_research_jobs SET state = 'queued', run_after = NULL,
      updated_at = ? WHERE provider = 'researcher' AND subject_type = 'release'
        AND capability = 'extract-genius-album' AND state = 'complete'
        AND EXISTS (SELECT 1 FROM sleeve_source_documents source
          WHERE source.provider = 'genius' AND source.entity_type = 'release-group'
            AND source.entity_id = sleeve_research_jobs.subject_id)`)
      .run(new Date().toISOString());
    d.pragma('user_version = 17');
  }
  if (version < 18) {
    // The source-first album pilot has been previewed against saved Genius
    // biographies. Retry completed extraction jobs once without refetching
    // Genius or replacing any retained claim.
    d.prepare(`UPDATE sleeve_research_jobs SET state = 'queued', run_after = NULL,
      updated_at = ? WHERE provider = 'researcher' AND subject_type = 'release'
        AND capability = 'extract-genius-album' AND state = 'complete'
        AND EXISTS (SELECT 1 FROM sleeve_source_documents source
          WHERE source.provider = 'genius' AND source.entity_type = 'release-group'
            AND source.entity_id = sleeve_research_jobs.subject_id)`)
      .run(new Date().toISOString());
    d.pragma('user_version = 18');
  }
  if (version < 19) {
    d.transaction(() => {
      d.exec(`
        ALTER TABLE sleeve_claims ADD COLUMN operator_state TEXT NOT NULL DEFAULT 'auto'
          CHECK (operator_state IN ('auto', 'approved', 'deleted'));
        CREATE TABLE sleeve_moderation_candidates (
          id TEXT PRIMARY KEY,
          source_document_id TEXT NOT NULL REFERENCES sleeve_source_documents(id),
          fingerprint TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          category TEXT NOT NULL,
          topic TEXT NOT NULL,
          wording TEXT NOT NULL,
          short_wording TEXT NOT NULL DEFAULT '',
          evidence TEXT NOT NULL,
          original_json TEXT NOT NULL,
          rejection_reason TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'approved', 'deleted', 'retained')),
          claim_id TEXT REFERENCES sleeve_claims(id),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          reviewed_at TEXT,
          reviewed_by TEXT,
          UNIQUE(source_document_id, fingerprint)
        );
        CREATE INDEX idx_sleeve_moderation_queue
          ON sleeve_moderation_candidates(status, updated_at DESC);
        CREATE TABLE sleeve_moderation_history (
          id TEXT PRIMARY KEY,
          candidate_id TEXT NOT NULL REFERENCES sleeve_moderation_candidates(id),
          action TEXT NOT NULL,
          actor TEXT NOT NULL,
          detail_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE sleeve_claim_suppressions (
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          category TEXT NOT NULL,
          topic TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY(entity_type, entity_id, category, topic)
        );
        CREATE TABLE sleeve_claim_history (
          id TEXT PRIMARY KEY,
          claim_id TEXT NOT NULL REFERENCES sleeve_claims(id),
          action TEXT NOT NULL,
          actor TEXT NOT NULL,
          before_json TEXT NOT NULL,
          after_json TEXT,
          created_at TEXT NOT NULL
        );
      `);
      d.pragma('user_version = 19');
    }).immediate();
  }
  if (version < 20) {
    d.exec(`
      CREATE TABLE sleeve_series_library_scan (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        album_offset INTEGER NOT NULL DEFAULT 0,
        next_scan_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE sleeve_series_library_claims (
        local_track_id TEXT NOT NULL,
        local_album_id TEXT NOT NULL,
        claim_id TEXT NOT NULL REFERENCES sleeve_claims(id),
        series_mbid TEXT NOT NULL,
        member_mbid TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (local_track_id, claim_id)
      );
      CREATE INDEX idx_sleeve_series_library_claims_album
        ON sleeve_series_library_claims(local_album_id);
      CREATE TABLE sleeve_series_release_groups (
        release_mbid TEXT PRIMARY KEY,
        release_group_mbid TEXT,
        checked_at TEXT NOT NULL
      );
    `);
    d.pragma('user_version = 20');
  }
  if (version < 21) {
    d.exec(`
      ALTER TABLE sleeve_claims ADD COLUMN airtime_scope TEXT NOT NULL DEFAULT 'general'
        CHECK (airtime_scope IN ('general', 'matching-release-only', 'matching-track-only'));
      ALTER TABLE sleeve_claims ADD COLUMN matching_release_title TEXT;
      ALTER TABLE sleeve_claims ADD COLUMN matching_track_title TEXT;
      ALTER TABLE sleeve_claim_uses ADD COLUMN dj_quality_rejection_reason TEXT;
      ALTER TABLE sleeve_claim_uses ADD COLUMN dj_context_pass_reason TEXT;
      ALTER TABLE sleeve_moderation_candidates ADD COLUMN bin_entered_at TEXT;
      ALTER TABLE sleeve_moderation_candidates ADD COLUMN rejection_origin TEXT NOT NULL DEFAULT 'legacy';
      ALTER TABLE sleeve_moderation_candidates ADD COLUMN reason_detail TEXT NOT NULL DEFAULT '';
      ALTER TABLE sleeve_moderation_candidates ADD COLUMN dj_rejection_count INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE sleeve_expired_candidate_fingerprints (
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        expired_at TEXT NOT NULL,
        PRIMARY KEY (entity_type, entity_id, fingerprint)
      );
      CREATE TABLE sleeve_dj_quality_rejections (
        claim_id TEXT NOT NULL REFERENCES sleeve_claims(id),
        opportunity_id TEXT NOT NULL REFERENCES sleeve_claim_uses(id),
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (claim_id, opportunity_id)
      );
      UPDATE sleeve_moderation_candidates SET bin_entered_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE status = 'pending';
      CREATE INDEX idx_sleeve_moderation_bin_expiry
        ON sleeve_moderation_candidates(status, bin_entered_at);
    `);
    d.pragma('user_version = 21');
  }
  if (version < 22) {
    d.exec(`
      CREATE TABLE sleeve_research_progress (
        job_id TEXT PRIMARY KEY REFERENCES sleeve_research_jobs(id) ON DELETE CASCADE,
        source_document_id TEXT NOT NULL,
        next_section INTEGER NOT NULL DEFAULT 0,
        accepted_sections_json TEXT NOT NULL DEFAULT '[]',
        rejected_json TEXT NOT NULL DEFAULT '[]',
        pending_candidates_json TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE sleeve_research_pacing (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        next_pair_at TEXT NOT NULL
      );
    `);
    d.pragma('user_version = 22');
  }
  if (version < 23) {
    d.exec(`ALTER TABLE sleeve_research_jobs ADD COLUMN origin_local_track_id TEXT;`);
    d.pragma('user_version = 23');
  }
  if (version < 24) {
    d.exec(`
      ALTER TABLE sleeve_research_progress ADD COLUMN candidate_sections_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE sleeve_research_progress ADD COLUMN check_cursor INTEGER NOT NULL DEFAULT 0;
    `);
    d.pragma('user_version = 24');
  }
  if (version < 25) {
    d.exec(`ALTER TABLE sleeve_research_progress ADD COLUMN ranked_claim_ids_json TEXT;`);
    d.pragma('user_version = 25');
  }
  if (version < 26) {
    d.exec(`
      ALTER TABLE sleeve_research_progress ADD COLUMN plays_consumed INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sleeve_research_jobs ADD COLUMN completed_at TEXT;
      UPDATE sleeve_research_jobs SET completed_at = updated_at WHERE state = 'complete';
      CREATE INDEX idx_sleeve_encounters_played_track
        ON sleeve_encounters(source, local_track_id, encountered_at);
      CREATE INDEX idx_sleeve_releases_group
        ON sleeve_releases(musicbrainz_release_group_id);
    `);
    d.pragma('user_version = 26');
  }
  if (version < 27) {
    d.exec(`
      CREATE TABLE sleeve_wikipedia_scan_progress (
        job_id TEXT PRIMARY KEY REFERENCES sleeve_research_jobs(id) ON DELETE CASCADE,
        source_document_id TEXT NOT NULL REFERENCES sleeve_source_documents(id),
        source_format_version INTEGER NOT NULL DEFAULT 2,
        chunk_count INTEGER NOT NULL,
        next_chunk INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE sleeve_wikipedia_scan_chunks (
        job_id TEXT NOT NULL REFERENCES sleeve_research_jobs(id) ON DELETE CASCADE,
        source_document_id TEXT NOT NULL REFERENCES sleeve_source_documents(id),
        chunk_index INTEGER NOT NULL,
        section_path TEXT NOT NULL,
        input_hash TEXT NOT NULL,
        raw_response TEXT NOT NULL,
        items_json TEXT NOT NULL DEFAULT '[]',
        elapsed_ms INTEGER NOT NULL,
        parsed_count INTEGER NOT NULL,
        retained_count INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(job_id, source_document_id, chunk_index)
      );
      CREATE INDEX idx_sleeve_wikipedia_scan_chunks_job
        ON sleeve_wikipedia_scan_chunks(job_id, source_document_id, chunk_index);
    `);
    d.pragma('user_version = 27');
  }
  if (version < 28) {
    d.exec(`
      CREATE TABLE sleeve_wikipedia_rescan_requests (
        job_id TEXT PRIMARY KEY REFERENCES sleeve_research_jobs(id) ON DELETE CASCADE,
        encounter_count_at_request INTEGER NOT NULL,
        requested_at TEXT NOT NULL
      );
      CREATE TABLE sleeve_wikipedia_scan_history (
        job_id TEXT NOT NULL,
        source_document_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        section_path TEXT NOT NULL,
        input_hash TEXT NOT NULL,
        raw_response TEXT NOT NULL,
        items_json TEXT NOT NULL,
        elapsed_ms INTEGER NOT NULL,
        parsed_count INTEGER NOT NULL,
        retained_count INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        archived_at TEXT NOT NULL
      );
      CREATE INDEX idx_sleeve_wikipedia_scan_history_job
        ON sleeve_wikipedia_scan_history(job_id, archived_at, chunk_index);
    `);
    d.pragma('user_version = 28');
  }
  if (version < 29) {
    d.exec(`
      ALTER TABLE sleeve_wikipedia_rescan_requests
        ADD COLUMN refresh_mode TEXT NOT NULL DEFAULT 'replace'
        CHECK (refresh_mode IN ('clear', 'replace'));
      ALTER TABLE sleeve_wikipedia_scan_chunks
        ADD COLUMN accepted_candidates_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE sleeve_research_jobs ADD COLUMN wikipedia_refresh_mode TEXT;
    `);
    d.pragma('user_version = 29');
  }
  if (version < 30) {
    d.exec(`
      ALTER TABLE sleeve_wikipedia_scan_progress
        ADD COLUMN chunk_characters INTEGER NOT NULL DEFAULT 20000;
      ALTER TABLE sleeve_wikipedia_scan_chunks
        ADD COLUMN input_characters INTEGER NOT NULL DEFAULT 0;
    `);
    d.pragma('user_version = 30');
  }
  if (version < 31) {
    d.exec(`ALTER TABLE sleeve_wikipedia_scan_progress ADD COLUMN prompt_hash TEXT NOT NULL DEFAULT '';`);
    d.pragma('user_version = 31');
  }
  if (version < 32) {
    d.exec(`
      CREATE TABLE sleeve_wikipedia_chunk_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        source_document_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        input_characters INTEGER NOT NULL,
        elapsed_ms INTEGER NOT NULL,
        profile_hash TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('success', 'deadline', 'quiet', 'error')),
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_sleeve_wikipedia_chunk_attempts_recent
        ON sleeve_wikipedia_chunk_attempts(created_at DESC);
    `);
    d.pragma('user_version = 32');
  }
  if (version < 33) {
    d.exec(`ALTER TABLE sleeve_research_pacing ADD COLUMN last_pair_at TEXT;
      ALTER TABLE sleeve_research_pacing ADD COLUMN pair_interval_ms INTEGER NOT NULL DEFAULT 120000;`);
    d.pragma('user_version = 33');
  }
  if (version < 34) {
    d.exec(`ALTER TABLE sleeve_wikipedia_chunk_attempts ADD COLUMN input_tokens INTEGER;`);
    d.pragma('user_version = 34');
  }
  if (version < 35) {
    d.exec(`ALTER TABLE sleeve_wikipedia_chunk_attempts ADD COLUMN output_tokens INTEGER;
      ALTER TABLE sleeve_wikipedia_chunk_attempts ADD COLUMN target_characters INTEGER;`);
    d.pragma('user_version = 35');
  }
  if (version < 36) {
    d.exec(`ALTER TABLE sleeve_research_pacing
      ADD COLUMN empty_station_interval_ms INTEGER NOT NULL DEFAULT 60000;`);
    d.pragma('user_version = 36');
  }
  if (version < 37) {
    d.exec(`CREATE TABLE sleeve_wikipedia_refresh_plan (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      requested_at TEXT NOT NULL
    );`);
    d.pragma('user_version = 37');
  }
  if (version < 38) {
    d.exec(`ALTER TABLE sleeve_research_jobs ADD COLUMN wikipedia_refreshed_at TEXT;`);
    d.pragma('user_version = 38');
  }
  if (version < 39) {
    d.exec(`
      ALTER TABLE sleeve_claims ADD COLUMN extraction_rank INTEGER;
      ALTER TABLE sleeve_claims ADD COLUMN extraction_section INTEGER;
      CREATE INDEX idx_sleeve_wikipedia_chunks_source ON sleeve_wikipedia_scan_chunks(source_document_id);
      UPDATE sleeve_claims SET extraction_rank = (
        SELECT CAST(item.key AS INTEGER) + 1 FROM sleeve_wikipedia_scan_chunks chunk,
          json_each(CASE WHEN json_valid(chunk.items_json) THEN chunk.items_json ELSE '[]' END) item
        WHERE chunk.source_document_id = sleeve_claims.source_document_id
          AND json_extract(CASE WHEN json_valid(item.value) THEN item.value ELSE '{}' END, '$.wording') = sleeve_claims.wording
        ORDER BY chunk.created_at DESC, chunk.chunk_index LIMIT 1
      ), extraction_section = (
        SELECT chunk.chunk_index + 1 FROM sleeve_wikipedia_scan_chunks chunk,
          json_each(CASE WHEN json_valid(chunk.items_json) THEN chunk.items_json ELSE '[]' END) item
        WHERE chunk.source_document_id = sleeve_claims.source_document_id
          AND json_extract(CASE WHEN json_valid(item.value) THEN item.value ELSE '{}' END, '$.wording') = sleeve_claims.wording
        ORDER BY chunk.created_at DESC, chunk.chunk_index LIMIT 1
      ) WHERE source_document_id IN (
        SELECT id FROM sleeve_source_documents WHERE provider = 'wikipedia'
      );
    `);
    d.pragma('user_version = 39');
  }
  if (version < 40) {
    d.exec(`
      CREATE TABLE sleeve_connection_library_tracks (
        local_track_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT,
        musicbrainz_recording_id TEXT,
        title_key TEXT NOT NULL,
        artist_key TEXT NOT NULL,
        scan_generation TEXT NOT NULL
      );
      CREATE INDEX idx_sleeve_connection_library_identity
        ON sleeve_connection_library_tracks(title_key, artist_key);
      CREATE TABLE sleeve_connection_library_scan (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        generation TEXT NOT NULL,
        album_offset INTEGER NOT NULL DEFAULT 0,
        run_after TEXT,
        completed_at TEXT
      );
      CREATE TABLE sleeve_connection_edges (
        id TEXT PRIMARY KEY,
        claim_id TEXT NOT NULL REFERENCES sleeve_claims(id) ON DELETE CASCADE,
        claim_evidence TEXT NOT NULL,
        source_recording_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL CHECK (relationship_type IN
          ('samples', 'sampled_in', 'cover_of', 'covered_by', 'writer', 'producer')),
        target_kind TEXT NOT NULL CHECK (target_kind IN ('recording', 'contributor')),
        target_provider_id TEXT NOT NULL,
        target_title TEXT NOT NULL,
        target_artist TEXT,
        target_url TEXT,
        match_state TEXT NOT NULL CHECK (match_state IN ('unresolved', 'matched', 'ambiguous')),
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_sleeve_connection_edges_claim ON sleeve_connection_edges(claim_id);
      CREATE INDEX idx_sleeve_connection_edges_source ON sleeve_connection_edges(source_recording_id);
      CREATE INDEX idx_sleeve_connection_edges_target
        ON sleeve_connection_edges(target_kind, target_provider_id, relationship_type);
      CREATE TABLE sleeve_connection_library_matches (
        edge_id TEXT NOT NULL REFERENCES sleeve_connection_edges(id) ON DELETE CASCADE,
        local_track_id TEXT NOT NULL REFERENCES sleeve_connection_library_tracks(local_track_id) ON DELETE CASCADE,
        recording_id TEXT,
        match_basis TEXT NOT NULL,
        PRIMARY KEY(edge_id, local_track_id)
      );
      CREATE INDEX idx_sleeve_connection_library_matches_recording
        ON sleeve_connection_library_matches(recording_id);
    `);
    d.pragma('user_version = 40');
  }
  if (version < 41) {
    d.exec(`
      CREATE TABLE sleeve_connection_library_artists (
        local_artist_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL
      );
      CREATE INDEX idx_sleeve_connection_library_artist_name
        ON sleeve_connection_library_artists(name_key);
      CREATE TABLE sleeve_connection_artist_population (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        completed_at TEXT NOT NULL
      );
    `);
    d.pragma('user_version = 41');
  }
  if (version < 42) {
    d.exec(`CREATE TABLE sleeve_connection_revisions (
      id INTEGER PRIMARY KEY CHECK (id = 1), facts INTEGER NOT NULL DEFAULT 0,
      overview INTEGER NOT NULL DEFAULT 0
    ); INSERT INTO sleeve_connection_revisions(id) VALUES (1);`);
    const watches = [
      { table: 'sleeve_claims', columns: ['id', 'entity_type', 'entity_id', 'category', 'source_document_id', 'evidence', 'enabled'], facts: true,
        condition: (row: string) => `${row}.entity_type = 'recording' AND ${row}.category IN ('credits', 'musical-connections')
          AND EXISTS (SELECT 1 FROM sleeve_source_documents WHERE id = ${row}.source_document_id AND provider = 'genius')` },
      { table: 'sleeve_source_documents', columns: ['id', 'entity_type', 'entity_id', 'provider', 'content', 'source_url', 'attribution'], facts: true,
        condition: (row: string) => `${row}.provider = 'genius' AND ${row}.entity_type = 'recording'` },
      { table: 'sleeve_recordings', columns: ['id', 'title', 'artist_id', 'musicbrainz_id'], facts: true },
      { table: 'sleeve_artists', columns: ['id', 'name', 'musicbrainz_id'], facts: true },
      { table: 'sleeve_local_attachments', columns: ['local_track_id', 'recording_id', 'match_state'], facts: true },
      { table: 'sleeve_connection_library_tracks', columns: ['local_track_id', 'title', 'artist', 'album', 'musicbrainz_recording_id', 'title_key', 'artist_key'], facts: true },
      { table: 'sleeve_connection_library_artists', columns: ['local_artist_id', 'name', 'name_key'], facts: false },
      { table: 'sleeve_connection_library_scan', columns: ['completed_at'], facts: false },
      { table: 'sleeve_connection_edges', columns: ['id', 'claim_id', 'claim_evidence', 'source_recording_id', 'relationship_type', 'target_kind', 'target_provider_id', 'match_state', 'target_title', 'target_artist', 'target_url'], facts: false },
      { table: 'sleeve_connection_library_matches', columns: ['edge_id', 'local_track_id', 'recording_id', 'match_basis'], facts: false },
    ];
    for (const watch of watches) {
      // Replay fixtures can contain only a historical table projection.
      const columns = new Set((d.prepare(`PRAGMA table_info(${watch.table})`).all() as Array<{ name: string }>).map((row) => row.name));
      if (!watch.columns.every((column) => columns.has(column))) continue;
      const bump = `UPDATE sleeve_connection_revisions SET overview = overview + 1${watch.facts ? ', facts = facts + 1' : ''} WHERE id = 1;`;
      for (const event of ['INSERT', 'UPDATE', 'DELETE'] as const) {
        const row = event === 'DELETE' ? 'OLD' : 'NEW';
        const relevant = watch.condition ? event === 'UPDATE'
          ? `((${watch.condition('OLD')}) OR (${watch.condition('NEW')}))` : `(${watch.condition(row)})` : '1';
        const changed = event === 'UPDATE' ? watch.columns.map((column) => `OLD.${column} IS NOT NEW.${column}`).join(' OR ') : '1';
        d.exec(`CREATE TRIGGER sleeve_connection_revision_${watch.table}_${event.toLowerCase()}
          AFTER ${event} ON ${watch.table} WHEN (${relevant}) AND (${changed}) BEGIN ${bump} END;`);
      }
    }
    d.pragma('user_version = 42');
  }
  if (version < 43) {
    // Preserve legacy history as unversioned; never invent speech/air evidence.
    d.exec(`ALTER TABLE sleeve_claim_uses ADD COLUMN generated_signal TEXT;
      ALTER TABLE sleeve_claim_uses ADD COLUMN speech_signal TEXT;
      ALTER TABLE sleeve_claim_uses ADD COLUMN tts_rendered_at TEXT;
      ALTER TABLE sleeve_claim_uses ADD COLUMN tts_engine TEXT;`);
    d.pragma('user_version = 43');
  }
  if (version < 44) {
    d.exec(`CREATE TABLE sleeve_brain_layers (
      entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, graph_json TEXT NOT NULL,
      PRIMARY KEY (entity_type, entity_id)
    );`);
    d.pragma('user_version = 44');
  }
  if (version < 45) {
    d.exec(`ALTER TABLE sleeve_musicbrainz_series ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE sleeve_musicbrainz_series ADD COLUMN origin TEXT NOT NULL DEFAULT 'supplied';
      ALTER TABLE sleeve_musicbrainz_series ADD COLUMN removed INTEGER NOT NULL DEFAULT 0;`);
    d.pragma('user_version = 45');
  }
  if (version < 46) {
    if (!(d.prepare('PRAGMA table_info(sleeve_claims)').all() as Array<{ name: string }>).some(column => column.name === 'feedback_hold')) {
      d.exec('ALTER TABLE sleeve_claims ADD COLUMN feedback_hold INTEGER NOT NULL DEFAULT 0;');
    }
    const useColumns = new Set((d.prepare('PRAGMA table_info(sleeve_claim_uses)').all() as Array<{ name: string }>).map(column => column.name));
    for (const column of ['track_artist', 'track_title', 'claim_wording_at_offer']) {
      if (!useColumns.has(column)) d.exec(`ALTER TABLE sleeve_claim_uses ADD COLUMN ${column} TEXT;`);
    }
    d.exec(`CREATE TABLE IF NOT EXISTS sleeve_spark_feedback (
      use_id TEXT PRIMARY KEY REFERENCES sleeve_claim_uses(id) ON DELETE CASCADE,
      story TEXT CHECK (story IN ('good', 'routine', 'unclear', 'incorrect', 'wrong-subject')),
      delivery TEXT CHECK (delivery IN ('worked', 'forced', 'wrong-subject')),
      note TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      CHECK (story IS NOT NULL OR delivery IS NOT NULL)
    );
    CREATE INDEX IF NOT EXISTS idx_sleeve_claim_uses_air ON sleeve_claim_uses(aired_at DESC, id DESC) WHERE aired_at IS NOT NULL;
    CREATE TRIGGER IF NOT EXISTS sleeve_feedback_hold
      BEFORE UPDATE ON sleeve_claims
      WHEN NEW.enabled = 1 AND NEW.feedback_hold = 1
      BEGIN SELECT RAISE(IGNORE); END;`);
    d.pragma('user_version = 46');
  }

  if (version < 47) {
    const jobColumns = new Set((d.prepare('PRAGMA table_info(sleeve_research_jobs)').all() as Array<{ name: string }>).map(column => column.name));
    if (!jobColumns.has('operator_requested')) d.exec('ALTER TABLE sleeve_research_jobs ADD COLUMN operator_requested INTEGER NOT NULL DEFAULT 0;');
    d.pragma('user_version = 47');
  }

  if (version < 48) {
    d.exec(`CREATE TABLE IF NOT EXISTS sleeve_operator_research (
      id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      area TEXT NOT NULL, note TEXT NOT NULL, source_url TEXT NOT NULL, subject_label TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'queued', phase TEXT NOT NULL DEFAULT 'discovery',
      candidates_json TEXT NOT NULL DEFAULT '[]', source_index INTEGER NOT NULL DEFAULT 0,
      current_source_id TEXT, extracted_json TEXT, attempts INTEGER NOT NULL DEFAULT 0, run_after TEXT,
      search_calls INTEGER NOT NULL DEFAULT 0, pages_read INTEGER NOT NULL DEFAULT 0,
      llm_calls INTEGER NOT NULL DEFAULT 0, reported_tokens INTEGER NOT NULL DEFAULT 0,
      stories_added INTEGER NOT NULL DEFAULT 0, review_items INTEGER NOT NULL DEFAULT 0,
      last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sleeve_operator_research_active ON sleeve_operator_research(fingerprint)
      WHERE state IN ('queued', 'running', 'deferred');
    CREATE TABLE IF NOT EXISTS sleeve_operator_research_sources (
      request_id TEXT NOT NULL REFERENCES sleeve_operator_research(id) ON DELETE CASCADE,
      url TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, detail TEXT,
      source_document_id TEXT, retrieved_at TEXT,
      PRIMARY KEY(request_id, url)
    );`);
    d.pragma('user_version = 48');
  }

  if (version < 49) {
    d.exec(`CREATE TABLE IF NOT EXISTS sleeve_brain_album_requests (
      local_album_id TEXT PRIMARY KEY, local_track_id TEXT NOT NULL, title TEXT NOT NULL,
      release_group_id TEXT, state TEXT NOT NULL, last_error TEXT, requested_at TEXT NOT NULL
    ); CREATE INDEX IF NOT EXISTS idx_sleeve_brain_album_track ON sleeve_brain_album_requests(local_track_id,state);`);
    d.pragma('user_version = 49');
  }

  if (version < 50) {
    // Repair manual album requests whose match created an automatic job before
    // the explicit handoff. Completed requests and unrelated automatic jobs stay put.
    d.exec(`UPDATE sleeve_research_jobs SET operator_requested=1,priority=MAX(priority,500)
      WHERE subject_type='release' AND state IN ('queued','retry-at','running')
        AND provider IN ('wikipedia','researcher','genius')
        AND capability IN ('release-group-biography','extract-wikipedia-release-group','album-biography','extract-genius-album')
        AND subject_id IN (
          SELECT request.release_group_id FROM sleeve_brain_album_requests request
          WHERE request.state='resolved' AND request.release_group_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM sleeve_research_jobs completed
              WHERE completed.provider='researcher' AND completed.subject_type='release'
                AND completed.subject_id=request.release_group_id AND completed.state='complete'
                AND COALESCE(completed.completed_at,completed.updated_at)>=request.requested_at)
        )`);
    d.pragma('user_version = 50');
  }

  if (version < 51) {
    // Keep historical sources/airings, but retire the removed web-research path.
    d.exec(`UPDATE sleeve_operator_research SET state='cancelled',
        last_error='Operator-led web research has been removed',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE state IN ('queued','running','deferred');
      UPDATE sleeve_claims SET enabled=0 WHERE source_document_id IN (
        SELECT id FROM sleeve_source_documents WHERE provider='web-operator');
      UPDATE sleeve_moderation_candidates SET status='deleted',
        reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),reviewed_by='feature-retirement',
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE status='pending' AND source_document_id IN (
        SELECT id FROM sleeve_source_documents WHERE provider='web-operator');`);
    d.pragma('user_version = 51');
  }

  if (version < 52) {
    // Playback attribution is a snapshot, never reconstructed from today's roster.
    const columns = new Set((d.prepare('PRAGMA table_info(sleeve_encounters)').all() as Array<{name:string}>).map(column=>column.name));
    for (const column of ['host_id','host_name']) {
      if (!columns.has(column)) d.exec(`ALTER TABLE sleeve_encounters ADD COLUMN ${column} TEXT;`);
    }
    d.pragma('user_version = 52');
  }

  if (version < 53) {
    const columns = new Set((d.prepare('PRAGMA table_info(sleeve_claim_uses)').all() as Array<{name:string}>).map(column=>column.name));
    if (!columns.has('segment_id')) d.exec('ALTER TABLE sleeve_claim_uses ADD COLUMN segment_id TEXT;');
    d.exec(`CREATE TABLE IF NOT EXISTS sleeve_segment_lines (
      segment_id TEXT NOT NULL, line_index INTEGER NOT NULL CHECK(line_index BETWEEN 0 AND 11),
      line_count INTEGER NOT NULL CHECK(line_count BETWEEN 1 AND 12),
      speaker_id TEXT NOT NULL, speaker_name TEXT NOT NULL, text TEXT NOT NULL, aired_at TEXT NOT NULL,
      PRIMARY KEY(segment_id,line_index)
    ); CREATE INDEX IF NOT EXISTS idx_sleeve_claim_uses_segment ON sleeve_claim_uses(segment_id) WHERE segment_id IS NOT NULL;`);
    d.pragma('user_version = 53');
  }

}

export function schemaVersion(): number {
  return (open().pragma('user_version', { simple: true }) as number) || 0;
}
