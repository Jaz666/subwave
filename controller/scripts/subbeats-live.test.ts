import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { listen } from './test-utils/http.js';
import { deferred } from './test-utils/async.js';
import { createTempDir, removeTempDir } from './test-utils/temp-dir.js';
import { subbeatsPlaybackSeconds, subbeatsSourceSeconds, subbeatsEntryMs, type SubbeatsTiming, type SubbeatsPlayback } from '../src/broadcast/subbeats-clock.js';
import { clipSeamCues } from '../src/broadcast/stem-seam.js';

const root = createTempDir(join(tmpdir(),'subwave-subbeats-live-'));
process.env.STATE_DIR = root;
const settings = await import('../src/settings.js');
const { coldLoadSettings } = await import('./test-utils/settings.js');
const { queue } = await import('../src/broadcast/queue.js');
const { config } = await import('../src/config.js');
const library = await import('../src/music/library.js');
const { toPublicLyricsPayload } = await import('../src/music/lyrics-public.js');
type Item = Parameters<typeof queue.playableSecOf>[0];

after(async () => {
  if (queue._persistTimer) clearTimeout(queue._persistTimer);
  if (queue._recentPlaysTimer) clearTimeout(queue._recentPlaysTimer);
  library.shutdown();await removeTempDir(root);
});

function timing(rate = 1.04, loop = false): SubbeatsTiming {
  const sr = 44100, releaseEnd = rate === 1 ? 30 : 34;
  return {sampleRate:44100,outgoingStartSample:180*sr+17,incomingEntryFrame:8*sr,
    handoverFrame:24*sr,outgoingEndFrame:30*sr,incomingRate:rate,releaseCurve:'linear-rate',
    releaseStartFrame:30*sr,releaseEndFrame:releaseEnd*sr,clipFrames:(releaseEnd+2)*sr,
    incomingResumeSample:Math.round((rate*22+(rate+1)*.5*(releaseEnd-30)+2-(loop ? 4 : 0))*sr),
    ...(loop ? {loop:{startSample:4*sr,lengthSamples:2*sr,repeats:2 as const}} : {})};
}

function playback(t = timing()): SubbeatsPlayback {
  return {version:1,transitionId:'11111111-1111-4111-8111-111111111111',outgoingId:'out',incomingId:'in',
    evidenceFingerprint:'a'.repeat(64),mixStyle:'short-exchange',timing:t,
    loudnessSettings:JSON.stringify(settings.get().loudness),gainsDb:[-2,-3],
    clipPath:join(root,'in.wav'),leadPath:join(root,'out.wav'),incomingDurationSeconds:300};
}

test('live switch defaults off and survives a real cold load independently of Stem Blend', async () => {
  assert.equal((await coldLoadSettings({})).transitions.subbeatsLive,false);
  await settings.update({transitions:{subbeatsLive:true,stemBlends:false}});
  const stored = JSON.parse(readFileSync(join(config.stateDir,'settings.json'),'utf8'));
  const restored = await coldLoadSettings(stored);
  assert.equal(restored.transitions.subbeatsLive,true);
  assert.equal(restored.transitions.stemBlends,false);
  assert.equal((await coldLoadSettings({transitions:{subbeatsLive:'yes'}})).transitions.subbeatsLive,false);
});

test('live-disabled policy does no evidence or render work', async () => {
  await coldLoadSettings({});
  const { maybeRenderSubbeats } = await import('../src/broadcast/subbeats.js');
  assert.equal(await maybeRenderSubbeats({id:'out'},{id:'in'},300,{
    valid:() => {throw new Error('off must return before this gate');},
    log:() => {throw new Error('off must not emit per-pair diagnostics');},
  }),null);
});

test('live successor picks reserve selection plus render time without extending the queue', async () => {
  const { subbeatsPickLeadSeconds } = await import('../src/broadcast/subbeats.js');
  const { HARD_DEADLINE_SEC } = await import('../src/broadcast/drain-policy.js');
  assert.equal(subbeatsPickLeadSeconds(120_000), 250);
  assert.equal(subbeatsPickLeadSeconds(30_000), 160);
  assert.equal(subbeatsPickLeadSeconds(300_000), 250, 'the live render stays capped at two minutes');
  const saved = { current: queue.current, upcoming: queue.upcoming, run: queue.runPickCycle,
    gate: queue.pickGateClosed, busy: queue.pickerBusy, last: queue._deadlinePickAt };
  const picked: unknown[] = [];
  try {
    await settings.update({ transitions: { pairDrain: true, subbeatsLive: false },
      personas: settings.get().personas.map(p => ({ ...p, djMode: true })) });
    queue.current = { track: { id: 'air', duration: 300 }, startedAt: new Date(Date.now() - 120_000).toISOString(), source: 'ai' };
    const held: Item = { track: { id: 'held', duration: 300 }, sent: false };
    queue.upcoming = [held]; queue.pickerBusy = false; queue._deadlinePickAt = 0;
    queue.pickGateClosed = () => null;
    queue.runPickCycle = opts => { picked.push(opts); };
    queue.maybeDeadlinePick();
    assert.equal(picked.length, 0, 'ordinary transitions keep the two-minute window');
    await settings.update({ transitions: { subbeatsLive: true } });
    queue.maybeDeadlinePick();
    assert.deepEqual(picked, [{ isAutonomous: true, pickAnchorItem: held }]);
    queue.maybeDeadlinePick();
    assert.equal(picked.length, 1, 'the existing retry cooldown still applies');
    queue._deadlinePickAt = 0; held.sent = true;
    queue.maybeDeadlinePick();
    assert.equal(picked.length, 1, 'a sent head does not grow the queue');
    held.sent = false;
    queue.current.startedAt = new Date(Date.now() - (300 - HARD_DEADLINE_SEC + 1) * 1000).toISOString();
    queue.maybeDeadlinePick();
    assert.equal(picked.length, 1, 'the hard deadline is preserved');
  } finally {
    queue.current = saved.current; queue.upcoming = saved.upcoming; queue.runPickCycle = saved.run;
    queue.pickGateClosed = saved.gate; queue.pickerBusy = saved.busy; queue._deadlinePickAt = saved.last;
  }
});

test('Python split, process-group deadlines and sidecar route use the production helpers', () => {
  for (const file of ['subbeats_live_test.py','analyzer_sidecar_contract_test.py']) {
    const run = spawnSync('python3',[fileURLToPath(new URL(`./${file}`,import.meta.url))],{encoding:'utf8',timeout:15000});
    assert.equal(run.status,0,run.stdout+run.stderr);
  }
});

test('source/playback clocks agree before, through and after both directions of release and a drum loop', () => {
  for (const rate of [1,.92,1.08]) for (const loop of [false,true]) {
    const t = timing(rate,loop);
    for (const source of [0,1,3.9,6,10,20,26,30,80,299]) {
      const elapsed = subbeatsPlaybackSeconds(t,source);
      assert.ok(Math.abs(subbeatsSourceSeconds(t,elapsed)-source)<1/44100,`${rate}/${loop}/${source}`);
    }
    assert.ok(Math.abs(subbeatsPlaybackSeconds(t,t.incomingResumeSample/44100)
      -(t.clipFrames-t.incomingEntryFrame)/44100)<1/44100);
  }
});

test('lyrics stay on elapsed playback time with the existing operator offset, including history replies', () => {
  const t = timing(1.08,true);
  for (const offsetMs of [-2000,0,2000]) {
    const payload = toPublicLyricsPayload('in',{synced:true,lines:[{startMs:16000,text:'A line'}]}, {
      offsetMs,playbackTimeMs:ms => subbeatsPlaybackSeconds(t,ms/1000)*1000,
    });
    assert.equal(payload.offsetMs,offsetMs);
    assert.equal(payload.lines[0].startMs!-offsetMs,subbeatsPlaybackSeconds(t,(16000-offsetMs)/1000)*1000);
  }
});

test('the logical outgoing end and incoming native resume use the same source clock', async () => {
  await settings.load();
  const p = playback();
  const outgoing: Item = {track:{id:'out',duration:220},cueOutSec:180.3,
    stemBlend:{clipPath:p.clipPath,leadPath:p.leadPath!,subbeats:p,outCueSec:180.3,inCueSec:28.66}};
  const incoming: Item = {track:{id:'in',duration:300},stemSeam:true,cueInSec:28.66,subbeatsHandoff:p};
  assert.equal(queue.playableSecOf(outgoing),(p.timing.outgoingStartSample+p.timing.incomingEntryFrame)/44100);
  assert.equal(queue.playableSecOf(incoming),subbeatsPlaybackSeconds(p.timing,300));
  // A consecutive incoming->next cut is measured from this entry, rather than
  // adding a head-skip or paying the tempo map twice.
  incoming.stemBlend = {...outgoing.stemBlend!,subbeats:{...p,timing:{...p.timing,outgoingStartSample:200*44100}}};
  assert.equal(queue.playableSecOf(incoming),subbeatsPlaybackSeconds(p.timing,208));
});

test('live cues retain exact sample positions; ordinary millisecond cues remain compatible', () => {
  const t = timing();
  const render = {blendStartSec:t.outgoingStartSample/44100,inCueSec:t.incomingResumeSample/44100};
  const exact = clipSeamCues(render,.3,44100);
  assert.equal(Math.round(exact.outCueSec*44100),t.outgoingStartSample+13230);
  assert.equal(Math.round(exact.inCueSec*44100),t.incomingResumeSample-13230);
  assert.equal(clipSeamCues(render).outCueSec,Math.round((render.blendStartSec+.3)*1000)/1000);
});

test('recovery reconstructs song entry from a lead/native request instead of restarting the song clock', () => {
  const p=playback(),marker=1_800_000_000_000;
  const a: Item={track:{id:'out'},cueInSec:3,stemBlend:{clipPath:p.clipPath,leadPath:p.leadPath!,subbeats:p,outCueSec:180.3,inCueSec:28.66}};
  assert.equal(subbeatsEntryMs(a,marker,p.leadPath),marker-(p.timing.outgoingStartSample/44100-3)*1000);
  const b: Item={track:{id:'in'},cueInSec:28.66,subbeatsHandoff:p};
  assert.equal(subbeatsEntryMs(b,marker,p.clipPath),marker);
  assert.equal(subbeatsEntryMs(b,marker,'/native.mp3'),marker-subbeatsPlaybackSeconds(p.timing,28.66)*1000);
});

test('both lossless parts publish in order with the correct identity and one owner', async () => {
  const p = playback();
  const outgoing: Item = {track:{id:'out',title:'Outgoing'},sent:true,
    stemBlend:{clipPath:p.clipPath,leadPath:p.leadPath!,subbeats:p,outCueSec:180.3,inCueSec:28.66}};
  const incoming: Item = {track:{id:'in',title:'Incoming'},subbeatsHandoff:p};
  queue.upcoming=[outgoing,incoming];
  const write = queue._writeHandoff;
  const uris: string[] = [];
  queue._writeHandoff = async (_path,uri,opts) => {
    if (opts?.beforeWrite?.() === false) return false;
    uris.push(typeof uri === 'function' ? uri() : uri);opts?.onWritten?.();return true;
  };
  try {
    await queue.publishSubbeatsParts(outgoing,incoming);
    assert.equal(uris.length,2);
    assert.match(uris[0],/subsonic_id="out"/);
    assert.match(uris[1],/subsonic_id="in"/);
    assert.ok(uris.every(uri => uri.includes('subwave_clip_for="in"') && uri.includes(p.transitionId)));
    await queue.publishSubbeatsParts(outgoing,incoming);
    assert.equal(uris.length,2,'a completed publication is not repeated');
  } finally { queue._writeHandoff=write; }
});

test('restart publication uses mixer evidence and never appends an old lead after a queued incoming part', async () => {
  const read = queue.readNowPlayingFromDisk, state = queue._subbeatsPublicationState, write = queue._writeHandoff;
  try {
    for (const scenario of [
      {present:['out'],queued:false,playing:'other',expected:['in']},
      {present:['in'],queued:false,playing:'other',expected:[]},
      {present:[],queued:true,playing:'other',expected:['out','in']},
      {present:[],queued:false,playing:'lead',expected:['in']},
      {present:[],queued:false,playing:'incoming',expected:[]},
      {present:[],queued:false,playing:'other',expected:[],fallback:true},
    ]) {
      const p = playback();
      const outgoing: Item = {track:{id:'out',title:'Outgoing'},sent:true,
        stemBlend:{clipPath:p.clipPath,leadPath:p.leadPath!,subbeats:p,outCueSec:180.3,inCueSec:28.66}};
      const incoming: Item = {track:{id:'in',title:'Incoming'},stemSeam:true,stemCueInSec:28.66,subbeatsHandoff:p};
      queue.current=null;queue.upcoming=[outgoing,incoming];
      queue.readNowPlayingFromDisk=async () => ({subsonic_id:scenario.playing==='lead' ? 'out' : 'other',
        filename:scenario.playing==='lead' ? p.leadPath : scenario.playing==='incoming' ? p.clipPath : '/unrelated.wav'});
      queue._subbeatsPublicationState=async () => ({parts:new Set(scenario.present),outgoingQueued:scenario.queued});
      const roles: string[]=[];
      queue._writeHandoff=async (_path,uri,options) => {
        const value=typeof uri==='function' ? uri() : uri;
        roles.push(/subwave_part="(out|in)"/.exec(value)![1]);options?.onWritten?.();return true;
      };
      await queue.publishSubbeatsParts(outgoing,incoming,true);
      assert.deepEqual(roles,scenario.expected,JSON.stringify(scenario));
      assert.equal(outgoing.stemBlend!.partsPublished,true);
      if (scenario.fallback) assert.equal(incoming.subbeatsHandoff,undefined);
    }
  } finally {queue.readNowPlayingFromDisk=read;queue._subbeatsPublicationState=state;queue._writeHandoff=write;}
});

test('cancelling a successor between parts prevents its remaining audio and head skip', async () => {
  const p=playback(),write=queue._writeHandoff;
  const outgoing: Item={track:{id:'out'},sent:true,stemBlend:{clipPath:p.clipPath,leadPath:p.leadPath!,subbeats:p,outCueSec:180.3,inCueSec:28.66}};
  const incoming: Item={track:{id:'in'},stemSeam:true,stemCueInSec:28.66,subbeatsHandoff:p};
  queue.upcoming=[outgoing,incoming];let calls=0;
  queue._writeHandoff=async (_path,_uri,options) => {
    if (options?.beforeWrite?.()===false) return false;
    calls++;options?.onWritten?.();queue.upcoming=[outgoing];return true;
  };
  try {
    await queue.publishSubbeatsParts(outgoing,incoming);
    assert.equal(calls,1);assert.equal(incoming.stemSeam,undefined);assert.equal(incoming.subbeatsHandoff,undefined);
  } finally {queue._writeHandoff=write;}
});

test('discarding an unpublished handoff restores cues and removes both owned files', async () => {
  const p = playback();writeFileSync(p.clipPath,'clip');writeFileSync(p.leadPath!,'lead');
  const outgoing: Item = {track:{id:'out',crossSec:.3},sent:false,cueOutSec:180.3,
    stemBlend:{clipPath:p.clipPath,leadPath:p.leadPath!,subbeats:p,outCueSec:180.3,inCueSec:28.66,originalExit:{crossSec:6}}};
  const incoming: Item = {track:{id:'in'},stemSeam:true,stemCueInSec:28.66,subbeatsHandoff:p};
  queue.upcoming=[outgoing,incoming];
  await queue.discardUnpublishedBlend(outgoing);
  assert.equal(outgoing.track.crossSec,6);assert.equal(outgoing.cueOutSec,undefined);
  assert.equal(incoming.subbeatsHandoff,undefined);assert.equal(incoming.stemSeam,undefined);
  assert.equal(existsSync(p.clipPath),false);assert.equal(existsSync(p.leadPath!),false);
});

test('live admission accepts speech but rejects changed evidence, reordered pairs and cuts', async () => {
  await library.load();
  const db = await import('../src/music/library-db.js');
  const { subbeatsPairSnapshot } = await import('../src/music/subbeats-pair.js');
  await settings.update({transitions:{subbeatsLive:true,pairDrain:true},maxTrackSeconds:1200,
    personas:settings.get().personas.map(p => ({...p,djMode:true}))});
  for (const id of ['out','in']) db.upsertTrackMeta(id,{title:id,artist:'Fixture',duration:300});
  const jobs = ['out','in'].map(id => ({id,title:id,artist:'Fixture',album:'',status:'prepared',attempts:1,
    bundleKey:'b'.repeat(64),error:null,updatedAt:new Date().toISOString()}));
  const file = join(config.stateDir,'subbeats','queue.json');
  mkdirSync(join(config.stateDir,'subbeats'),{recursive:true});
  const save = () => writeFileSync(file,JSON.stringify({version:1,paused:true,jobs}));save();
  const p = {...playback(),evidenceFingerprint:subbeatsPairSnapshot('out','in').evidenceFingerprint};
  const a: Item = {track:{id:'out',duration:300},sent:false};
  const b: Item = {track:{id:'in',duration:300},sent:false};
  queue.current={track:{id:'previous',duration:600},startedAt:new Date().toISOString()};queue.upcoming=[a,b];
  assert.equal(queue.subbeatsFitsPair(a,b,p),true);
  const pending = queue._pendingVoice;
  try {
    queue._pendingVoice = { kind: 'station-id', daypart: null, exchange: false, t: Date.now(), clips: [] };
    for (const kind of ['station-id','handoff','news','dj-speak']) {
      queue._pendingVoice.kind = kind;
      assert.equal(queue.subbeatsFitsPair(a,b,p),true,`${kind} must not veto a stem transition`);
    }
    queue._pendingVoice.pauseTalk = true;
    assert.equal(queue.subbeatsFitsPair(a,b,p),true,'a spoken-break request must not veto a stem transition');
    delete queue._pendingVoice.pauseTalk; queue._pendingVoice.pauseId = 'committed-silence';
    assert.equal(queue.subbeatsFitsPair(a,b,p),true,'a break elsewhere in the queue must not veto this pair');
  } finally { queue._pendingVoice = pending; }
  jobs[0].updatedAt='changed';save();assert.equal(queue.subbeatsFitsPair(a,b,p),false,'evidence rechecked immediately before publication');
  p.evidenceFingerprint=subbeatsPairSnapshot('out','in').evidenceFingerprint;
  queue.upcoming=[a,{track:{id:'inserted'}},b];assert.equal(queue.subbeatsFitsPair(a,b,p),false);
  queue.upcoming=[a,b];
  for (const speech of [{introScript:'A spoken head'}, {introWav:join(root,'intro.wav')}, {bedded:true}, {pauseDelaySec:20}]) {
    Object.assign(b,speech);
    assert.equal(queue.subbeatsFitsPair(a,b,p),true,'attached speech must not veto a stem transition');
    delete b.introScript;delete b.introWav;delete b.bedded;delete b.pauseDelaySec;
  }
  a.stemCueInSec=200;assert.equal(queue.subbeatsFitsPair(a,b,p),false,'a consecutive cut cannot precede the committed resume');delete a.stemCueInSec;
  await settings.update({maxTrackSeconds:120});assert.equal(queue.subbeatsFitsPair(a,b,p),false,'playback cap owns the ending');
  await settings.update({maxTrackSeconds:1200,transitions:{subbeatsLive:false}});
  assert.equal(queue.subbeatsFitsPair(a,b,p),false,'switch-off revokes an unpublished proposal');
});

test('speech still uses boundary delivery with either kind of committed stem transition', async () => {
  const saved = {air:queue._airVoice,spoken:queue.onSpoken,pending:queue._pendingVoice,
    upcoming:queue.upcoming,current:queue.current};
  const voicePath = join(root,'stem-speech.wav');writeFileSync(voicePath,'fixture');
  const handed: string[] = [];
  queue._airVoice = async (file,path) => {
    assert.equal(file,config.liquidsoap.introFile);handed.push(path);
    return {voiceId:'stem-speech',clipMs:1000,aired:Promise.resolve(null)};
  };
  queue.onSpoken = async () => true;
  try {
    for (const subbeats of [false,true]) {
      const item: Item = {track:{id:'speech-in',title:'Incoming'},stemSeam:true,
        ...(subbeats ? {subbeatsHandoff:playback()} : {})};
      queue.current=null;queue.upcoming=[item];
      queue._pendingVoice = {kind:'news',pauseTalk:true,daypart:null,exchange:false,t:Date.now(),
        clips:[{text:'A spoken segment',wavPath:voicePath,persona:null,meta:{}}]};
      assert.equal(await queue.maybePushPauseTalk(item),false,'do not insert silence into a committed stem seam');
      assert.equal(queue._pendingVoice.pauseTalk,false,'keep the existing ducked boundary placement');
      await queue.airPendingVoice({subsonic_id:'speech-in',title:'Incoming'});
      assert.equal(queue._pendingVoice,null,'a stem transition must not hold speech by itself');
    }
    assert.deepEqual(handed,[voicePath,voicePath]);
  } finally {
    queue._airVoice=saved.air;queue.onSpoken=saved.spoken;queue._pendingVoice=saved.pending;
    queue.upcoming=saved.upcoming;queue.current=saved.current;
  }
});

test('a cold live renderer checks readiness for this pair, with bounded and cancellable waits', async () => {
  const analyzer = await import('../src/music/analyzer.js');
  const { maybeRenderSubbeats } = await import('../src/broadcast/subbeats.js');
  const { createSubbeatsStore } = await import('../src/music/subbeats-store.js');
  const db = await import('../src/music/library-db.js');
  await library.load();
  await settings.update({ transitions: { subbeatsLive: true, pairDrain: true }, loudness: { source: 'measured' },
    personas: settings.get().personas.map(persona => ({ ...persona, djMode: true })) });
  const store = createSubbeatsStore(root);
  store.cacheId();
  for (const id of ['ready-out','ready-in']) {
    db.upsertTrackMeta(id, { title: id, artist: 'Fixture', duration: 300 });
    store.enqueue([{ id, title: id, artist: 'Fixture', album: '' }]);
    store.event({ id, status: 'running' }, [id]);
    store.event({ id, status: 'prepared', bundleKey: 'a'.repeat(64),
      cueCoverage: { version: 1, artifactKey: 'b'.repeat(64), incoming: null, outgoing: null } }, [id]);
  }
  let mode: 'ready' | 'unsupported' | 'slow' = 'ready';
  let posted = 0, valid = true;
  let healthStarted = deferred(), releaseHealth = deferred();
  const http = await listen(createServer(async (req,res) => {
    res.setHeader('Content-Type','application/json');
    if (req.url === '/health') {
      if (mode === 'slow') { healthStarted.resolve(); await releaseHealth.promise; }
      if (!res.destroyed) res.end(JSON.stringify({ ok: true, engines: ['analyze'],
        analyze_subbeats_capable: mode !== 'unsupported', analyze_subbeats_cache_version: 2,
        analyze_subbeats_suitability_version: 1 }));
      return;
    }
    assert.equal(req.url, '/render-subbeats-transition');
    let raw = ''; for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw); posted++;
    res.end(JSON.stringify({ version: 1, status: 'unavailable', reason: 'Fixture reached the pair renderer',
      transitionId: input.transitionId, mixStyle: input.mixStyle, evidenceFingerprint: input.evidenceFingerprint }));
  }));
  const saved = { urls: config.analyzer.urls, python: config.analyzer.python };
  const logs: string[] = [];
  const render = () => maybeRenderSubbeats({ id: 'ready-out', gainDb: 0 }, { id: 'ready-in', loudnessLufs: -14 }, 180,
    { valid: () => valid, log: message => { logs.push(message); } });
  try {
    config.analyzer.urls = [http.url]; config.analyzer.python = '';
    analyzer._resetBackendCacheForTests();
    assert.equal(analyzer.subbeatsCapability(), null);
    assert.equal(await render(), null);
    assert.equal(posted, 1, 'the first cold pair reaches rendering instead of being sacrificed to warm-up');
    assert.match(logs.at(-1)!, /Fixture reached the pair renderer/);
    mode = 'unsupported'; analyzer._resetBackendCacheForTests();
    assert.equal(await render(), null); assert.equal(posted, 1);
    assert.match(logs.at(-1)!, /readiness/);
    mode = 'slow'; analyzer._resetBackendCacheForTests();
    const cancelled = render(); await healthStarted.promise; valid = false;
    assert.equal(await cancelled, null); assert.equal(posted, 1, 'a changed pair cannot continue after its health check');
    releaseHealth.resolve();
    // Settle the first probe before changing the fixture's held health request.
    await new Promise(resolve => setTimeout(resolve, 50));
    healthStarted = deferred(); releaseHealth = deferred(); valid = true;
    analyzer._resetBackendCacheForTests();
    const startedAt = Date.now();
    assert.equal(await render(), null);
    assert.ok(Date.now() - startedAt < 6500, 'readiness cannot consume the full render budget');
    assert.match(logs.at(-1)!, /readiness/); assert.equal(posted, 1);
  } finally {
    releaseHealth.resolve(); http.server.closeAllConnections(); await http.close();
    config.analyzer.urls = saved.urls; config.analyzer.python = saved.python;
    analyzer._resetBackendCacheForTests(); analyzer.shutdown();
  }
});

test('shared drain arms either stem transition with pending and track-tied speech', async () => {
  await settings.update({maxTrackSeconds:1200,maxTrackLengthMode:'cut',loudness:{source:'measured'}});
  const render = queue._renderSubbeats, regular = queue._renderBlend, fits = queue.subbeatsFitsPair;
  const probe = queue._probeCueLanding;
  queue._probeCueLanding = async () => ({ok:false,codec:null,reason:'isolated fixture'});
  const verify = queue.verifyPushResolved;
  const pending = queue._pendingVoice;
  queue._pendingVoice = { kind: 'station-id', clips: [], daypart: null, exchange: false, t: Date.now() };
  queue.verifyPushResolved = async () => {};
  queue.subbeatsFitsPair = () => true;
  try {
    for (const available of [true,false]) {
      const p = playback();
      const outgoing: Item = {track:{id:'out',title:'Outgoing',duration:220},sent:false};
      const incoming: Item = {track:{id:'in',title:'Incoming',duration:300},sent:false,
        introScript:'A spoken head',introWav:join(root,'intro.wav')};
      queue.current=null;queue.upcoming=[outgoing,incoming];
      let fallback = 0, attempted = 0;
      queue._renderSubbeats=async () => {
        attempted++;
        return available ? {clipPath:p.clipPath,leadPath:p.leadPath!,subbeats:p,
          outCueSec:180.3,inCueSec:28.66,clipSec:36} : null;
      };
      queue._renderBlend=async () => {fallback++;return {clipPath:p.clipPath,
        outCueSec:180.3,inCueSec:28.66,clipSec:36};};
      const uris: string[]=[];
      const poll=setInterval(() => {
        if (existsSync(config.liquidsoap.queueFile)) {
          uris.push(readFileSync(config.liquidsoap.queueFile,'utf8'));rmSync(config.liquidsoap.queueFile,{force:true});
        }
      },5);
      try {
        await queue.drainToLiquidsoap(true);
        await new Promise(resolve => setTimeout(resolve,120));
      } finally {clearInterval(poll);rmSync(config.liquidsoap.queueFile,{force:true});}
      assert.equal(attempted,1,'speech must not prevent a Sub/Beats attempt');
      assert.equal(fallback,available ? 0 : 1);
      assert.equal(incoming.stemSeam,true,'either stem transition is armed despite speech');
      assert.equal(uris.length,available ? 4 : 3);
      if (available) {
        assert.match(uris[1],/subwave_part="out"/);assert.match(uris[2],/subwave_part="in"/);
        assert.match(uris[3],/liq_cue_in="28.66"/);
        assert.match(uris[3],/liq_amplify="-3 dB"/,'native continuation keeps the committed render gain');
      }
    }
  } finally {queue._renderSubbeats=render;queue._renderBlend=regular;queue.subbeatsFitsPair=fits;queue.verifyPushResolved=verify;queue._probeCueLanding=probe;queue._pendingVoice=pending;}
});
