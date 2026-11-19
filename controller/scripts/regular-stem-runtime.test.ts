import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FacetRequestOpts } from '../src/music/analyzer.js';
import { regularStemNeeds, type RegularStemQueueEvidence } from '../src/broadcast/regular-stem-needs.js';
import { requireRegularStemSpace } from '../src/broadcast/regular-stem-space.js';
import type { BeatGridProvenance } from '../src/schemas/beat-grid.js';

test('real preparation owner orders tail/head, pauses for render, leases sources and ignores old cache', async () => {
  const audio = Buffer.alloc(2048,1);
  const fingerprint = createHash('sha256').update(audio).digest('hex');
  let hold=false;
  let rejectTail=false;
  let downloads=0;
  let held: {directory:string;window:NonNullable<FacetRequestOpts['regular_stem_window']>;response:ServerResponse} | undefined;
  let onHeld=()=>{},onClosed=()=>{};
  const posts: Array<{side:string;start_ms:number;end_ms:number}> = [];
  const server = createServer(async (req,res) => {
    if(req.url === '/health') {
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({ok:true,engines:['analyze'],analyze_regular_stems_version:2})); return;
    }
    if(req.url !== '/analyze') {
      downloads++;
      res.setHeader('Content-Type','audio/flac'); res.end(audio); return;
    }
    let raw=''; for await(const chunk of req) raw+=chunk;
    const request=JSON.parse(raw), window=request.regular_stem_window;
    assert.equal(request.stems_device,'cpu');
    assert.equal(window.source_sha256,fingerprint);
    assert.equal(window.source_bytes,audio.length);
    posts.push(window);
    if (rejectTail && window.side==='tail') {
      rejectTail=false; res.writeHead(500,{'Content-Type':'application/json'});
      res.end(JSON.stringify({detail:'decoded regular stem window is incomplete'})); return;
    }
    if(hold) {
      held={directory:request.stems_dir,window,response:res};
      res.on('close',()=>onClosed());onHeld();return;
    }
    const stamp={...window,device:'cpu',sample_rate:44100,
      samples:Math.round((window.end_ms-window.start_ms)*44.1),source:{duration_s:240}};
    for(const name of ['drums','bass','other','vocals']) await writeFile(path.join(request.stems_dir,`${window.side}-${name}.flac`),'fixture');
    await writeFile(path.join(request.stems_dir,`${window.side}-regular.json`),JSON.stringify(stamp));
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ok:true,source:{stems_device:'cpu'},facets:{stems:{status:'ok',data:{regular_window:stamp}}}}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address(); assert.ok(address && typeof address!=='string');
  process.env.ANALYZE_URL=`http://127.0.0.1:${address.port}`;
  process.env.NAVIDROME_URL=process.env.ANALYZE_URL;
  process.env.NAVIDROME_USER='u';process.env.NAVIDROME_PASS='p';
  const {config}=await import('../src/config.js');
  const analyzer=await import('../src/music/analyzer.js');
  const {RegularStemRuntime}=await import('../src/broadcast/regular-stem-runtime.js');
  const grid=(start:number,end:number):BeatGridProvenance=>({version:1,backend:'beat-this-onnx',model:'small0',
    modelSha256:'a'.repeat(64),preprocessingVersion:1,windowStartMs:start,windowEndMs:end,
    evidence:{medianBpm:100,intervalSupport:1,librosaBeatSupport:null},source:{sha256:fingerprint,bytes:audio.length,complete:true}});
  const track=(id:string):RegularStemQueueEvidence=>({id,label:`Title ${id} — Artist`,sent:false,remainingSec:180,regularEligible:true,
    subbeatsEligible:false,durationMs:240000,windDownMs:235000,
    bars:Array.from({length:12},(_,i)=>1000+i*2000),tailBars:Array.from({length:12},(_,i)=>200000+i*3000),
    headGrid:grid(0,40000),tailGrid:grid(190000,240000)});
  const only=(id:string,side:'head'|'tail'):RegularStemQueueEvidence=>({
    ...track(id),...(side==='head'?{tailGrid:null}:{headGrid:null}),
  });
  const old=path.join(config.stateDir,'stems','a');
  await mkdir(old,{recursive:true});await writeFile(path.join(old,'tail-drums.flac'),'old cache');
  let diskFull=false;
  const messages:string[]=[];
  const runtime=new RegularStemRuntime(async requests=>{
    if(diskFull) throw new Error('Insufficient free space');
    await requireRegularStemSpace(requests);
  });
  let wakes=0,done:()=>void=()=>{};
  const ready=new Promise<void>(resolve=>{done=resolve;});
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    runtime.update(null,[only('a','tail'),only('b','head')],()=>{if(++wakes===2)done();},message=>messages.push(message));
    await Promise.race([ready,new Promise<never>((_resolve,reject)=>{timeout=setTimeout(()=>reject(new Error('preparation did not settle')),10000);})]);
    assert.deepEqual(posts.map(p=>p.side),['tail','head']);
    assert.ok(messages.some(message=>message==='Regular stems: preparing Title a — Artist (tail, CPU)'));
    assert.ok(messages.some(message=>message.startsWith('Regular stems: Title b — Artist head ready;')));
    assert.equal(runtime.pending('a','b'),false);
    const windows=runtime.statusWindows();
    assert.ok(windows.some(window=>window.trackId==='a' && window.side==='tail' && window.state==='ready'));
    assert.ok(windows.some(window=>window.trackId==='b' && window.side==='head' && window.state==='ready'));
    assert.ok(windows.every(window=>Object.keys(window).sort().join(',')==='side,state,trackId'));

    diskFull=true;
    assert.equal(await runtime.sources('a','b'),null,'low space refuses render');
    diskFull=false;
    const sources=await runtime.sources('a','b');assert.ok(sources,'refused render releases its source leases');
    assert.notEqual(sources.tail.stemsDir,old);
    assert.equal(sources.valid(),true);
    runtime.update(null,[{...only('a','tail'),regularEligible:false},
      {...only('c','tail'),regularEligible:false},{...only('b','head'),regularEligible:false}],()=>{},()=>{});
    assert.equal(runtime.pair('a','b'),null,'matching reusable windows are not permission for a non-adjacent pair');
    assert.equal(sources.valid(),false,'reordering invalidates an in-flight render');
    runtime.update(null,[{...only('a','tail'),regularEligible:false,occurrence:'new-a'},
      {...only('b','head'),regularEligible:false,occurrence:'new-b'}],()=>{},()=>{});
    assert.equal(sources.valid(),false,'readding the same recordings does not revive the old seam');
    runtime.update(null,[],()=>{},()=>{});
    await access(sources.tail.stemsDir);
    await sources.release();
    await assert.rejects(access(sources.tail.stemsDir));
    assert.equal(await readFile(path.join(old,'tail-drums.flac'),'utf8'),'old cache');
    if(timeout)clearTimeout(timeout);

    // An explicit worker failure releases its busy stamp and cannot suppress
    // independent head extraction, including the next track's incoming role.
    rejectTail=true;
    const independent=new RegularStemRuntime();
    const independentEvidence=[only('broken','tail'),only('independent','head')];
    let settled=0,independentDone:()=>void=()=>{};
    const independentReady=new Promise<void>(resolve=>{independentDone=resolve;});
    independent.update(null,independentEvidence,()=>{if(++settled===2)independentDone();},()=>{});
    const independentTimeout=setTimeout(()=>independentDone(),4000);
    await independentReady;clearTimeout(independentTimeout);
    const independentNeeds=regularStemNeeds(independentEvidence,Date.now());
    assert.equal(independent.lane.state(independentNeeds[0].key),'failed');
    assert.equal(independent.lane.state(independentNeeds[1].key),'ready',
      'a rejected tail must not prevent the independent incoming head');
    await assert.rejects(access(path.join(path.dirname(independent.directory(independentNeeds[0])),'.regular-busy.json')));
    independent.update(null,[],()=>{},()=>{});

    // Low-space admission is a real preparation failure before fetching any
    // recording or submitting a CPU job, and cannot pin the queue as pending.
    for (const failAt of [1,2]) {
      let checks=0;
      const blocked = new RegularStemRuntime(async () => {
        if(++checks === failAt) throw new Error('Insufficient free space');
      });
      const beforeDownloads = downloads, beforePosts = posts.length;
      const evidence=only(`blocked-${failAt}`,'tail');
      let blockedDone:()=>void=()=>{};
      const blockedReady = new Promise<void>(resolve=>{blockedDone=resolve;});
      blocked.update(null,[evidence],()=>blockedDone(),()=>{});
      const blockedTimer = setTimeout(()=>blockedDone(),2000);
      await blockedReady;
      clearTimeout(blockedTimer);
      const need = regularStemNeeds([evidence],Date.now())[0];
      assert.equal(blocked.lane.state(need.key),'failed');
      assert.equal(downloads-beforeDownloads,failAt-1,'only the second check follows a download');
      assert.equal(posts.length,beforePosts,'neither failure submits a CPU job');
      await assert.rejects(access(path.join(config.stateDir,'analyze-tmp',`${evidence.id}.audio`)));
      await assert.rejects(access(path.join(path.dirname(blocked.directory(need)),'.regular-busy.json')));
      blocked.update(null,[],()=>{},()=>{});
    }

    // Real HTTP timeout: the controller loses the reply while the sidecar may
    // still be working. A fresh runtime must defer, not submit a second job.
    hold=true;
    const beforeSlowPosts=posts.length;
    const submitted=new Promise<void>(resolve=>{onHeld=resolve;});
    const closed=new Promise<void>(resolve=>{onClosed=resolve;});
    const slow=new RegularStemRuntime();
    let oldWakes=0;
    slow.update(null,[{...only('slow','tail'),remainingSec:56}],()=>{oldWakes++;},()=>{});
    const limit=new Promise<never>((_resolve,reject)=>{timeout=setTimeout(()=>reject(new Error('timeout recovery did not settle')),5000);});
    await Promise.race([submitted,limit]);
    await Promise.race([closed,limit]);
    assert.ok(held);
    const busy=path.join(path.dirname(held.directory),'.regular-busy.json');
    assert.ok(JSON.parse(await readFile(busy,'utf8')).until>Date.now());
    const restarted=new RegularStemRuntime();
    const evidence=only('slow','tail');
    const key=regularStemNeeds([evidence],Date.now())[0].key;
    let recovered:()=>void=()=>{};
    const recoveryReady=new Promise<void>(resolve=>{recovered=resolve;});
    restarted.update(null,[evidence],()=>recovered(),()=>{});
    const deferred=async()=>{
      const until=Date.now()+4000;
      while(restarted.lane.state(key)!=='pending') {
        if(Date.now()>until)throw new Error('restarted preparation did not defer');
        await new Promise(resolve=>setTimeout(resolve,5));
      }
    };
    await Promise.race([deferred(),limit]);
    assert.equal(posts.length,beforeSlowPosts+1,'restart does not overlap a timed-out sidecar job');
    assert.equal(oldWakes,0,'a completion past the deadline cannot wake the old seam');
    // Late partial output is retained safely, but cannot be treated as ready.
    await writeFile(path.join(held.directory,'tail-drums.flac'),'late partial');
    await writeFile(busy,JSON.stringify({until:Date.now()-1}));
    hold=false;held.response.destroy();
    restarted.update(null,[evidence],()=>recovered(),()=>{});
    await Promise.race([recoveryReady,limit]);
    assert.equal(posts.length,beforeSlowPosts+2,'expired lease permits one fresh extraction');
    assert.equal(restarted.lane.state(key),'ready');
    assert.equal(await readFile(path.join(held.directory,'tail-drums.flac'),'utf8'),'fixture');
    await assert.rejects(access(busy));
    slow.update(null,[],()=>{},()=>{});
    restarted.update(null,[],()=>{},()=>{});
  } finally {
    if(timeout)clearTimeout(timeout);
    runtime.update(null,[],()=>{},()=>{});
    analyzer.shutdown();server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});

test('nearest pair gets outgoing tail then incoming head; a pending grid holds only admitted seams', async () => {
  const {RegularStemRuntime}=await import('../src/broadcast/regular-stem-runtime.js');
  const runtime=new RegularStemRuntime();
  runtime.lane.update=()=>{};
  const grid=(start:number,end:number):BeatGridProvenance=>({version:1,backend:'beat-this-onnx',model:'small0',
    modelSha256:'a'.repeat(64),preprocessingVersion:1,windowStartMs:start,windowEndMs:end,
    evidence:{medianBpm:100,intervalSupport:1,librosaBeatSupport:null},source:{sha256:'b'.repeat(64),bytes:12345,complete:true}});
  const track=(id:string):RegularStemQueueEvidence=>({id,sent:false,remainingSec:180,regularEligible:true,
    subbeatsEligible:false,durationMs:240000,windDownMs:235000,bars:[1000],tailBars:[222000],
    headGrid:grid(0,40000),tailGrid:grid(180000,240000)});
  runtime.update(null,[track('priority-a'),track('priority-b'),track('priority-c')],()=>{},()=>{});
  assert.deepEqual(runtime.statusWindows().slice(0,2).map(n=>[n.trackId,n.side]),
    [['priority-a','tail'],['priority-b','head']]);
  assert.equal(runtime.statusWindows().length,6,'remaining roles still prepare independently');
  runtime.update(null,[{...track('priority-a'),tailGridPending:true},track('priority-b')],()=>{},()=>{});
  assert.equal(runtime.pending('priority-a','priority-b'),true);
  assert.equal(runtime.statusWindows().some(n=>n.trackId==='priority-a' && n.side==='tail'),false);
  runtime.update(null,[track('priority-a'),{...track('priority-b'),headGrid:null,headGridPending:true}],()=>{},()=>{});
  assert.equal(runtime.pending('priority-a','priority-b'),true,'incoming grid upgrade holds before head evidence exists');
  runtime.update(null,[{...track('priority-a'),tailGridPending:true,pairToNextAllowed:false},track('priority-b')],()=>{},()=>{});
  assert.equal(runtime.pending('priority-a','priority-b'),false,'tempo/style vetoes never wait for a grid');
  runtime.update(null,[],()=>{},()=>{});
});
