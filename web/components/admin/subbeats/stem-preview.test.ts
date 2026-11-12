import assert from 'node:assert/strict';
import test from 'node:test';
import { stemDetailVisible, stemPairKey, stemPeaks, stemPhase, stemSourceSeconds, stemStyle, waveformKeys, type StemTransition } from './stem-preview';

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
  assert.equal(stemSourceSeconds(regular,'incoming',2.99),null);
  assert.equal(stemSourceSeconds(regular,'incoming',3),0);
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
