import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {externalDiscoveriesInDatabase} from '../src/sleeve-notes/external-discoveries.js';
test('external rankings count distinct references from library artists only',()=>{
 const db=new Database(':memory:');
 db.exec(`CREATE TABLE sleeve_connection_library_artists(name_key TEXT);
 CREATE TABLE sleeve_artists(id TEXT,name TEXT);
 CREATE TABLE sleeve_recordings(id TEXT,artist_id TEXT,title TEXT);
 CREATE TABLE sleeve_claims(id TEXT,enabled INTEGER,evidence TEXT,source_document_id TEXT,updated_at TEXT);
 CREATE TABLE sleeve_connection_edges(claim_id TEXT,claim_evidence TEXT,source_recording_id TEXT,relationship_type TEXT,target_provider_id TEXT,target_artist TEXT,target_title TEXT,target_kind TEXT);
 INSERT INTO sleeve_connection_library_artists VALUES ('local');
 INSERT INTO sleeve_artists VALUES ('a','Local'),('b','Outside');
 INSERT INTO sleeve_recordings VALUES ('r','a','Song'),('x','b','Other');`);
 const add=(id:string,recording:string,type:string,artist:string,enabled=1)=>{
 db.prepare("INSERT INTO sleeve_claims VALUES (?,?, 'e','source','now')").run(id,enabled);
 db.prepare("INSERT INTO sleeve_connection_edges VALUES (?,'e',?,?, 'target',?,'Target song','recording')").run(id,recording,type,artist);
 };
 add('one','r','samples','External');add('duplicate','r','samples','EXTERNAL');
 add('two','r','sampled_in','External');add('local','r','samples','Local');
 add('outside','x','samples','Unreachable');add('disabled','r','samples','Disabled',0);
 const result=externalDiscoveriesInDatabase(db);
 assert.equal(result.externalArtists,1);
 assert.equal(result.mostConnected[0]?.references,2);
 assert.equal(result.mostConnected[0]?.libraryArtists,1);
 assert.equal(result.sampleSources[0]?.sources,1);
 assert.equal(result.sampleUsers[0]?.users,1);
 db.close();
});
