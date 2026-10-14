import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const dbPath = resolve(process.cwd(), 'state/sleeve-notes.db');
const apply = process.argv.includes('--apply');
const db = new Database(dbPath, { timeout: 10_000 });
db.pragma('busy_timeout = 10000');

const eligibleAlbums = () => db.prepare(`
  SELECT DISTINCT wiki.subject_id AS releaseGroupId,
    (SELECT attachment.local_track_id
      FROM sleeve_releases release
      JOIN sleeve_recording_releases link ON link.release_id = release.id AND link.is_canonical_home = 1
      JOIN sleeve_local_attachments attachment ON attachment.recording_id = link.recording_id
      WHERE release.musicbrainz_release_group_id = wiki.subject_id
      ORDER BY attachment.last_encountered_at DESC LIMIT 1) AS localTrackId
  FROM sleeve_research_jobs wiki
  WHERE wiki.provider = 'wikipedia' AND wiki.subject_type = 'release'
    AND wiki.capability = 'release-group-biography' AND wiki.state = 'failed'
    AND EXISTS (
      SELECT 1 FROM sleeve_source_documents source
      JOIN sleeve_recordings recording ON recording.id = source.entity_id
      JOIN sleeve_recording_releases link ON link.recording_id = recording.id AND link.is_canonical_home = 1
      JOIN sleeve_releases release ON release.id = link.release_id
      WHERE source.provider = 'genius' AND source.entity_type = 'recording'
        AND json_valid(source.content)
        AND json_extract(source.content, '$.identity.providerId') IS NOT NULL
        AND release.musicbrainz_release_group_id = wiki.subject_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM sleeve_research_jobs genius
      WHERE genius.provider = 'genius' AND genius.subject_type = 'release'
        AND genius.subject_id = wiki.subject_id AND genius.capability = 'album-biography'
        AND genius.state = 'complete'
    )
`).all();

if (!apply) {
  const albums = eligibleAlbums();
  console.log(`Would queue ${albums.length} failed album lookups with a usable Genius song source.`);
  console.log('Review this count, then rerun with --apply to add the jobs.');
  db.close();
  process.exit(0);
}

const now = new Date().toISOString();
const insert = db.prepare(`
  INSERT INTO sleeve_research_jobs (
    id, provider, subject_type, subject_id, capability, state, priority,
    attempts, run_after, created_at, updated_at, origin_local_track_id
  ) VALUES (?, 'genius', 'release', ?, 'album-biography', 'queued', 340, 0, NULL, ?, ?, ?)
  ON CONFLICT(provider, subject_type, subject_id, capability) DO UPDATE SET
    priority = MAX(sleeve_research_jobs.priority, excluded.priority),
    state = CASE WHEN sleeve_research_jobs.state IN ('failed', 'cancelled')
      THEN 'queued' ELSE sleeve_research_jobs.state END,
    run_after = CASE WHEN sleeve_research_jobs.state IN ('failed', 'cancelled')
      THEN NULL ELSE sleeve_research_jobs.run_after END,
    updated_at = excluded.updated_at
`);

const queued = db.transaction(() => {
  let count = 0;
  for (const album of eligibleAlbums()) {
    count += insert.run(randomUUID(), album.releaseGroupId, now, now, album.localTrackId).changes;
  }
  return count;
}).immediate();

console.log(`Queued ${queued} Genius album fallback jobs for failed Wikipedia lookups.`);
db.close();
