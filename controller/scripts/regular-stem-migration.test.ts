import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

process.env.SUBWAVE_REGULAR_STEMS_ROLLOUT='working';
process.env.SUBWAVE_REGULAR_STEM_TEST_PAIRS='[]';
process.env.NAVIDROME_URL='http://127.0.0.1:9';

test('working rollout retains saved combinations and old files without legacy generation or eviction', async () => {
  let posts=0;
  const server=createServer((req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/health')res.end(JSON.stringify({ok:true,engines:['analyze'],analyze_demucs:true}));
    else {posts++;res.statusCode=500;res.end('{}');}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  process.env.ANALYZE_URL=`http://127.0.0.1:${address.port}`;
  const settings=await import('../src/settings.js');
  const {setCache}=await import('../src/settings/store.js');
  const library=await import('../src/music/library.js');
  const db=await import('../src/music/library-db.js');
  const cache=await import('../src/music/stem-cache.js');
  const pick=await import('../src/broadcast/pick-stems.js');
  const blend=await import('../src/broadcast/stem-blend.js');
  const {runAnalysisPass}=await import('../src/music/analyze.js');
  const {requestFor}=await import('../src/music/acoustics-plan.js');
  const {createSubbeatsStore}=await import('../src/music/subbeats-store.js');
  const {config}=await import('../src/config.js');
  const analyzer=await import('../src/music/analyzer.js');
  await settings.load();await library.load();
  const root=cache.dirFor('legacy');
  await mkdir(path.join(root,'subbeats','v1','kept'),{recursive:true});
  await writeFile(path.join(cache.stemsRoot(),cache.STEMS_MARKER),'{}');
  await writeFile(path.join(root,'tail-drums.flac'),'old regular stems');
  await writeFile(path.join(root,'subbeats','v1','kept','head-drums.flac'),'saved Sub/Beats');
  try {
    for(const stemCache of [false,true])for(const pickTimeStems of [false,true])for(const stemBlends of [false,true]) {
      await settings.update({audio:{stemCache},transitions:{pickTimeStems,stemBlends,subbeatsLive:true}});
      setCache(null);await settings.load();
      assert.equal(settings.get().audio.stemCache,stemCache);
      assert.equal(settings.get().transitions.pickTimeStems,pickTimeStems);
      assert.equal(settings.get().transitions.stemBlends,stemBlends);
      assert.equal(settings.get().transitions.subbeatsLive,true);
      const outcome=await pick.maybeSeparateAtPick({id:'legacy'},{pairDrainActive:true,held:true,log:()=>{}});
      assert.equal(outcome.ran,false);
      assert.equal(await blend.maybeRenderBlend({id:'legacy'},{id:'incoming'},180),null,'never use a legacy cache render');
    }
    assert.ok(blend.regularStemTestEnabled());assert.ok(blend.regularStemTestTrack('not-an-audition-id'));
    assert.equal(blend.regularStemTestStyle('a','b'),blend.regularStemTestStyle('a','b'));
    const walks=cache._cacheWalksForTests();
    assert.equal((await cache.sweep(0,{force:true})).skipped,'preserved');
    assert.equal(cache._cacheWalksForTests(),walks,'preservation does not walk a large old cache');
    const {runScheduledOrphanPurge}=await import('../src/music/orphan-purge.js');
    assert.equal((await runScheduledOrphanPurge(['legacy'])).refused,true);
    await cache.forgetStems(['legacy']);
    assert.equal(await readFile(path.join(root,'tail-drums.flac'),'utf8'),'old regular stems');
    assert.equal(await readFile(path.join(root,'subbeats','v1','kept','head-drums.flac'),'utf8'),'saved Sub/Beats');
    await assert.rejects(runAnalysisPass({plan:{where:{kind:'all'},facets:['stems'],inScope:1,
      items:[{id:'legacy',facets:['stems'],request:requestFor(['stems'])}],byFacet:[],rideAlong:[],warnings:[]}}),/on hold/);
    const store=createSubbeatsStore(config.stateDir);
    store.enqueue([{id:'dance',title:'Dance',artist:'Artist',album:'Album'}]);
    const output:string[]=[];const original=console.log;
    console.log=(...args:unknown[])=>{output.push(args.map(String).join(' '));};
    try {
      await runAnalysisPass({stemOnly:true,stemBackfill:true});
    } finally {console.log=original;}
    assert.ok(output.some(line=>line.includes('["dance"]')),'stem scan still releases queued Sub/Beats preparation');
    assert.equal(store.read().jobs[0].status,'queued','the analysis pass does not run the Sub/Beats worker itself');
    assert.equal(posts,0,'no regular extraction or render request');
  } finally {
    analyzer.shutdown();db.close();server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
