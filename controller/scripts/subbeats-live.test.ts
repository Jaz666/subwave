import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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

test('live admission rejects changed evidence, reordered pairs, speech and cuts at the real queue boundary', async () => {
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
  jobs[0].updatedAt='changed';save();assert.equal(queue.subbeatsFitsPair(a,b,p),false,'evidence rechecked immediately before publication');
  p.evidenceFingerprint=subbeatsPairSnapshot('out','in').evidenceFingerprint;
  queue.upcoming=[a,{track:{id:'inserted'}},b];assert.equal(queue.subbeatsFitsPair(a,b,p),false);
  queue.upcoming=[a,b];b.introScript='A spoken head';assert.equal(queue.subbeatsFitsPair(a,b,p),false);delete b.introScript;
  a.stemCueInSec=200;assert.equal(queue.subbeatsFitsPair(a,b,p),false,'a consecutive cut cannot precede the committed resume');delete a.stemCueInSec;
  await settings.update({maxTrackSeconds:120});assert.equal(queue.subbeatsFitsPair(a,b,p),false,'playback cap owns the ending');
  await settings.update({maxTrackSeconds:1200,transitions:{subbeatsLive:false}});
  assert.equal(queue.subbeatsFitsPair(a,b,p),false,'switch-off revokes an unpublished proposal');
});

test('shared drain publishes Sub/Beats before native continuation and uses ordinary fallback on a miss', async () => {
  await settings.update({maxTrackSeconds:1200,maxTrackLengthMode:'cut',loudness:{source:'measured'}});
  const render = queue._renderSubbeats, regular = queue._renderBlend, fits = queue.subbeatsFitsPair;
  const probe = queue._probeCueLanding;
  queue._probeCueLanding = async () => ({ok:false,codec:null,reason:'isolated fixture'});
  const verify = queue.verifyPushResolved;
  queue.verifyPushResolved = async () => {};
  queue.subbeatsFitsPair = () => true;
  try {
    for (const available of [true,false]) {
      const p = playback();
      const outgoing: Item = {track:{id:'out',title:'Outgoing',duration:220},sent:false};
      const incoming: Item = {track:{id:'in',title:'Incoming',duration:300},sent:false};
      queue.current=null;queue.upcoming=[outgoing,incoming];
      let fallback = 0;
      queue._renderSubbeats=async () => available ? {clipPath:p.clipPath,leadPath:p.leadPath!,subbeats:p,
        outCueSec:180.3,inCueSec:28.66,clipSec:36} : null;
      queue._renderBlend=async () => {fallback++;return null;};
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
      assert.equal(fallback,available ? 0 : 1);
      assert.equal(uris.length,available ? 4 : 2);
      if (available) {
        assert.match(uris[1],/subwave_part="out"/);assert.match(uris[2],/subwave_part="in"/);
        assert.match(uris[3],/liq_cue_in="28.66"/);
        assert.match(uris[3],/liq_amplify="-3 dB"/,'native continuation keeps the committed render gain');
      }
    }
  } finally {queue._renderSubbeats=render;queue._renderBlend=regular;queue.subbeatsFitsPair=fits;queue.verifyPushResolved=verify;queue._probeCueLanding=probe;}
});
