import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RegularStemQueueEvidence } from '../src/broadcast/regular-stem-needs.js';
import type { BeatGridProvenance } from '../src/schemas/beat-grid.js';

test('real preparation owner orders tail/head, pauses for render, leases sources and ignores old cache', async () => {
  const audio = Buffer.alloc(2048,1);
  const fingerprint = createHash('sha256').update(audio).digest('hex');
  const posts: Array<{side:string;start_ms:number;end_ms:number}> = [];
  const server = createServer(async (req,res) => {
    if(req.url === '/health') {
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({ok:true,engines:['analyze'],analyze_regular_stems_version:2})); return;
    }
    if(req.url !== '/analyze') {
      res.setHeader('Content-Type','audio/flac'); res.end(audio); return;
    }
    let raw=''; for await(const chunk of req) raw+=chunk;
    const request=JSON.parse(raw), window=request.regular_stem_window;
    assert.equal(request.stems_device,'cpu');
    assert.equal(window.source_sha256,fingerprint);
    assert.equal(window.source_bytes,audio.length);
    posts.push(window);
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
  const track=(id:string):RegularStemQueueEvidence=>({id,sent:false,remainingSec:180,regularEligible:true,
    subbeatsEligible:false,durationMs:240000,windDownMs:235000,
    bars:Array.from({length:12},(_,i)=>1000+i*2000),tailBars:Array.from({length:12},(_,i)=>200000+i*3000),
    headGrid:grid(0,40000),tailGrid:grid(190000,240000)});
  const old=path.join(config.stateDir,'stems','a');
  await mkdir(old,{recursive:true});await writeFile(path.join(old,'tail-drums.flac'),'old cache');
  const runtime=new RegularStemRuntime();
  let wakes=0,done:()=>void=()=>{};
  const ready=new Promise<void>(resolve=>{done=resolve;});
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    runtime.update(null,[track('a'),track('b')],()=>{if(++wakes===2)done();},()=>{});
    await Promise.race([ready,new Promise<never>((_resolve,reject)=>{timeout=setTimeout(()=>reject(new Error('preparation did not settle')),5000);})]);
    assert.deepEqual(posts.map(p=>p.side),['tail','head']);
    assert.equal(runtime.pending('a','b'),false);
    const sources=await runtime.sources('a','b');assert.ok(sources);
    assert.notEqual(sources.tail.stemsDir,old);
    runtime.update(null,[],()=>{},()=>{});
    await access(sources.tail.stemsDir);
    await sources.release();
    await assert.rejects(access(sources.tail.stemsDir));
    assert.equal(await readFile(path.join(old,'tail-drums.flac'),'utf8'),'old cache');
  } finally {
    if(timeout)clearTimeout(timeout);
    runtime.update(null,[],()=>{},()=>{});
    analyzer.shutdown();server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
