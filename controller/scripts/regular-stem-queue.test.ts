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
const { regularStemRuntime: runtime, RegularStemRuntime } = await import('../src/broadcast/regular-stem-runtime.js');
const { config } = await import('../src/config.js');

test('queue snapshots prepare in background, pending work holds only before deadline, force bypasses hold', async () => {
  await settings.load(); await library.load();
  await settings.update({ personas: settings.get().personas.map(p=>({...p,djMode:true})),
    transitions:{pairDrain:true,stemBlends:true,pickTimeStems:true} });
  for (const id of ['a','b']) {
    db.upsertTrackMeta(id,{title:id,artist:id,genres:['Rock'],duration:240});
    db.upsertTrackAnalysis(id,{bpm:id==='a'?63:143.6,beats:[500,1000],bars:[1000],gridProvenance:{
      version:1,backend:'beat-this-onnx',model:'small0',modelSha256:'a'.repeat(64),
      preprocessingVersion:1,windowStartMs:0,windowEndMs:40000,
      evidence:{medianBpm:80,intervalSupport:1,librosaBeatSupport:null},
      source:{sha256:'b'.repeat(64),bytes:12345,complete:true},
    }});
    const grid=db.getTrack(id)!.gridProvenance!;
    db.getDb()!.prepare('UPDATE tracks SET outro_json=? WHERE id=?').run(JSON.stringify({
      startMs:235000,ending:'cold',bpm:id==='a'?63:143.6,
      bars:[200000,203000,206000],gridProvenance:{...grid,windowStartMs:180000,windowEndMs:240000},
    }),id);
  }
  const q = queue as any;
  let snapshots: readonly RegularStemQueueEvidence[] = [];
  let pending = true, renders = 0, legacyPicks = 0;
  const originalUpdate = runtime.update, originalPending = runtime.pending;
  runtime.update = (_current, evidence) => { snapshots=evidence; };
  runtime.pending = () => pending;
  q._renderBlend = async (_out: unknown, _incoming: unknown, _remaining: unknown, opts: { regularStyle?: string; log?: (kind: 'warn', message: string) => void }) => {
    assert.ok(['drums-late','rhythm-late','vocals-late'].includes(opts.regularStyle ?? ''),
      'the queue must select the working renderer rather than silently returning before sources are read');
    assert.equal(typeof opts.log,'function','fallback reasons reach the station log');
    renders++; return null;
  };
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
    process.env.SUBWAVE_REGULAR_STEMS_ROLLOUT='working';
    process.env.SUBWAVE_REGULAR_STEM_TEST_PAIRS='[]';
    q.current=current(180);q.upcoming=[make('a'),make('b')];
    await queue.drainToLiquidsoap();
    assert.equal(snapshots.every(item=>item.regularEligible),true,'working mode needs no exact-ID allowlist');
    assert.equal(q.upcoming[0].sent,false,'all-pair rollout still respects pending preparation');
    delete process.env.SUBWAVE_REGULAR_STEMS_ROLLOUT;
    process.env.SUBWAVE_REGULAR_STEM_TEST_PAIRS=JSON.stringify([{out:'a',in:'b'}]);
    q.current=current(180); q.upcoming=[make('a'),make('b')];
    await queue.drainToLiquidsoap();
    assert.equal(q.upcoming[0].sent,false);
    assert.equal(renders,0);
    assert.deepEqual(snapshots.map(item=>[item.id,item.sent,item.regularEligible]),[['a',false,true],['b',false,true]]);
    assert.equal(snapshots[0].label,'a — a','preparation logs receive the queued title and artist');
    assert.equal(snapshots[0].pairToNextAllowed,true,'legacy BPM differences do not affect regular blend admission');
    const originalGrid=db.getTrack('b')!.gridProvenance!;
    db.upsertTrackAnalysis('b',{bpm:143.6,beats:[500,1000],bars:[1000],gridProvenance:{...originalGrid,evidence:{...originalGrid.evidence,medianBpm:120}}});
    q.syncRegularStemPreparation();
    assert.equal(snapshots[0].pairToNextAllowed,true,'BPM differences do not veto regular blends');
    assert.equal(snapshots.every(item=>item.regularEligible),true,'pair admission remains separate from independent extraction');
    db.upsertTrackAnalysis('b',{bpm:143.6,beats:[500,1000],bars:[1000],gridProvenance:originalGrid});
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
    await settings.update({audio:{analyzeQuietOnly:false}});
    pending=true;q.current=current(180);q.upcoming=[make('a'),make('b')];
    db.getDb()!.prepare('UPDATE tracks SET outro_json=NULL WHERE id=?').run('a');
    const originalDrain=q.drainToLiquidsoap;
    let settled=()=>{};
    const gridSettled=new Promise<void>(resolve=>{settled=resolve;});
    q.drainToLiquidsoap=async()=>{settled();};
    let gridTimer:ReturnType<typeof setTimeout> | undefined;
    try {
      q.syncRegularStemPreparation();
      assert.equal(snapshots[0].tailGridPending,true);
      assert.equal(snapshots[0].pairToNextAllowed,true,'missing old tail BPM waits for the wider measurement before pair judgement');
      await Promise.race([gridSettled,new Promise<never>((_resolve,reject)=>{
        gridTimer=setTimeout(()=>reject(new Error('background grid measurement did not settle')),10000);
      })]);
    } finally {clearTimeout(gridTimer);q.drainToLiquidsoap=originalDrain;}
    q.drainToLiquidsoap=async()=>{};
    db.getDb()!.prepare('UPDATE tracks SET grid_provenance_json=NULL WHERE id=?').run('b');
    q.current=current(180);q.upcoming=[make('a'),make('b')];
    q.syncRegularStemPreparation();
    assert.equal(snapshots[1].headGridPending,true,'incoming head upgrade remains pending before extraction');
    assert.equal(snapshots[0].pairToNextAllowed,true);
    const probe=new RegularStemRuntime();probe.lane.update=()=>{};
    probe.update(null,snapshots,()=>{},()=>{});
    assert.equal(probe.pending('a','b'),true,'the queue evidence holds the real sender readiness gate');
    probe.update(null,[],()=>{},()=>{});
    // Allow the deliberately unavailable background analyzer to settle.
    const until=Date.now()+10000;
    const grids=await import('../src/music/regular-tail-grid.js');
    while(grids.regularTailGridPending('b') && Date.now()<until) await new Promise(resolve=>setTimeout(resolve,10));
    q.drainToLiquidsoap=originalDrain;

  } finally {
    runtime.update=originalUpdate; runtime.pending=originalPending;
    clearInterval(consumer);
    if(q._persistTimer) clearTimeout(q._persistTimer);
    if(q._recentPlaysTimer) clearTimeout(q._recentPlaysTimer);
    db.close();
  }
});
