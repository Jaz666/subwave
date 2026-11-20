import assert from 'node:assert/strict';
import test from 'node:test';
import { subbeatsRoleDecision as decide } from '../src/music/subbeats-role-policy.js';
import { subbeatsJobSchema } from '../src/schemas/subbeats.js';
import type { BeatGridProvenance } from '../src/schemas/beat-grid.js';

const grid = (startMs = 0, endMs = 300000): BeatGridProvenance => ({
  version:1, backend:'beat-this-onnx', model:'small0', modelSha256:'a'.repeat(64), preprocessingVersion:1,
  windowStartMs:startMs, windowEndMs:endMs, evidence:{medianBpm:120,intervalSupport:1,librosaBeatSupport:null},
  source:{sha256:'b'.repeat(64),bytes:12345,complete:true},
});
const job = () => subbeatsJobSchema.parse({id:'track',title:'Track',artist:'Artist',album:'',
  status:'prepared',attempts:1,bundleKey:'c'.repeat(64),error:null,updatedAt:'now',
  cuePoints:{version:1,model:'small0',artifactKey:'d'.repeat(64),algorithmVersion:13,durationSeconds:300,
    incoming:[{sourceSeconds:32,bpm:120,strength:1,reason:'opening',timingValidated:true}],
    outgoing:[{sourceSeconds:260,bpm:120,strength:1,reason:'ending',timingValidated:true}]},
});
const activity = (start: number, end: number) => ({version:1 as const,method:'stem-energy' as const,
  barAlignment:'unverified' as const,coverageStartSeconds:start,coverageEndSeconds:end,resolutionSeconds:.1,passages:[]});
const subbeatsRoleDecision = (...args: [Parameters<typeof decide>[0], 'head' | 'tail', BeatGridProvenance | null, number]) =>
  decide(...args, args[2] ? Array.from({length:17},(_,i)=>args[2]!.windowStartMs+i*(args[2]!.windowEndMs-args[2]!.windowStartMs)/16) : []);

test('screening distinguishes directional cue evidence from saved stems without doing separation', () => {
  const headOnly=job(); headOnly.cuePoints!.outgoing=[];
  assert.deepEqual(subbeatsRoleDecision(headOnly,'head',grid(0,60000),12345),
    {version:1,state:'cue-ready',reason:'role-not-prepared',cueIndices:[0]});
  assert.equal(subbeatsRoleDecision(headOnly,'tail',grid(240000),12345).reason,'tail-cue-missing');
  const tailOnly=job(); tailOnly.cuePoints!.incoming=[];
  assert.equal(subbeatsRoleDecision(tailOnly,'tail',grid(240000),12345).state,'cue-ready');
  assert.equal(subbeatsRoleDecision(tailOnly,'head',grid(0,60000),12345).reason,'head-cue-missing');
  const neither=job(); neither.cuePoints!.incoming=[]; neither.cuePoints!.outgoing=[];
  for (const side of ['head','tail'] as const) assert.equal(subbeatsRoleDecision(neither,side,grid(),12345).state,'unavailable');
});

test('stale, truncated, changed, misplaced and too-short grid evidence releases only its role', () => {
  assert.equal(subbeatsRoleDecision(job(),'head',null,12345).reason,'grid-stale');
  assert.equal(subbeatsRoleDecision(job(),'head',{...grid(),model:'custom'},12345).reason,'grid-stale');
  assert.equal(subbeatsRoleDecision(job(),'head',{...grid(),source:{...grid().source!,complete:false}},12345).reason,'source-incomplete');
  assert.equal(subbeatsRoleDecision(job(),'tail',grid(),999).reason,'source-changed');
  assert.equal(subbeatsRoleDecision(job(),'tail',grid(0,60000),12345).reason,'tail-placement-unproven');
  assert.equal(subbeatsRoleDecision(job(),'tail',grid(280000),12345).reason,'window-too-short');
  assert.equal(subbeatsRoleDecision(job(),'head',grid(0,31000),12345).reason,'window-too-short');
  assert.equal(subbeatsRoleDecision(job(),'head',grid(1000,60000),12345).reason,'window-too-short');
  for (const bars of [[],[0,2000],Array(9).fill(0),[...Array.from({length:8},(_,i)=>i*2000),NaN]]) {
    assert.equal(decide(job(),'head',grid(),12345,bars).reason,'window-too-short');
  }
  const invalid=job(); invalid.cuePoints!.incoming[0].timingValidated=false;
  assert.equal(subbeatsRoleDecision(invalid,'head',grid(),12345).reason,'head-cue-missing');
});

test('coverage readiness requires the matching role; no coverage or vocal verdict is inferred from candidate status', () => {
  const prepared=job();
  prepared.cueCoverage={version:1,artifactKey:'e'.repeat(64),incoming:activity(0,60),outgoing:null};
  assert.equal(subbeatsRoleDecision(prepared,'head',grid(0,60000),12345).state,'coverage-ready');
  assert.equal(subbeatsRoleDecision(prepared,'tail',grid(240000),12345).state,'cue-ready');
  prepared.cueCoverage.outgoing=activity(260,300);
  assert.equal(subbeatsRoleDecision(prepared,'tail',grid(240000),12345).state,'coverage-ready');
  prepared.cueCoverage.outgoing=activity(260,299);
  assert.equal(subbeatsRoleDecision(prepared,'tail',grid(240000),12345).state,'cue-ready');
  prepared.cuePoints!.incoming.push({...prepared.cuePoints!.incoming[0],sourceSeconds:64});
  assert.deepEqual(subbeatsRoleDecision(prepared,'head',grid(0,90000),12345).cueIndices,[0],
    'an uncovered alternative cannot veto a saved usable cue');
  prepared.status='running';
  assert.equal(subbeatsRoleDecision(prepared,'head',grid(),12345).state,'cue-ready');
});
