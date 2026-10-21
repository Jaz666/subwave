import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrate,SCHEMA_VERSION} from '../src/sleeve-notes/db.js';

test('reconstructed v55 and v56 files preserve operator decisions, speech and pending work through upgrade and cold reopen',()=>{
 const root=mkdtempSync(join(tmpdir(),'subwave-sleeve-upgrade-'));
 try {
  for(const version of [55,56]) {
   const path=join(root,`${version}.db`);let db=new Database(path);migrate(db);
   const at='2026-10-19T12:00:00Z';
   db.prepare(`INSERT INTO sleeve_source_documents(id,entity_type,entity_id,provider,source_url,content_hash,content_kind,content,attribution,retrieved_at)
    VALUES ('source','artist','artist','wikipedia','https://example.test','hash','bounded-text','Original evidence','Fixture',?)`).run(at);
   db.prepare(`INSERT INTO sleeve_claims(id,entity_type,entity_id,category,topic,wording,source_document_id,evidence,operator_state,created_at,updated_at)
    VALUES ('claim','artist','artist','artist-stories','origin','Operator correction','source','Original evidence','approved',?,?)`).run(at,at);
   db.prepare(`INSERT INTO sleeve_claim_uses(id,claim_id,entity_type,entity_id,category,topic,supplied_at,aired_at,offered_wording)
    VALUES ('use','claim','artist','artist','artist-stories','origin',?,?,'Historical wording')`).run(at,at);
   db.prepare(`INSERT INTO sleeve_spark_feedback(use_id,story,delivery,note,actor,created_at,updated_at)
    VALUES ('use','good','worked','Keep the corrected fact','operator',?,?)`).run(at,at);
   db.prepare(`INSERT INTO sleeve_research_jobs(id,provider,subject_type,subject_id,capability,state,attempts,created_at,updated_at)
    VALUES ('job','researcher','artist','artist','extract-wikipedia','queued',2,?,?)`).run(at,at);
   // Remove only the structures introduced after this historical schema.
   db.exec('DROP TABLE sleeve_genius_library_seeds;DROP TABLE sleeve_genius_seed_cursor;DROP INDEX idx_sleeve_connection_library_artist_tracks');
   if(version===55)db.exec('DROP TABLE sleeve_genius_traversal;DROP TRIGGER sleeve_genius_local_update');
   db.pragma(`user_version=${version}`);
   const tables=['sleeve_source_documents','sleeve_claims','sleeve_claim_uses','sleeve_spark_feedback','sleeve_research_jobs'];
   const before=tables.map(table=>db.prepare(`SELECT * FROM ${table}`).all());db.close();
   db=new Database(path);migrate(db);migrate(db);db.close();db=new Database(path);
   assert.equal(db.pragma('user_version',{simple:true}),SCHEMA_VERSION);
   assert.deepEqual(tables.map(table=>db.prepare(`SELECT * FROM ${table}`).all()),before);
   assert.deepEqual(db.pragma('foreign_key_check'),[]);
   for(const table of ['sleeve_genius_traversal','sleeve_genius_library_seeds','sleeve_genius_seed_cursor']) {
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
   }
   db.close();
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});
