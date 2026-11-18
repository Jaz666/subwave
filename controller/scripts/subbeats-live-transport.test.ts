import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { after, test } from 'node:test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTempDir, removeTempDir } from './test-utils/temp-dir.js';
import type { subbeatsLiveRenderRequestSchema } from '../src/schemas/subbeats.js';

const root=createTempDir(join(tmpdir(),'subwave-live-transports-'));
process.env.STATE_DIR=root;
const {config}=await import('../src/config.js');
const analyzer=await import('../src/music/analyzer.js');
after(async () => {analyzer.shutdown();await removeTempDir(root);});

function request(): ReturnType<typeof subbeatsLiveRenderRequestSchema.parse> {
  return {version:1,transitionId:'22222222-2222-4222-8222-222222222222',deadlineMs:Date.now()+5000,
    stateDir:root,cacheId:'isolated-transport-fixture',stemsRoot:join(root,'stems'),outgoingId:'out',incomingId:'in',
    jobs:['out','in'].map(id => ({id,title:id,artist:'Fixture',album:'',status:'prepared',attempts:1,
      bundleKey:'a'.repeat(64),error:null,updatedAt:'fixture'})),
    sourceUrls:['https://fixture.invalid/out','https://fixture.invalid/in'],gainsDb:[0,0],
    mixStyle:'short-exchange',evidenceFingerprint:'a'.repeat(64)};
}

test('sidecar live transport validates identity, declines old endpoints and bounds slow bodies', async () => {
  let mode='valid';
  const server=createServer(async (req,res) => {
    res.setHeader('content-type','application/json');
    if (req.url==='/health') {
      res.end(JSON.stringify({ok:true,engines:['analyze'],analyze_subbeats_capable:true,
        analyze_subbeats_cache_version:2,analyze_subbeats_suitability_version:1}));return;
    }
    let raw='';for await (const chunk of req) raw+=chunk;
    const body=JSON.parse(raw);
    if (mode==='missing') {res.statusCode=404;res.end('{}');return;}
    const answer={version:1,status:'unavailable',reason:'isolated fixture',transitionId:body.transitionId,
      mixStyle:body.mixStyle,evidenceFingerprint:mode==='wrong' ? 'b'.repeat(64) : body.evidenceFingerprint};
    if (mode==='slow') setTimeout(() => res.end(JSON.stringify(answer)),100);
    else res.end(JSON.stringify(answer));
  });
  const urls=config.analyzer.urls;
  try {
    server.listen(0,'127.0.0.1');await once(server,'listening');
    const address=server.address();assert.ok(address && typeof address==='object');
    config.analyzer.urls=[`http://127.0.0.1:${address.port}`];analyzer._resetBackendCacheForTests();
    assert.equal(await analyzer.subbeatsAvailable(),true);
    assert.equal((await analyzer.renderSubbeatsLive(request(),new AbortController().signal)).status,'unavailable');
    mode='wrong';await assert.rejects(analyzer.renderSubbeatsLive(request(),new AbortController().signal),/stale|another pair/);
    mode='missing';await assert.rejects(analyzer.renderSubbeatsLive(request(),new AbortController().signal),/unavailable/);
    mode='slow';const short=request();short.deadlineMs=Date.now()+30;
    await assert.rejects(analyzer.renderSubbeatsLive(short,new AbortController().signal));
  } finally {
    config.analyzer.urls=urls;analyzer._resetBackendCacheForTests();
    server.closeAllConnections();await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('local live transport uses a one-shot process and kills a decoder grandchild at deadline', async () => {
  const saved={python:config.analyzer.python,workerScript:config.analyzer.workerScript,urls:config.analyzer.urls};
  const worker=join(root,'analyze_worker.py'), live=join(root,'subbeats_live.py'), pidfile=join(root,'child-pid');
  writeFileSync(worker,"import json,sys\nprint(json.dumps(dict(ready=True,subbeats_capable=True,subbeats_cache_version=2,subbeats_suitability_version=1)),flush=True)\nfor line in sys.stdin: pass\n");
  writeFileSync(live,"import json,sys\nr=json.loads(sys.stdin.readline())\nprint(json.dumps(dict(version=1,status='unavailable',reason='fixture',transitionId=r['transitionId'],mixStyle=r['mixStyle'],evidenceFingerprint=r['evidenceFingerprint'])))\n");
  try {
    config.analyzer.urls=[];config.analyzer.python='/usr/bin/python3';config.analyzer.workerScript=worker;
    analyzer._resetBackendCacheForTests();
    assert.equal(await analyzer.subbeatsAvailable(),true);
    assert.equal((await analyzer.renderSubbeatsLive(request(),new AbortController().signal)).status,'unavailable');
    writeFileSync(live,"import json,pathlib,subprocess,sys,time\nr=json.loads(sys.stdin.readline())\np=subprocess.Popen([sys.executable,'-c','import time; time.sleep(30)'])\n(pathlib.Path(r['stateDir'])/'child-pid').write_text(str(p.pid))\ntime.sleep(30)\n");
    const short=request();short.deadlineMs=Date.now()+250;
    const started=Date.now();
    await assert.rejects(analyzer.renderSubbeatsLive(short,new AbortController().signal),/budget/);
    assert.ok(Date.now()-started<2000,'a decoder cannot keep stdout or CPU alive after the parent deadline');
    const pid=Number(readFileSync(pidfile,'utf8')),stat=`/proc/${pid}/stat`;
    assert.ok(!existsSync(stat) || readFileSync(stat,'utf8').split(' ')[2]==='Z');
  } finally {
    analyzer.shutdown();Object.assign(config.analyzer,saved);analyzer._resetBackendCacheForTests();
    if (existsSync(pidfile)) try {process.kill(Number(readFileSync(pidfile,'utf8')),'SIGKILL');} catch { /* exited */ }
  }
});
