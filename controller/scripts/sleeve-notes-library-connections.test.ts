import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SleeveRelationshipType } from '../src/sleeve-notes/provider.js';

const root = mkdtempSync(join(tmpdir(), 'subwave-library-connections-'));
process.env.STATE_DIR = root;
const { migrate, close } = await import('../src/sleeve-notes/db.js');
const { cacheConnectionLibraryTracks, reconcileLibraryConnections, libraryConnectionsInDatabase } = await import('../src/sleeve-notes/library-connections.js');
const { ConnectionLibraryWorker } = await import('../src/sleeve-notes/connection-library-worker.js');
const { loadExtendedSleeveNoteCandidatesInDatabase, selectMostSpecificEligibleClaim } = await import('../src/sleeve-notes/link-selection.js');
const { researchConnectionsGraphInDatabase, replaceAutomaticWikipediaClaimsInDatabase } = await import('../src/sleeve-notes/research-repository.js');
test.after(() => { close(); rmSync(root, { recursive: true, force: true }); });

const now = '2026-10-12T10:00:00.000Z';
function fixture() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  db.prepare(`INSERT INTO sleeve_artists (id, name, musicbrainz_id, created_at, updated_at)
    VALUES ('artist', 'Band', 'artist', ?, ?)`).run(now, now);
  recording(db, 'source', 'Source', '1');
  db.prepare(`INSERT INTO sleeve_local_attachments (local_track_id, recording_id, title, artist,
    match_state, first_encountered_at, last_encountered_at, updated_at)
    VALUES ('local-source', 'source', 'Source', 'Band', 'matched', ?, ?, ?)`).run(now, now, now);
  return db;
}
function recording(db: Database.Database, id: string, title: string, geniusId: string) {
  db.prepare(`INSERT INTO sleeve_recordings (id, title, artist_id, match_state, created_at, updated_at)
    VALUES (?, ?, 'artist', 'matched', ?, ?)`).run(id, title, now, now);
  db.prepare(`INSERT INTO sleeve_source_documents (id, entity_type, entity_id, provider, source_url,
    content_hash, content_kind, content, attribution, retrieved_at)
    VALUES (?, 'recording', ?, 'genius', 'https://genius.test/song', ?, 'structured-json', ?, 'Genius', ?)`)
    .run(`doc-${id}`, id, id, JSON.stringify({ identity: { providerId: geniusId, title, artist: 'Band' } }), now);
}
function claim(db: Database.Database, id: string, recordingId: string, category: string, evidence: unknown) {
  db.prepare(`INSERT INTO sleeve_claims (id, entity_type, entity_id, category, topic, wording,
    source_document_id, evidence, created_at, updated_at)
    VALUES (?, 'recording', ?, ?, ?, 'A supported provider claim.', ?, ?, ?, ?)`)
    .run(id, recordingId, category, id, `doc-${recordingId}`, JSON.stringify(evidence), now, now);
}
function relation(db: Database.Database, id: string, type: SleeveRelationshipType, title = 'Target', artist = 'Target Band') {
  claim(db, id, 'source', 'musical-connections', {
    type, target: { providerId: '2', title, artist, canonicalUrl: 'https://genius.test/target' },
  });
}
function credit(db: Database.Database, id: string, recordingId: string, providerId = 'person', role = 'Producer') {
  claim(db, id, recordingId, 'credits', {
    role, names: ['Person'], contributors: [{ providerId, name: 'Person' }],
  });
}

test('a stored cover becomes selectable and Graph-local when its target is added, then loses that match on removal', () => {
  const db = fixture();
  relation(db, 'covered', 'covered_by');
  reconcileLibraryConnections(db, now);
  let candidates = loadExtendedSleeveNoteCandidatesInDatabase(db, 'local-source', 'Band');
  assert.equal(selectMostSpecificEligibleClaim(candidates, [], Date.parse(now)), null);
  cacheConnectionLibraryTracks(db, [{ id: 'target-local', title: 'Target', artist: 'Target Band' }], 'scan');
  reconcileLibraryConnections(db, now);
  const connection = libraryConnectionsInDatabase(db, 'source')[0];
  assert.equal(connection.type, 'covered_by');
  assert.equal(connection.matchState, 'matched');
  assert.equal(connection.tracks[0].id, 'target-local');
  candidates = loadExtendedSleeveNoteCandidatesInDatabase(db, 'local-source', 'Band');
  assert.equal(selectMostSpecificEligibleClaim(candidates, [], Date.parse(now))?.claimId, 'covered');
  assert.equal(candidates[0].wording, 'Target by Target Band is a cover version of Source by Band.');
  const graph = researchConnectionsGraphInDatabase(db, { entityType: 'recording', entityId: 'source' });
  assert.ok(graph?.nodes.some((node) => node.localTrackId === 'target-local' && node.local));
  db.prepare('DELETE FROM sleeve_connection_library_tracks').run();
  reconcileLibraryConnections(db, now);
  assert.equal(libraryConnectionsInDatabase(db, 'source')[0].matchState, 'unresolved');
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM sleeve_claims').get() as { n: number }).n, 1);
  db.close();
});

test('matching refuses another artist, a version qualifier, and ambiguous local copies', () => {
  const db = fixture();
  relation(db, 'sample', 'samples');
  cacheConnectionLibraryTracks(db, [
    { id: 'wrong', title: 'Target', artist: 'Other Band' },
    { id: 'live', title: 'Target (Live)', artist: 'Target Band' },
  ], 'scan');
  reconcileLibraryConnections(db);
  assert.equal(libraryConnectionsInDatabase(db, 'source')[0].matchState, 'unresolved');
  cacheConnectionLibraryTracks(db, [
    { id: 'copy-one', title: 'Target', artist: 'Target Band' },
    { id: 'copy-two', title: 'Target', artist: 'Target Band' },
  ], 'scan');
  reconcileLibraryConnections(db);
  const edge = libraryConnectionsInDatabase(db, 'source')[0];
  assert.equal(edge.matchState, 'ambiguous');
  assert.deepEqual(edge.tracks, []);
  db.close();
});

test('copies on different albums resolve when their recording MBID proves they are the same version', () => {
  const db = fixture();
  relation(db, 'sample', 'samples');
  const mbid = '12345678-1234-1234-1234-123456789012';
  cacheConnectionLibraryTracks(db, [
    { id: 'album-copy', title: 'Target', artist: 'Target Band', musicbrainzId: mbid },
    { id: 'compilation-copy', title: 'Target', artist: 'Target Band', musicbrainzId: mbid },
  ], 'scan');
  reconcileLibraryConnections(db);
  const edge = libraryConnectionsInDatabase(db, 'source')[0];
  assert.equal(edge.matchState, 'matched');
  assert.equal(edge.tracks.length, 1);
  assert.match(edge.tracks[0].matchBasis, /same-recording-copies/);
  db.close();
});

test('upgrade restores saved extraction rank and leaves original claims and wording intact', () => {
  const db = new Database(':memory:');
  // The v38 tables consumed by the additive migrations. Include a legacy
  // string item as well as diagnostics so old cache formats cannot abort boot.
  db.exec(`CREATE TABLE sleeve_encounters (id TEXT PRIMARY KEY);
    CREATE TABLE sleeve_musicbrainz_series (series_mbid TEXT PRIMARY KEY);
    CREATE TABLE sleeve_claim_uses (id TEXT PRIMARY KEY, aired_at TEXT);
    CREATE TABLE sleeve_research_jobs (id TEXT PRIMARY KEY,provider TEXT,subject_type TEXT,subject_id TEXT,
      capability TEXT,state TEXT,priority INTEGER,completed_at TEXT,updated_at TEXT);
    CREATE TABLE sleeve_claims (id TEXT PRIMARY KEY, source_document_id TEXT, wording TEXT, enabled INTEGER);
    CREATE TABLE sleeve_moderation_candidates (id TEXT PRIMARY KEY,source_document_id TEXT,status TEXT,reviewed_at TEXT,reviewed_by TEXT,updated_at TEXT);
    CREATE TABLE sleeve_source_documents (id TEXT PRIMARY KEY, provider TEXT);
    CREATE TABLE sleeve_wikipedia_scan_chunks (source_document_id TEXT, items_json TEXT, created_at TEXT, chunk_index INTEGER);
    INSERT INTO sleeve_source_documents VALUES ('source', 'wikipedia');
    INSERT INTO sleeve_claims VALUES ('claim', 'source', 'Ranked fact.', 1);
    PRAGMA user_version = 38;`);
  db.prepare('INSERT INTO sleeve_wikipedia_scan_chunks VALUES (?, ?, ?, ?)')
    .run('source', JSON.stringify(['Legacy fact', { wording: 'Ranked fact.' }]), now, 2);
  migrate(db);
  assert.deepEqual(db.prepare('SELECT * FROM sleeve_claims').get(), {
    id: 'claim', source_document_id: 'source', wording: 'Ranked fact.', enabled: 1,
    extraction_rank: 2, extraction_section: 3, feedback_hold: 0,
  });
  migrate(db);
  assert.equal(db.pragma('user_version', { simple: true }),59);
  db.close();
});

test('a shared contributor ID and role connects local peer recordings and boosts the credit Spark', () => {
  const db = fixture();
  recording(db, 'peer', 'Peer', '3');
  recording(db, 'namesake', 'Namesake', '4');
  recording(db, 'different-role', 'Different Role', '5');
  credit(db, 'source-credit', 'source');
  credit(db, 'peer-credit', 'peer');
  credit(db, 'namesake-credit', 'namesake', 'other-person');
  credit(db, 'writer-credit', 'different-role', 'person', 'Writer');
  relation(db, 'external-sample', 'samples');
  cacheConnectionLibraryTracks(db, [
    { id: 'local-source', title: 'Source', artist: 'Band' },
    { id: 'local-peer', title: 'Peer', artist: 'Band' },
    { id: 'local-namesake', title: 'Namesake', artist: 'Band' },
    { id: 'local-writer', title: 'Different Role', artist: 'Band' },
  ], 'scan');
  reconcileLibraryConnections(db);
  const edge = libraryConnectionsInDatabase(db, 'source').find((edge) => edge.type === 'producer');
  assert.deepEqual(edge?.tracks.map((track) => track.id), ['local-peer']);
  const candidates = loadExtendedSleeveNoteCandidatesInDatabase(db, 'local-source', 'Band');
  const selected = selectMostSpecificEligibleClaim(candidates, [], Date.parse(now));
  assert.equal(selected?.claimId, 'source-credit');
  assert.match(selected!.wording, /Peer by Band also credits Person as producer/);
  db.prepare("UPDATE sleeve_claims SET enabled = 0 WHERE id = 'peer-credit'").run();
  // Read-side validation removes the enrichment even before the next sweep.
  assert.deepEqual(libraryConnectionsInDatabase(db, 'source').find((edge) => edge.type === 'producer')?.tracks, []);
  db.close();
});

test('a missing contributor ID cannot shift the next person identity onto the wrong credit name', () => {
  const db = fixture();
  claim(db, 'mixed-credit', 'source', 'credits', {
    role: 'Writer', names: ['Unidentified', 'Person'], contributors: [{ providerId: 'person', name: 'Person' }],
  });
  reconcileLibraryConnections(db);
  const graph = researchConnectionsGraphInDatabase(db, { entityType: 'recording', entityId: 'source' });
  const identified = graph?.nodes.find((node) => node.kind === 'contributor' && node.entityId === 'person');
  assert.equal(identified?.title, 'Person');
  assert.ok(graph?.nodes.some((node) => node.title === 'Unidentified' && node.entityId !== 'person'));
  db.close();
});

test('library matches take priority and sampled-in wording preserves the actual sampler', () => {
  const db = fixture();
  relation(db, 'sampled', 'sampled_in');
  cacheConnectionLibraryTracks(db, [{ id: 'target-local', title: 'Target', artist: 'Target Band' }], 'scan');
  reconcileLibraryConnections(db);
  const connection = loadExtendedSleeveNoteCandidatesInDatabase(db, 'local-source', 'Band')[0];
  assert.equal(connection.wording, 'Target by Target Band samples Source by Band.');
  const story = { ...connection, claimId: 'story', category: 'track-stories', provider: 'wikipedia', connection: undefined };
  assert.equal(selectMostSpecificEligibleClaim([story, connection], [], Date.parse(now))?.claimId, 'sampled');
  db.close();
});

test('Wikipedia replacement persists section-local rank without needing a wipe', () => {
  const db = fixture();
  db.prepare(`INSERT INTO sleeve_source_documents (id, entity_type, entity_id, provider, source_url,
    content_hash, content_kind, content, attribution, retrieved_at)
    VALUES ('wiki', 'artist', 'artist', 'wikipedia', 'https://wiki.test', 'wiki', 'bounded-text', 'Facts.', 'Wiki', ?)`)
    .run(now);
  replaceAutomaticWikipediaClaimsInDatabase(db, { entityType: 'artist', entityId: 'artist', sourceDocumentId: 'wiki',
    candidates: [{ wording: 'A supported Wikipedia sentence.', topic: 'topic', category: 'artist-stories',
      evidence: 'A supported Wikipedia sentence.', extractionRank: 2, extractionSection: 3 }] });
  assert.deepEqual(db.prepare('SELECT extraction_rank AS rank, extraction_section AS section FROM sleeve_claims').get(), { rank: 2, section: 3 });
  db.close();
});

test('worker checkpoints pages, retries a failed album, and only prunes after a complete catalogue sweep', async () => {
  const db = fixture();
  relation(db, 'cover', 'covered_by');
  cacheConnectionLibraryTracks(db, [{ id: 'old', title: 'Old', artist: 'Band' }], 'old');
  let fail = true;
  const worker = new ConnectionLibraryWorker({ isQuiet: () => true }, {
    getAlbumList: async (offset) => offset === 0 ? [{ id: 'album' }] : [],
    getAlbumWithSongs: async () => {
      if (fail) throw new Error('temporary album failure');
      return { album: { id: 'album' }, songs: [{ id: 'target', title: 'Target', artist: 'Target Band' }] };
    },
    getScanStatus: async () => false,
  }, () => db, () => true);
  const at = Date.parse(now);
  assert.equal(await worker.runOnce(at), false);
  assert.equal((db.prepare('SELECT album_offset FROM sleeve_connection_library_scan').get() as { album_offset: number }).album_offset, 0);
  assert.ok(db.prepare("SELECT 1 FROM sleeve_connection_library_tracks WHERE local_track_id = 'old'").get());
  fail = false;
  assert.equal(await worker.runOnce(at + 11 * 60_000), true);
  assert.equal(libraryConnectionsInDatabase(db, 'source')[0].tracks[0].id, 'target');
  assert.ok(db.prepare("SELECT 1 FROM sleeve_connection_library_tracks WHERE local_track_id = 'old'").get());
  assert.equal(await worker.runOnce(at + 12 * 60_000), true);
  assert.equal(db.prepare("SELECT 1 FROM sleeve_connection_library_tracks WHERE local_track_id = 'old'").get(), undefined);
  db.close();
});

test('a transient empty catalogue leaves the cached tracks and connections intact', async () => {
  const db = fixture();
  relation(db, 'sample', 'samples');
  cacheConnectionLibraryTracks(db, [{ id: 'target', title: 'Target', artist: 'Target Band' }], 'previous');
  reconcileLibraryConnections(db, now); // The failure must preserve an index that already exists.
  const worker = new ConnectionLibraryWorker({ isQuiet: () => true }, {
    getAlbumList: async () => [], getAlbumWithSongs: async () => null, getScanStatus: async () => false,
  }, () => db, () => true);
  assert.equal(await worker.runOnce(Date.parse(now)), false);
  assert.equal(libraryConnectionsInDatabase(db, 'source')[0].tracks[0].id, 'target');
  assert.ok(db.prepare("SELECT 1 FROM sleeve_connection_library_tracks WHERE local_track_id = 'target'").get());
  db.close();
});

test('artist spelling variants resolve to library tracks while title variants remain distinct',()=>{
 const db=fixture();
 try{
  relation(db,'variant','samples','Target','Run-DMC');
  db.prepare("INSERT INTO sleeve_connection_library_artists VALUES ('run','Run‐D.M.C.','run‐d.m.c.')").run();
  cacheConnectionLibraryTracks(db,[{id:'run-song',title:'Target',artist:'Run‐D.M.C.'}],'variant');
  reconcileLibraryConnections(db,now);
  assert.equal(libraryConnectionsInDatabase(db,'source')[0].tracks[0]?.id,'run-song');
  cacheConnectionLibraryTracks(db,[{id:'run-song',title:'Target (Live)',artist:'Run‐D.M.C.'}],'variant-live');
  reconcileLibraryConnections(db,now);
  assert.equal(libraryConnectionsInDatabase(db,'source')[0].matchState,'unresolved');
 }finally{db.close();}
});

test('a Genius leading The resolves to the library artist while conflicting artist identities remain separate',()=>{
 const db=fixture();
 try {
  relation(db,'article-variant','samples','Target','The Incredible Bongo Band');
  db.prepare("INSERT INTO sleeve_connection_library_artists VALUES ('bongo','Incredible Bongo Band','incredible bongo band')").run();
  cacheConnectionLibraryTracks(db,[{id:'bongo-song',title:'Target',artist:'Incredible Bongo Band'}],'article-variant');
  reconcileLibraryConnections(db,now);
  assert.equal(libraryConnectionsInDatabase(db,'source')[0].tracks[0]?.id,'bongo-song');
  db.prepare("INSERT INTO sleeve_connection_library_artists VALUES ('other-bongo','The Incredible Bongo Band','the incredible bongo band')").run();
  reconcileLibraryConnections(db,now);
  assert.notEqual(libraryConnectionsInDatabase(db,'source')[0].matchState,'matched','distinct library identities must not be merged by name folding');
 } finally {db.close();}
});
