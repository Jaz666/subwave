import assert from 'node:assert/strict';
import test from 'node:test';
import { stemDetailVisible, stemPairKey, stemPeaks, stemPhase, stemSourceSeconds, stemStyle, stemVolumes, waveformKeys, type StemTransition } from './stem-preview';

const transition: StemTransition = {kind:'subbeats',outgoingId:'out',incomingId:'in',mixStyle:'drums-first',
  durationSec:16,incomingAtSec:2,outgoingUntilSec:10,
  timing:{sampleRate:100,outgoingStartSample:10000,incomingEntryFrame:200,handoverFrame:800,
    outgoingEndFrame:1000,clipFrames:1600,incomingRate:1.04,releaseStartFrame:1000,releaseEndFrame:1400},
  sources:{outgoing:{startSec:98,endSec:112,storageGain:.5},incoming:{startSec:0,endSec:20,storageGain:1}}};

test('stem detail survives the incoming entry but expires with the visible outgoing history', () => {
  const history = [{id:'out',startedAt:100_000,playedSeconds:100,duration:120}];
  assert.equal(stemDetailVisible(transition,'out',[],190_000,30),true);
  assert.equal(stemDetailVisible(transition,'in',history,229_999,30),true);
  assert.equal(stemDetailVisible(transition,'in',history,230_000,30),false);
  assert.equal(stemDetailVisible(transition,'other',history,210_000,30),false);
  assert.equal(stemDetailVisible(transition,'in',[],210_000,30),false);
});

test('a long active mix retains its charts after outgoing history expires, through tempo return and completion', () => {
  const long = {...transition,durationSec:61.3,incomingAtSec:4};
  const window = {startAt:196_000,endAt:257_300};
  const history = [{id:'out',startedAt:100_000,playedSeconds:100,duration:120}];
  assert.equal(stemDetailVisible(long,'in',history,230_000,30,window),true,'the 30-second history cutoff cannot end a running mix');
  assert.equal(stemDetailVisible(long,'in',[],255_000,30,window),true,'native-tempo return still belongs to the mix');
  assert.equal(stemDetailVisible(long,'in',[],257_299,30,window),true);
  assert.equal(stemDetailVisible(long,'in',history,257_300,30,window),false,'clear when the whole mix and outgoing history have ended');
  assert.equal(stemDetailVisible(long,'other',history,240_000,30,window),false,'a retained pair cannot attach to an unrelated track');
});

test('a shorter completed mix remains available only while its outgoing waveform is visible', () => {
  const history = [{id:'out',startedAt:100_000,playedSeconds:100,duration:120}];
  const window = {startAt:198_000,endAt:214_000};
  assert.equal(stemDetailVisible(transition,'in',history,229_999,30,window),true);
  assert.equal(stemDetailVisible(transition,'in',history,230_000,30,window),false);
});

test('expansion and peak-cache identity survive forecasts becoming observed timing', () => {
  const observed = {...transition,incomingAiredAt:'2026-11-12T11:00:00Z'};
  assert.equal(stemPairKey(transition),stemPairKey(observed));
  assert.deepEqual(waveformKeys.stems(transition),waveformKeys.stems(observed));
  const changed = {...transition,timing:{...transition.timing!,outgoingStartSample:11000}};
  assert.notEqual(stemPairKey(changed),stemPairKey(transition));
  assert.notDeepEqual(waveformKeys.stems(changed),waveformKeys.stems(transition));
});

test('phase copy describes lead, entry, handover, tempo return and completion', () => {
  assert.equal(stemStyle(transition),'Drums first');
  assert.match(stemPhase(transition,null),/waiting for timing/);
  assert.equal(stemPhase(transition,-3.2),'Prepared · starts in 4s');
  assert.equal(stemPhase(transition,0),'Outgoing lead');
  assert.equal(stemPhase(transition,3),'Incoming opening enters');
  assert.equal(stemPhase(transition,8),'Bass and melody handover');
  assert.equal(stemPhase(transition,10),'Returning to original tempo');
  assert.equal(stemPhase(transition,14),'Original tempo restored');
  assert.equal(stemPhase(transition,16),'Mix complete');
  assert.equal(stemPhase({...transition,mixStyle:'bass-swap'},8),'Bass handover');
  assert.equal(stemStyle({...transition,kind:'stem-blend'}),'Stem Blend');
});

test('source waveforms use the actual selected source offset and linear tempo release', () => {
  assert.equal(stemSourceSeconds(transition,'outgoing',3),103);
  assert.equal(stemSourceSeconds(transition,'outgoing',10),null);
  assert.equal(stemSourceSeconds(transition,'incoming',1.99),null);
  assert.equal(stemSourceSeconds(transition,'incoming',2),0);
  assert.ok(Math.abs(stemSourceSeconds(transition,'incoming',12)!-10.38)<1e-9);
  assert.ok(Math.abs(stemSourceSeconds(transition,'incoming',15)!-13.4)<1e-9);
  assert.equal(stemSourceSeconds(transition,'incoming',16),null);
});

test('inserted drum repetitions map back onto the same cached source samples', () => {
  const looped = {...transition,timing:{...transition.timing!,loop:{startSample:100,lengthSamples:100,repeats:2}}};
  assert.ok(Math.abs(stemSourceSeconds(looped,'incoming',4.5)!-1.6)<1e-9);
  for (const stem of ['vocals','bass','other'] as const) assert.equal(stemSourceSeconds(looped,'incoming',4.5,stem),null);
  assert.ok(Math.abs(stemSourceSeconds(looped,'incoming',6.5)!-2.68)<1e-9);
});

test('native-tempo and regular stem detail do not invent a tempo adjustment', () => {
  const native = {...transition,timing:{...transition.timing!,incomingRate:1,releaseEndFrame:1000}};
  assert.equal(stemSourceSeconds(native,'incoming',12),10);
  const regular: StemTransition = {...transition,kind:'stem-blend',timing:undefined,durationSec:6,
    incomingAtSec:3,outgoingUntilSec:3.3,sources:{outgoing:{startSec:170,endSec:200,storageGain:1}}};
  assert.equal(stemSourceSeconds(regular,'outgoing',1),195);
  assert.equal(stemSourceSeconds(regular,'incoming',0),0,'regular blends carry incoming melody from clip start');
  assert.equal(stemSourceSeconds(regular,'incoming',3),3);
});

test('predicted stem volumes follow each Sub/Beats style rather than a generic fade', () => {
  assert.deepEqual(stemVolumes(transition,'bass',8),{outgoing:.5,incoming:.5});
  assert.deepEqual(stemVolumes(transition,'bass',9),{outgoing:0,incoming:1});
  assert.deepEqual(stemVolumes(transition,'other',7),{outgoing:1,incoming:0});
  assert.deepEqual(stemVolumes(transition,'vocals',7),{outgoing:1,incoming:1});
  assert.deepEqual(stemVolumes(transition,'drums',5),{outgoing:1,incoming:.5});
  const long = {...transition,mixStyle:'long-blend' as const};
  assert.deepEqual(stemVolumes(long,'drums',5),{outgoing:1,incoming:0});
  assert.deepEqual(stemVolumes(long,'drums',7),{outgoing:1,incoming:.5});
  assert.deepEqual(stemVolumes(long,'bass',9),{outgoing:1,incoming:1});
  const swap = {...transition,mixStyle:'bass-swap' as const};
  assert.deepEqual(stemVolumes(swap,'bass',7.75),{outgoing:1,incoming:0});
  assert.deepEqual(stemVolumes(swap,'bass',8.25),{outgoing:0,incoming:1});
  assert.deepEqual(stemVolumes(swap,'other',9),{outgoing:1,incoming:1});
  const native = {...long,durationSec:12,timing:{...long.timing!,incomingRate:1,releaseEndFrame:1000,clipFrames:1200}};
  assert.deepEqual(stemVolumes(native,'drums',7),{outgoing:1,incoming:.5},'native-tempo mixes recover the beat from their final bar');
});

test('volume prediction includes terminal fades, station gain, and the end of playback', () => {
  assert.ok(Math.abs(stemVolumes(transition,'vocals',9.985).outgoing-.5)<1e-9);
  const gains: StemTransition = {...transition,gainsDb:[20*Math.log10(.5),20*Math.log10(.25)]};
  assert.deepEqual(stemVolumes(gains,'drums',8),{outgoing:.5,incoming:.25});
  assert.deepEqual(stemVolumes(transition,'drums',-1),{outgoing:0,incoming:0});
  assert.deepEqual(stemVolumes(transition,'drums',16),{outgoing:0,incoming:0});
  assert.deepEqual(stemVolumes(transition,'drums',12),{outgoing:0,incoming:1});
});

test('regular blend prediction carries only outgoing drums and drops incoming drums at its estimated handover', () => {
  const regular: StemTransition = {...transition,kind:'stem-blend',timing:undefined};
  assert.deepEqual(stemVolumes(regular,'vocals',0),{outgoing:0,incoming:1});
  assert.deepEqual(stemVolumes(regular,'bass',1),{outgoing:0,incoming:1});
  assert.deepEqual(stemVolumes(regular,'drums',2),{outgoing:0,incoming:1});
  assert.ok(stemVolumes(regular,'drums',1.75).outgoing > 0);
});

test('quiet source detail is retained, storage gain is restored, and silence is never invented', () => {
  const samples = new Float32Array(140).fill(.001);
  const buffer = {numberOfChannels:1,getChannelData:() => samples,sampleRate:10,length:samples.length};
  const peaks = stemPeaks(buffer,transition,'outgoing',16);
  assert.ok(peaks[0]!>.0019 && peaks[0]!<.0021);
  assert.deepEqual(peaks.slice(10),Array(6).fill(0),'the outgoing waveform stops at its real end');
  samples.fill(0);
  assert.deepEqual(stemPeaks(buffer,transition,'outgoing',16),Array(16).fill(0));
});
