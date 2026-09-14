import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { migrate } from '../src/sleeve-notes/db.js';
import { admitLocalEncounterInDatabase } from '../src/sleeve-notes/research-repository.js';

test('an encounter creates one local attachment and one durable MusicBrainz match task', () => {
  const db = new Database(':memory:');
  migrate(db);

  admitLocalEncounterInDatabase(db, {
    localTrackId: 'navidrome-1', title: 'Pacific State', artist: '808 State',
    releaseTitle: 'The Best of... 808 State', musicbrainzRecordingId: null,
    source: 'queue', priority: 1,
  });
  admitLocalEncounterInDatabase(db, {
    localTrackId: 'navidrome-1', title: 'Pacific State', artist: '808 State',
    releaseTitle: 'The Best of... 808 State', musicbrainzRecordingId: 'recording-id',
    source: 'played', priority: 4,
  });

  assert.deepEqual(db.prepare(`SELECT recording_id AS recordingId, release_title AS releaseTitle,
    musicbrainz_recording_id AS musicbrainzRecordingId, match_state AS matchState
    FROM sleeve_local_attachments`).all(), [{
    recordingId: null, releaseTitle: 'The Best of... 808 State',
    musicbrainzRecordingId: 'recording-id', matchState: 'unmatched',
  }]);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM sleeve_encounters').get() as { count: number }).count, 2);
  assert.deepEqual(db.prepare(`SELECT provider, subject_type AS subjectType, subject_id AS subjectId,
    capability, state, priority FROM sleeve_research_jobs`).all(), [{
    provider: 'musicbrainz', subjectType: 'local-track', subjectId: 'navidrome-1',
    capability: 'match', state: 'queued', priority: 4,
  }]);
  db.close();
});
