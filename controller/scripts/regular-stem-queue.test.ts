import assert from 'node:assert/strict';
import test from 'node:test';
import { rm } from 'node:fs/promises';
import type { RegularStemQueueEvidence } from '../src/broadcast/regular-stem-needs.js';
process.env.NAVIDROME_URL = 'http://127.0.0.1:9';
process.env.LRCLIB_URL = 'http://127.0.0.1:9';
process.env.SUBWAVE_REGULAR_STEM_TEST_PAIRS = JSON.stringify([{out:'a',in:'b'}]);
const settings = await import('../src/settings.js');
const library = await import('../src/music/library.js');
const db = await import('../src/music/library-db.js');
const { queue } = await import('../src/broadcast/queue.js');
const { regularStemRuntime: runtime } = await import('../src/broadcast/regular-stem-runtime.js');
const { config } = await import('../src/config.js');

test('queue snapshots prepare in background, pending work holds only before deadline, force bypasses hold', async () => {
  await settings.load(); await library.load();
  await settings.update({ personas: settings.get().personas.map(p=>({...p,djMode:true})),
    transitions:{pairDrain:true,stemBlends:true,pickTimeStems:true} });
  for (const id of ['a','b']) {
    db.upsertTrackMeta(id,{title:id,artist:id,genres:['Rock'],duration:240});
    db.upsertTrackAnalysis(id,{bpm:80});
  }
  const q = queue as any;
  let snapshots: readonly RegularStemQueueEvidence[] = [];
  let pending = true, renders = 0, legacyPicks = 0;
  const originalUpdate = runtime.update, originalPending = runtime.pending;
  runtime.update = (_current, evidence) => { snapshots=evidence; };
  runtime.pending = () => pending;
  q._renderBlend = async () => { renders++; return null; };
  q._renderSubbeats = async () => null;
  q._pickStems = async () => { legacyPicks++; };
  q.verifyPushResolved = async () => {};
  const make = (id: string) => ({track:{id,title:id,artist:id,duration:240},sent:false,queuedAt:new Date().toISOString()});
  const current = (remaining: number) => ({track:{id:'live',duration:300},startedAt:new Date(Date.now()-(300-remaining)*1000).toISOString()});
  const consumer = setInterval(()=>{void rm(config.liquidsoap.queueFile,{force:true});},20);
  try {
    const previewItem=()=>({track:{id:'previous'},stemBlend:{regular:{envelopes:{outgoing:null,incoming:null}}}});
    q.current={...current(290),stemSeam:true};q.upcoming=[];q.history=[previewItem(),previewItem()];
    q.syncRegularStemPreparation();
    assert.ok(q.history[0].stemBlend.regular.envelopes,'previous preview survives the listener buffer');
    assert.equal(q.history[1].stemBlend.regular.envelopes,undefined,'older previews do not become a historical cache');
    q.current.startedAt=new Date(Date.now()-61000).toISOString();
    q.syncRegularStemPreparation();
    assert.equal(q.history[0].stemBlend.regular.envelopes,undefined,'previous preview retires after the buffer');
    q.history=[];
    q.current=current(180); q.upcoming=[make('a'),make('b')];
    await queue.drainToLiquidsoap();
    assert.equal(q.upcoming[0].sent,false);
    assert.equal(renders,0);
    assert.deepEqual(snapshots.map(item=>[item.id,item.sent,item.regularEligible]),[['a',false,true],['b',false,true]]);
    pending=false;
    await queue.drainToLiquidsoap();
    assert.equal(q.upcoming[0].sent,true);
    assert.equal(renders,1);
    assert.equal(legacyPicks,0,'audition tracks must not start legacy head+tail caching');
    pending=true; q.current=current(180); q.upcoming=[make('a'),make('b')];
    await queue.drainToLiquidsoap(true);
    assert.equal(q.upcoming[0].sent,true,'operator force never waits for CPU preparation');
    // Real pending() drops expired needs. The queue also has an independent
    // clock guard so a stale or faulty readiness adapter cannot delay music.
    q.current=current(40); q.upcoming=[make('a'),make('b')];
    await queue.drainToLiquidsoap();
    assert.equal(q.upcoming[0].sent,true,'hard deadline bypasses pending preparation');
    pending=false;
    await settings.update({audio:{analyzeQuietOnly:true}});
    q.current=current(180);q.upcoming=[make('a'),make('b')];
    await queue.drainToLiquidsoap();
    assert.equal(snapshots.every(item=>!item.regularEligible),true,'quiet-only analysis disables live preparation');
  } finally {
    runtime.update=originalUpdate; runtime.pending=originalPending;
    clearInterval(consumer);
    if(q._persistTimer) clearTimeout(q._persistTimer);
    if(q._recentPlaysTimer) clearTimeout(q._recentPlaysTimer);
    db.close();
  }
});
