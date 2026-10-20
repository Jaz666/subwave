import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const root=mkdtempSync(join(tmpdir(),'subwave-notes-settings-'));process.env.STATE_DIR=root;
const settings=await import('../src/settings.js');
const store=await import('../src/settings/store.js');
await settings.load();const defaults=settings.get();

test('legacy and malformed master settings load safely; both switches survive save and cold reload in both directions',async()=>{
 for(const value of [undefined,null,0,'true',{}]) {
  writeFileSync(join(root,'settings.json'),JSON.stringify({...defaults,djBehaviour:{...defaults.djBehaviour,
   extendedSleeveNotes:value,sleeveNotesCollectionPaused:value,sleeveNotesMaintenanceWhenEmpty:value}}));
  store.setCache(null);await settings.load();
  assert.equal(settings.get().djBehaviour.extendedSleeveNotes,false);
  assert.equal(settings.get().djBehaviour.sleeveNotesCollectionPaused,false);
  assert.equal(settings.get().djBehaviour.sleeveNotesMaintenanceWhenEmpty,false);
 }
 for(const [master,paused] of [[true,true],[false,true],[true,false],[false,false]]) {
  await settings.update({djBehaviour:{extendedSleeveNotes:master,sleeveNotesCollectionPaused:paused}});
  store.setCache(null);await settings.load();
  assert.equal(settings.get().djBehaviour.extendedSleeveNotes,master);
  assert.equal(settings.get().djBehaviour.sleeveNotesCollectionPaused,paused);
 }
});

test.after(()=>rmSync(root,{recursive:true,force:true}));
