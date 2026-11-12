import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,existsSync,symlinkSync,chmodSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createTempDir,removeTempDir} from './test-utils/temp-dir.js';
const state = createTempDir(join(tmpdir(),'subbeats-removal-'));
process.env.STATE_DIR = state;
const {createSubbeatsStore} = await import('../src/music/subbeats-store.js');
const {removeSubbeatsEntry,subbeatsRemovalRunning} = await import('../src/music/subbeats-removal.js');
const cache = await import('../src/music/stem-cache.js');
const locks = await import('../src/music/tagger-lock.js');
const store = createSubbeatsStore(state);
store.pause(true);
const root = cache.stemsRoot();
mkdirSync(root,{recursive:true});writeFileSync(join(root,cache.STEMS_MARKER),'{}');
after(() => removeTempDir(state));
function prepared(id:string,key='a'.repeat(64)) {
  store.enqueue([{id,title:id,artist:'Artist',album:''}]);
  store.event({id,status:'running'},[id]);store.event({id,status:'prepared',bundleKey:key},[id]);
  const extended = join(root,id,'subbeats','v1',key);
  mkdirSync(extended,{recursive:true});writeFileSync(join(extended,'head-vocals.flac'),'extended');
  writeFileSync(join(root,id,'head-vocals.flac'),'regular');
  return extended;
}
test('removal deletes extended files and the entry, preserving regular stems, policy and other entries', async () => {
  const extended = prepared('first');prepared('second');
  writeFileSync(join(state,'subbeats','stem-policy.json'),JSON.stringify({regularIds:['first']}));
  const beforePolicy = readFileSync(join(state,'subbeats','stem-policy.json'),'utf8');
  const qu = join(root,'.subbeats-quarantine','first');mkdirSync(qu,{recursive:true});writeFileSync(join(qu,'keep'),'quarantine');
  const snapshot = join(state,'stem-cache-usage.json');writeFileSync(snapshot,'{}');
  await removeSubbeatsEntry('first');
  assert.equal(existsSync(extended),false);assert.equal(store.read().jobs.some(job=>job.id==='first'),false);
  assert.equal(readFileSync(join(root,'first','head-vocals.flac'),'utf8'),'regular');
  assert.equal(readFileSync(join(qu,'keep'),'utf8'),'quarantine');
  assert.equal(readFileSync(join(state,'subbeats','stem-policy.json'),'utf8'),beforePolicy);
  assert.equal(store.read().jobs.find(job=>job.id==='second')?.status,'prepared');
  assert.equal(existsSync(snapshot),false,'deleting cached audio must invalidate its old byte snapshot');
  await removeSubbeatsEntry('first'); // A repeated request is harmless.
});
test('legacy bundles shared by another entry survive until the last reference is removed', async () => {
  prepared('shared-first');prepared('shared-second');
  const legacy = join(state,'subbeats','v1','a'.repeat(64));mkdirSync(legacy,{recursive:true});writeFileSync(join(legacy,'head-vocals.flac'),'legacy');
  await removeSubbeatsEntry('shared-first');assert.equal(existsSync(legacy),true);
  await removeSubbeatsEntry('shared-second');assert.equal(existsSync(legacy),true,'the second entry still refers to this key');
  await removeSubbeatsEntry('second');assert.equal(existsSync(legacy),false);
});
test('unsafe paths are refused before any deletion and leave the entry intact', async () => {
  const extended = prepared('unsafe','b'.repeat(64));
  const legacy = join(state,'subbeats','v1','b'.repeat(64));
  symlinkSync(extended,legacy,'dir');
  try {
    await assert.rejects(removeSubbeatsEntry('unsafe'),/unsafe/);
    assert.equal(existsSync(join(extended,'head-vocals.flac')),true);
    assert.equal(store.read().jobs.find(job=>job.id==='unsafe')?.status,'prepared');
  } finally { unlinkSync(legacy); }
  assert.equal(subbeatsRemovalRunning(),false);
});
test('permission failure keeps the entry available for a successful retry', {skip:process.getuid?.()===0}, async () => {
  const extended = prepared('retry');const parent = join(extended,'..');
  chmodSync(parent,0o500);
  try {
    await assert.rejects(removeSubbeatsEntry('retry'),/EACCES/);
    assert.equal(store.read().jobs.find(job=>job.id==='retry')?.status,'prepared');
    assert.equal(readFileSync(join(root,'retry','head-vocals.flac'),'utf8'),'regular');
  } finally { chmodSync(parent,0o700); }
  await removeSubbeatsEntry('retry');assert.equal(store.read().jobs.some(job=>job.id==='retry'),false);
});
test('queued and running work, an offline cache and a live maintenance lock are protected', async () => {
  store.enqueue([{id:'queued',title:'queued',artist:'',album:''}]);
  await assert.rejects(removeSubbeatsEntry('queued'),/preparation/);
  store.event({id:'queued',status:'running'},['queued']);
  await assert.rejects(removeSubbeatsEntry('queued'),/preparation/);
  const extended = prepared('offline');unlinkSync(join(root,cache.STEMS_MARKER));
  try { await assert.rejects(removeSubbeatsEntry('offline'),/offline/);assert.equal(existsSync(extended),true); }
  finally { writeFileSync(join(root,cache.STEMS_MARKER),'{}'); }
  locks.writePidfile({pid:process.pid,mode:'analyze',startedAt:new Date().toISOString(),args:[]});
  try { await assert.rejects(removeSubbeatsEntry('offline'),/analysis/);assert.equal(existsSync(extended),true); }
  finally { locks.clearPidfile(); }
  assert.equal(subbeatsRemovalRunning(),false);
});


test('removing a failed entry without artifacts retains the existing usage snapshot', async () => {
  store.enqueue([{id:'no-files',title:'no-files',artist:'',album:''}]);
  store.failQueued(['no-files'],'Failed before publication');
  const snapshot = join(state,'stem-cache-usage.json');writeFileSync(snapshot,'stored usage');
  await removeSubbeatsEntry('no-files');
  assert.equal(store.read().jobs.some(job=>job.id==='no-files'),false);
  assert.equal(readFileSync(snapshot,'utf8'),'stored usage');
});
