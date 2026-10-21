#!/usr/bin/env python3
"""Queue every artist Wikipedia scan with saved progress for its next play."""
from datetime import datetime, timezone
import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parents[2] / 'state' / 'sleeve-notes.db'
HELD_UNTIL = '9999-12-31T23:59:59.999Z'
now = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
db = sqlite3.connect(DB, timeout=30)
db.row_factory = sqlite3.Row
db.execute('PRAGMA busy_timeout=30000')
try:
    db.execute('BEGIN IMMEDIATE')
    version = db.execute('PRAGMA user_version').fetchone()[0]
    if version not in (27, 28):
        raise RuntimeError(f'Expected Sleeve Notes DB schema 27 or 28, got {version}')
    db.execute('''CREATE TABLE IF NOT EXISTS sleeve_wikipedia_rescan_requests (
      job_id TEXT PRIMARY KEY REFERENCES sleeve_research_jobs(id) ON DELETE CASCADE,
      encounter_count_at_request INTEGER NOT NULL,
      requested_at TEXT NOT NULL
    )''')
    db.execute('''CREATE TABLE IF NOT EXISTS sleeve_wikipedia_scan_history (
      job_id TEXT NOT NULL, source_document_id TEXT NOT NULL, chunk_index INTEGER NOT NULL,
      section_path TEXT NOT NULL, input_hash TEXT NOT NULL, raw_response TEXT NOT NULL,
      items_json TEXT NOT NULL, elapsed_ms INTEGER NOT NULL, parsed_count INTEGER NOT NULL,
      retained_count INTEGER NOT NULL, created_at TEXT NOT NULL, archived_at TEXT NOT NULL
    )''')
    db.execute('''CREATE INDEX IF NOT EXISTS idx_sleeve_wikipedia_scan_history_job
      ON sleeve_wikipedia_scan_history(job_id, archived_at, chunk_index)''')
    targets = db.execute('''SELECT j.id,
      (SELECT COUNT(DISTINCT e.id) FROM sleeve_encounters e
       JOIN sleeve_local_attachments a ON a.local_track_id=e.local_track_id
       JOIN sleeve_recordings r ON r.id=a.recording_id
       WHERE e.source='played' AND r.artist_id=j.subject_id) AS encounters
      FROM sleeve_research_jobs j JOIN sleeve_wikipedia_scan_progress w ON w.job_id=j.id
      WHERE j.provider='researcher' AND j.subject_type='artist'
        AND j.capability='extract-wikipedia' ORDER BY j.created_at''').fetchall()
    if len(targets) != 25 or any(row['encounters'] < 1 for row in targets):
        raise RuntimeError(f'Expected 25 encountered artist scans; found {len(targets)}')
    db.executemany('''INSERT OR IGNORE INTO sleeve_wikipedia_rescan_requests
      (job_id, encounter_count_at_request, requested_at) VALUES (?, ?, ?)''',
      [(row['id'], row['encounters'], now) for row in targets])
    if version < 28:
        db.execute('PRAGMA user_version = 28')
    db.execute('''UPDATE sleeve_research_jobs SET run_after=?, updated_at=?
      WHERE id IN (SELECT job_id FROM sleeve_wikipedia_rescan_requests)
        AND state IN ('queued','retry-at')''', (HELD_UNTIL, now))
    db.commit()
    print(f'Recorded next-encounter rescan requests for {len(targets)} artists.')
    print('Claims, scan progress, and existing scan outputs were preserved.')
    print('The updated controller must be rebuilt before these markers can trigger rescans.')
except Exception:
    db.rollback()
    raise
finally:
    db.close()
