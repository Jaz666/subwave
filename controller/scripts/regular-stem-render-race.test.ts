import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

test('finished renders are rejected and removed if queue occurrence or library evidence changes', async () => {
  let change: () => void = () => {};
  let clipPath='';
  let renderError: string | null = null;
  const server=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/health') {res.end(JSON.stringify({ok:true,engines:['analyze']}));return;}
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=JSON.parse(raw);
    assert.equal(body.out.regular_key,'tail-proof');
    assert.equal(body.in.regular_key,'head-proof');
    if (renderError) { res.end(JSON.stringify({ok:false,error:renderError})); return; }
    clipPath=path.join(body.out_dir,body.clip_name);
    await mkdir(body.out_dir,{recursive:true});await writeFile(clipPath,'rendered seam');
    change();
    res.end(JSON.stringify({ok:true,path:clipPath,blend_start_sec:209,in_cue_sec:25,clip_sec:24,
      regular_style:body.regular_style}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address && typeof address!=='string');
  process.env.ANALYZE_URL=`http://127.0.0.1:${address.port}`;
  const library=await import('../src/music/library.js');
  const db=await import('../src/music/library-db.js');
  const settings=await import('../src/settings.js');
  const analyzer=await import('../src/music/analyzer.js');
  const {regularStemRuntime:runtime}=await import('../src/broadcast/regular-stem-runtime.js');
  const {maybeRenderBlend}=await import('../src/broadcast/stem-blend.js');
  await library.load();await settings.load();
  await settings.update({personas:settings.get().personas.map(p=>({...p,djMode:true})),
    transitions:{stemBlends:true,pairDrain:true},loudness:{source:'measured'}});
  for(const id of ['out','in']) {
    db.upsertTrackMeta(id,{title:id,artist:id,duration:240,genres:['Rock']});
    db.upsertTrackAnalysis(id,{bpm:80,bars:Array.from({length:12},(_,i)=>1000+i*2000),
      loudnessLufs:-14,peakDb:-2});
  }
  db.getDb()!.prepare('UPDATE tracks SET outro_json=? WHERE id=?')
    .run(JSON.stringify({startMs:235000,ending:'cold',bars:Array.from({length:12},(_,i)=>200000+i*3000)}),'out');
  let pairValid=true;
  const releases:boolean[]=[];
  const original=runtime.sources;
  runtime.sources=async()=>({valid:()=>pairValid,
    tail:{stemsDir:'/test/working/out',regularKey:'tail-proof'},head:{stemsDir:'/test/working/in',regularKey:'head-proof'},
    release:async(completed=true)=>{releases.push(completed);}});
  try {
    for(const scenario of ['unchanged','queue','analysis','admission']) {
      pairValid=true;
      db.upsertTrackMeta('in',{genres:['Rock']});
      db.upsertTrackAnalysis('in',{bpm:80,bars:Array.from({length:12},(_,i)=>1000+i*2000),loudnessLufs:-14,peakDb:-2});
      change=()=>{
        if(scenario==='queue')pairValid=false;
        if(scenario==='analysis')db.upsertTrackAnalysis('in',{bpm:81});
        if(scenario==='admission') {
          db.upsertTrackMeta('in',{genres:['House']});db.upsertTrackAnalysis('in',{bpm:120});
        }
      };
      const messages:string[]=[];
      const result=await maybeRenderBlend({id:'out',gainDb:0},{id:'in'},180,
        {regularStyle:'drums-late',log:(_kind,message)=>messages.push(message)});
      assert.equal(releases.at(-1),true,`finished worker releases protection (${scenario}): ${messages.join('; ')}`);
      if(scenario==='unchanged') {assert.ok(result);await access(clipPath);await rm(clipPath);}
      else {assert.equal(result,null);await assert.rejects(access(clipPath));assert.match(messages.join('\n'),/changed during render/);}
    }
    db.upsertTrackMeta('in',{genres:['Rock']});
    db.upsertTrackAnalysis('in',{bpm:80,bars:Array.from({length:12},(_,i)=>1000+i*2000),loudnessLufs:-14,peakDb:-2});
    pairValid=true; change=()=>{};
    renderError='no-usable-out-eight-bar-window';
    const messages:string[]=[];
    assert.equal(await maybeRenderBlend({id:'out',gainDb:0},{id:'in'},180,
      {regularStyle:'drums-late',log:(_kind,message)=>messages.push(message)}),null);
    assert.match(messages.join('\n'),/Regular stems fallback: no-usable-out-eight-bar-window/,
      'the worker rejection must reach the station instead of disappearing into an ordinary transition');
    messages.length=0;
    db.upsertTrackAnalysis('in',{bars:[1000,3000,5000]});
    assert.equal(await maybeRenderBlend({id:'out',gainDb:0},{id:'in'},180,
      {regularStyle:'drums-late',log:(_kind,message)=>messages.push(message)}),null);
    assert.match(messages.join('\n'),/eight bars need nine markers \(outgoing 12, incoming 3\)/);
  } finally {
    runtime.sources=original;analyzer.shutdown();db.close();server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
