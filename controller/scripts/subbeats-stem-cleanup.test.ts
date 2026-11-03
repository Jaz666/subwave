import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, existsSync, utimesSync, readFileSync, chmodSync} from 'node:fs';
import {join} from 'node:path';
import {createTempDir, removeTempDir} from './test-utils/temp-dir.js';
import {tmpdir} from 'node:os';
const stateDir = createTempDir(join(tmpdir(), 'subbeats-cleanup-'));
process.env.STATE_DIR = stateDir;
const db = await import('../src/music/library-db.js');
const cache = await import('../src/music/stem-cache.js');
const policy = await import('../src/music/subbeats-stem-policy.js');
const cleanup = await import('../src/music/subbeats-stem-cleanup.js');
await db.open({embeddingDim:8,adoptStoredDim:true});
after(async () => {db.close();await removeTempDir(stateDir);});
const now = Date.now(), day = 86400000;
const root = cache.stemsRoot();
mkdirSync(root,{recursive:true});
writeFileSync(join(root,cache.STEMS_MARKER),'{}');
const ids = ['dance','rock','played','starred','manual','prepared','orphan-played'];
for (const id of ids) {
  if (id !== 'orphan-played') db.upsertTrackMeta(id,{title:id,genres:[id === 'dance' ? 'House' : 'Rock'],duration:200});
  const dir = join(root,id);mkdirSync(dir);writeFileSync(join(dir,'head-drums.flac'),'1234567890');
  if (id === 'prepared') { const extended = join(dir,'subbeats','v1','bundle'); mkdirSync(extended,{recursive:true}); writeFileSync(join(extended,'head-drums.flac'),'extended'); }
  const old = new Date(now - 2 * day);utimesSync(dir,old,old);
}
db.upsertTrackAnalysis('dance',{bpm:138,bars:[0,2000]});
for (const id of ['played','orphan-played']) db.recordPlay({trackId:id,title:id,artist:'A',album:'B',playedAt:'2000-01-01T00:00:00Z',source:'auto',requestedBy:null,showId:null,showName:null});
const signals = async () => ({starredIds:['starred'],regularStemIds:policy.readSubbeatsStemPolicy().regularIds,subbeatsIds:['prepared']});
const qu = (id:string) => join(root,cleanup.SUBBEATS_QUARANTINE,id);

test('a previous admission-only opt-in cannot authorise cleanup', async () => {
  mkdirSync(join(stateDir,'subbeats'),{recursive:true});
  writeFileSync(join(stateDir,'subbeats','stem-policy.json'),JSON.stringify({enabled:true,regularIds:[]}));
  assert.equal(policy.readSubbeatsStemPolicy().cleanupEnabled,false);
  assert.equal(await cleanup.runSubbeatsCleanup({signals,now}),null);
  assert.ok(existsSync(join(root,'rock')));
});
test('the estimate is read-only and protects plays, stars, preparation and manual inclusions', async () => {
  policy.updateSubbeatsStemPolicy({track:{id:'manual',include:true}});
  const before = readFileSync(join(stateDir,'subbeats','stem-policy.json'),'utf8');
  const estimate = await cleanup.estimateSubbeatsCleanup({signals,now});
  assert.equal(estimate.folders,1);assert.equal(estimate.bytes,10);
  assert.deepEqual(estimate.breakdown,{keptBytes:50,preparedBytes:18,candidateBytes:10,recentBytes:0,quarantineBytes:0});
  assert.ok(existsSync(join(root,'rock')));assert.equal(existsSync(qu('rock')),false);
  assert.equal(readFileSync(join(stateDir,'subbeats','stem-policy.json'),'utf8'),before);
});
test('explicit cleanup consent quarantines the excluded track and honours the full grace period', async () => {
  policy.updateSubbeatsStemPolicy({enabled:true,confirmCleanup:true});
  const report = await cleanup.runSubbeatsCleanup({signals,now});
  assert.equal(report?.quarantined,1);assert.equal(report?.freedBytes,0);
  for (const id of ids.filter(id => id !== 'rock')) assert.ok(existsSync(join(root,id)),id);
  assert.ok(existsSync(qu('rock')));
  assert.ok((await cleanup.estimateSubbeatsCleanup({signals,now})).breakdown.quarantineBytes >= 10);
  assert.equal((await cleanup.runSubbeatsCleanup({signals,now:now+day}))?.deletedCount,0);
});
test('new protection is refreshed before deletion, and disabling cleanup restores quarantined stems', async () => {
  const protectRock = async () => ({...(await signals()),starredIds:['starred','rock']});
  const held = await cleanup.runSubbeatsCleanup({signals:protectRock,now:now+8*day});
  assert.equal(held?.deletedCount,0);assert.equal(held?.mismatchedCount,1);
  assert.ok(existsSync(qu('rock')),'head-only stems lack recording identity and must stay quarantined');
  writeFileSync(join(qu('rock'),'tail-meta.json'),JSON.stringify({duration_sec:300}));
  const wrongRecording = await cleanup.runSubbeatsCleanup({signals:protectRock,now:now+8*day});
  assert.equal(wrongRecording?.mismatchedCount,1);assert.ok(existsSync(qu('rock')));
  writeFileSync(join(qu('rock'),'tail-meta.json'),JSON.stringify({duration_sec:200}));
  const restored = await cleanup.runSubbeatsCleanup({signals:protectRock,now:now+8*day});
  assert.equal(restored?.deletedCount,0);assert.ok(existsSync(join(root,'rock')));
  await cleanup.runSubbeatsCleanup({signals,now:now+9*day});
  assert.ok(existsSync(qu('rock')));
  policy.updateSubbeatsStemPolicy({enabled:false});
  const off = await cleanup.runSubbeatsCleanup({signals:async () => {throw new Error('off must not need stars');},now:now+20*day});
  assert.equal(off?.deletedCount,0);assert.ok(existsSync(join(root,'rock')));
});
test('unverifiable protections refuse a cleanup without touching cached files', async () => {
  policy.updateSubbeatsStemPolicy({enabled:true,confirmCleanup:true});
  await assert.rejects(cleanup.runSubbeatsCleanup({signals:async () => {throw new Error('stars unavailable');},now}),/stars unavailable/);
  assert.ok(existsSync(join(root,'rock')));
});
test('an unprotected quarantine is deleted only after seven days, with actual freed bytes', async () => {
  await cleanup.runSubbeatsCleanup({signals,now:now+30*day});
  const report = await cleanup.runSubbeatsCleanup({signals,now:now+38*day});
  assert.equal(report?.deletedCount,1);assert.ok((report?.freedBytes ?? 0) >= 10);
  assert.equal(existsSync(qu('rock')),false);
});

test('a pass interrupted after deletion still invalidates the usage snapshot', async () => {
  const dir = qu('aged-abort');mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'head-drums.flac'),'audio');
  writeFileSync(join(dir,'.orphaned-at'),String(now - 10*day));
  const snapshot = join(stateDir,'stem-cache-usage.json');writeFileSync(snapshot,'{}');
  let phases = 0;
  const {runOrphanPurge} = await import('../src/music/orphan-purge.js');
  await assert.rejects(runOrphanPurge({knownIds:[...ids],confirm:true,now,quarantineDir:join(root,cleanup.SUBBEATS_QUARANTINE),
    beforeMutations:async () => { if (++phases === 2) throw new Error('choices changed'); },
  }),/choices changed/);
  assert.equal(existsSync(dir),false);
  assert.equal(JSON.parse(readFileSync(snapshot,'utf8')).stale,true);
});

test('corrupt operator-heart data blocks the real strict signal loader', async () => {
  const file = join(stateDir,'likes.json');
  writeFileSync(file,'{broken');
  try {
    await assert.rejects(cleanup.runSubbeatsCleanup({now}), /Saved stars could not be verified/);
    assert.ok(existsSync(join(root,'played')));
    assert.ok(existsSync(join(root,'starred')));
  } finally { writeFileSync(file,JSON.stringify({likes:[]})); }
});

test('plays and stars added after planning are rechecked before any folder moves', async () => {
  for (const id of ['new-play','new-star']) {
    db.upsertTrackMeta(id,{title:id,genres:['Rock']});
    const dir = join(root,id);mkdirSync(dir);writeFileSync(join(dir,'head-drums.flac'),'audio');
    const old = new Date(now - 2*day);utimesSync(dir,old,old);
  }
  let reads = 0;
  const report = await cleanup.runSubbeatsCleanup({now,signals:async () => {
    if (++reads >= 2) {
      db.recordPlay({trackId:'new-play',title:'new-play',artist:'A',album:'B',playedAt:new Date(now).toISOString(),source:'auto',requestedBy:null,showId:null,showName:null});
      return {...await signals(),starredIds:['starred','new-star']};
    }
    return signals();
  }});
  assert.equal(report?.quarantined,0);
  assert.ok(existsSync(join(root,'new-play')));
  assert.ok(existsSync(join(root,'new-star')));
});

test('an unreadable candidate refuses the estimate instead of reporting zero reclaimable bytes', async () => {
  const dir = join(root,'unreadable-candidate');mkdirSync(dir);writeFileSync(join(dir,'head-drums.flac'),'audio');
  const old = new Date(now - 2*day);utimesSync(dir,old,old);chmodSync(dir,0o000);
  try {
    await assert.rejects(cleanup.estimateSubbeatsCleanup({signals,now}),/EACCES/);
    assert.ok(existsSync(dir));assert.equal(existsSync(qu('unreadable-candidate')),false);
  } finally { chmodSync(dir,0o700); }
});
