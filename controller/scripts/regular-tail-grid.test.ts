import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { BeatGridProvenance } from '../src/schemas/beat-grid.js';

const audio = Buffer.alloc(13 * 1024 * 1024, 3);
const sha256 = createHash('sha256').update(audio).digest('hex');
const grid = (start: number, end: number): BeatGridProvenance => ({version:1,
  backend:'beat-this-onnx',model:'small0',modelSha256:'a'.repeat(64),preprocessingVersion:1,
  windowStartMs:start,windowEndMs:end,evidence:{medianBpm:100,intervalSupport:1,librosaBeatSupport:null},
  source:{sha256,bytes:audio.length,complete:true}});

test('regular tail widening forwards the window, preserves ending measurements and rejects stale or short evidence', async () => {
  let mode: 'wide' | 'old' | 'changed' = 'wide';
  let calls=0, downloads=0;
  let beforeReply=()=>{};
  const server=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/health'){res.end(JSON.stringify({ok:true,engines:['analyze']}));return;}
    if (req.url !== '/analyze') { downloads++; res.setHeader('Content-Type','audio/flac'); res.end(audio); return; }
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=JSON.parse(raw);calls++;
    assert.ok(body.path); assert.equal(body.url,undefined); assert.equal(body.complete,true);
    if (body.facets[0] === 'head') {
      res.end(JSON.stringify({ok:true,facets:{head:{status:'ok',data:{beats:[1000],bars:[1000],grid_provenance:grid(0,40000)}}}})); return;
    }
    assert.deepEqual(body.facets,['tail']);assert.equal(body.tail_grid_seconds,60);
    assert.equal(body.tail_vocals,undefined);assert.equal(body.stems_dir,undefined);
    const measuredGrid=grid(mode==='old'?220000:180000,240000);
    if(mode==='changed') measuredGrid.source!.sha256='c'.repeat(64);
    beforeReply();
    res.end(JSON.stringify({ok:true,source:{complete:true,duration_s:240},facets:{tail:{status:'ok',data:{outro:{
      startMs:230000,ending:'cold',lufs:-4,bpm:100,beats:[181000,182000],
      bars:Array.from({length:20},(_,i)=>181000+3000*i),gridProvenance:measuredGrid,
    }}}}}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address && typeof address!=='string');
  process.env.ANALYZE_URL=`http://127.0.0.1:${address.port}`;
  process.env.NAVIDROME_URL=process.env.ANALYZE_URL;
  const library=await import('../src/music/library.js');
  const db=await import('../src/music/library-db.js');
  const tail=await import('../src/music/regular-tail-grid.js');
  await library.load();
  const old={startMs:235000,ending:'fade',lufs:-17,bpm:100,
    vocalRanges:[{startMs:222000,endMs:234000}],extra:'preserve',
    beats:[222000,223000],bars:[222000,225000,228000,231000,234000,237000],gridProvenance:grid(220000,240000)};
  const seed=(id:string,genres=['Rock'])=>{
    db.upsertTrackMeta(id,{title:'Track '+id,artist:'Artist',duration:240,genres,fileSize:audio.length});
    db.upsertTrackAnalysis(id,{bpm:120,beats:[1000],bars:[1000],gridProvenance:grid(0,40000)});
    db.getDb()!.prepare('UPDATE tracks SET outro_json=? WHERE id=?').run(JSON.stringify(old),id);
  };
  const rawOutro=(id:string)=>JSON.parse((db.getDb()!.prepare('SELECT outro_json FROM tracks WHERE id=?').get(id) as {outro_json:string}).outro_json);
  const messages:string[]=[];
  const sources=await import('../src/music/regular-stem-source.js');
  const measure=async(id:string)=>{
    sources.retainRegularStemSources(null,[id]);
    tail.ensureRegularTailGrid(id,m=>messages.push(m),()=>{});
    const until=Date.now()+10000;
    while(tail.regularTailGridPending(id) && Date.now()<until) await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(tail.regularTailGridPending(id),false,'grid job settled');
  };
  try {
    assert.equal(tail.regularTailGridSeconds({outro:null}),60);
    assert.equal(tail.regularTailGridSeconds({outro:{...old,ending:'fade',bars:[100000,112000],gridProvenance:grid(0,240000)}}),120);
    seed('ok');seed('other');seed('dance',['House']);
    assert.equal(tail.regularTailGridDue('dance'),false,'Sub/Beats admission reserves dance tracks');
    const headBefore=db.getTrack('ok')!.gridProvenance;
    const job=measure('ok');
    assert.equal(tail.regularTailGridPending('ok'),true);
    assert.equal(tail.regularTailGridDue('other'),false,'only one wider measurement at a time');
    await job;
    assert.match(messages.join('\n'),/tail grid ready/,messages.join('\n'));
    const saved=rawOutro('ok');
    for(const key of ['startMs','ending','lufs','bpm','vocalRanges','extra']) assert.deepEqual(saved[key],old[key as keyof typeof old]);
    assert.equal(saved.gridProvenance.windowStartMs,180000);
    assert.deepEqual(db.getTrack('ok')!.gridProvenance,headBefore);
    assert.equal(tail.regularTailGridDue('ok'),false,'completed coverage does not rescan on every queue tick');
    assert.match(messages.join('\n'),/tail grid ready for Track ok — Artist/);
    for(const failure of ['old','changed'] as const){
      mode=failure;seed(failure);await measure(failure);
      assert.deepEqual(rawOutro(failure),old);
      assert.equal(tail.regularTailGridDue(failure),false,'failure backs off');
    }
    mode='wide';seed('new-admission');beforeReply=()=>db.upsertTrackMeta('new-admission',{genres:['House']});
    await measure('new-admission');assert.deepEqual(rawOutro('new-admission'),old);
    beforeReply=()=>{};
    seed('missing-ending');
    db.getDb()!.prepare('UPDATE tracks SET outro_json=? WHERE id=?').run(JSON.stringify({extra:'keep'}),'missing-ending');
    await measure('missing-ending');
    assert.equal(rawOutro('missing-ending').extra,'keep');
    assert.equal(db.getTrack('missing-ending')!.outro?.startMs,230000,'a grid-only old outro gets real ending measurements');
    assert.equal(tail.regularTailGridDue('missing-ending'),false);
    assert.equal(calls,5);
    seed('prefix');
    const prefix=grid(0,40000);prefix.source!.complete=false;prefix.source!.bytes=12*1024*1024;
    db.upsertTrackAnalysis('prefix',{bpm:77,beats:[1000],bars:[1000],gridProvenance:prefix});
    await measure('prefix');
    assert.equal(db.getTrack('prefix')!.gridProvenance!.source!.complete,true);
    assert.equal(db.getTrack('prefix')!.bpm,77,'grid repair preserves legacy analysis');
    assert.equal(db.getTrack('prefix')!.outro!.gridProvenance!.source!.bytes,audio.length);
    assert.equal(downloads,6,'each track downloads once, including head repair plus tail');
    const reused=await sources.acquireRegularStemSource('prefix');await reused.release();
    assert.equal(downloads,6,'extraction reuses the complete source');
    sources.retainRegularStemSources(null,[]);
  } finally {
    db.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
