import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  buildStemBeatsTempoTimeline,
  planStemBeatsTempo,
  STEM_BEATS_TEMPO_PLAN_VERSION,
  stemBeatsSourceSecondsAtOutput,
  type StemBeatsTempoTimelineInput,
} from '../src/music/subbeats-tempo-plan.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(scriptDir, 'fixtures/subbeats-tempo-plan-v1.json'), 'utf8')) as Array<{
  outgoingBpm: number; incomingBpm: number; mode: 'incoming-only' | 'split' | null;
  commonBpm?: number; outgoingRate?: number; incomingRate?: number; symmetricGap?: number;
  timelineInput?: StemBeatsTempoTimelineInput;
  timeline?: Record<string, number | null>;
}>;

test('Stem Beats tempo plan matches the shared cross-language v1 fixtures', () => {
  for (const fixture of fixtures) {
    const plan = planStemBeatsTempo(fixture.outgoingBpm, fixture.incomingBpm);
    assert.equal(plan?.mode ?? null, fixture.mode, `${fixture.outgoingBpm}/${fixture.incomingBpm} BPM mode`);
    if (!plan) continue;
    assert.equal(plan.planVersion, STEM_BEATS_TEMPO_PLAN_VERSION);
    assert.ok(Math.abs(plan.commonBpm - fixture.commonBpm!) < 1e-9);
    assert.ok(Math.abs(plan.outgoingRate - fixture.outgoingRate!) < 1e-9);
    assert.ok(Math.abs(plan.incomingRate - fixture.incomingRate!) < 1e-9);
    assert.ok(Math.abs(plan.symmetricGap - fixture.symmetricGap!) < 1e-9);
    if (fixture.timelineInput && fixture.timeline) {
      const timeline = buildStemBeatsTempoTimeline(plan, fixture.timelineInput);
      assert.ok(timeline, 'expected a complete source-covered timing plan');
      for (const [field, expected] of Object.entries(fixture.timeline)) {
        const actual = timeline[field as keyof typeof timeline];
        if (typeof expected === 'number' && typeof actual === 'number') {
          assert.ok(Math.abs(actual - expected) < 1e-8, `${field}: ${actual} != ${expected}`);
        } else {
          assert.equal(actual, expected, field);
        }
      }
      const input = fixture.timelineInput;
      assert.ok(Math.abs(stemBeatsSourceSecondsAtOutput(plan, timeline, 'outgoing', timeline.handoverOutputSeconds)!
        - input.handoverSeconds) < 1e-8, 'outgoing source reaches the handover cue');
      assert.ok(Math.abs(stemBeatsSourceSecondsAtOutput(plan, timeline, 'incoming', timeline.handoverOutputSeconds)!
        - input.incomingCueSeconds) < 1e-8, 'incoming source cue aligns at handover');
      assert.ok(Math.abs(stemBeatsSourceSecondsAtOutput(plan, timeline, 'outgoing', timeline.outgoingEndOutputSeconds)!
        - input.outgoingDurationSeconds) < 1e-8, 'outgoing consumes the complete source');
      assert.ok(Math.abs(stemBeatsSourceSecondsAtOutput(plan, timeline, 'incoming', timeline.incomingReleaseEndOutputSeconds)!
        - timeline.incomingResumeSourceSeconds) < 1e-8, 'release ends at the incoming resume point');
    }
  }
});

test('invalid tempo values do not produce an audition plan', () => {
  assert.equal(planStemBeatsTempo(0, 120), null);
  assert.equal(planStemBeatsTempo(Number.NaN, 120), null);
});
