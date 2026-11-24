import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assessSubbeatsPrepV2Roles, planSubbeatsPrepV2Extraction, roundStemBeatsSample } from '../src/music/subbeats-pair.js';

const role = (seconds: number[], bpm: number, durationSeconds = 240, outgoing = false) => ({ state: 'cue-ready' as const,
  runId: 'run', job: { source: { durationSeconds } } as never, role: outgoing ? 'outgoing' as const : 'incoming' as const,
  cues: seconds.map(sourceSeconds => ({ sourceSeconds, ...(outgoing ? { phraseEndSeconds: sourceSeconds + 6 } : {}),
    bpm, strength: 1, reason: 'arrangement' as const })),
  grid: {} as never });

test('V2 pair screen admits only cue pairs within the existing 8% Sub/Beats tempo gate', () => {
  const compatible = assessSubbeatsPrepV2Roles(role([70, 80], 120), role([20, 25], 128));
  assert.equal(compatible.state, 'tempo-compatible');
  assert.deepEqual(compatible.cuePairs.map(pair => [pair.outgoingCueIndex, pair.incomingCueIndex]),
    [[0, 0], [0, 1], [1, 0], [1, 1]]);
  const rejected = assessSubbeatsPrepV2Roles(role([70], 120), role([20], 132));
  assert.equal(rejected.state, 'pair-tempo-rejected');
  assert.deepEqual(rejected.cuePairs, []);
});

test('V2 pair screen preserves missing-role reasons', () => {
  const noCue = { state: 'no-cue' as const, reason: 'no-current-role-cue' as const };
  assert.equal(assessSubbeatsPrepV2Roles(noCue, role([20], 120)).state, 'no-cue');
});

test('V2 extraction planner selects bounded tail and head windows for a compatible cue pair', () => {
  const plan = planSubbeatsPrepV2Extraction(role([170], 120, 180, true), role([20], 124, 240));
  assert.equal(plan.state, 'windows-ready');
  assert.ok(plan.plan);
  assert.ok(plan.plan.outgoing.endSeconds - plan.plan.outgoing.startSeconds <= 120);
  assert.equal(plan.plan.incoming.startSeconds, 0);
  assert.ok(plan.plan.incoming.endSeconds > 20 && plan.plan.incoming.endSeconds <= 120);
  const tooLong = planSubbeatsPrepV2Extraction(role([400], 120, 600, true), role([20], 124, 240));
  assert.equal(tooLong.state, 'window-unavailable');
});

test('fractional cue positions and native/adjusted tempo use the renderer sample clock', () => {
  const pairs = [124, 128].flatMap(bpm => [140.123456, 140 + .5 / 44100, 140 + 1.5 / 44100].map(seconds => ({
    outgoing: role([seconds], 128, (180 * 44100 + 5444) / 44100, true),
    incoming: role([30.123456], bpm, 240),
  })));
  const python = spawnSync('python3', ['-c', `
import json,sys
sys.path.insert(0,sys.argv[1])
from subbeats_cue_preview import passage_plan
from subbeats_cue_matching import live_handoff_timing
print(json.dumps([live_handoff_timing(passage_plan(p['outgoing']['cues'][0], p['incoming']['cues'][0],
 p['outgoing']['job']['source']['durationSeconds'], p['incoming']['job']['source']['durationSeconds']),
 p['incoming']['cues'][0]['bpm'], release_beats=16) for p in json.load(sys.stdin)]))
`, fileURLToPath(new URL('.', import.meta.url))], { input: JSON.stringify(pairs), encoding: 'utf8' });
  assert.equal(python.status, 0, python.stderr);
  const timings = JSON.parse(python.stdout);
  pairs.forEach((pair, index) => {
    const result = planSubbeatsPrepV2Extraction(pair.outgoing, pair.incoming);
    assert.ok(result.plan);
    assert.equal(roundStemBeatsSample(result.plan.firstSeconds * 44100), timings[index].outgoingStartSample);
    assert.equal(roundStemBeatsSample(result.plan.incomingEndSeconds * 44100), timings[index].incomingResumeSample);
    assert.equal(timings[index].releaseEndFrame - timings[index].releaseStartFrame,
      timings[index].incomingRate === 1 ? 0 : Math.round(16 * 60 / 128 * 44100));
  });
  assert.equal(roundStemBeatsSample(2.5), 2);
  assert.equal(roundStemBeatsSample(3.5), 4);
});
