import assert from 'node:assert/strict';
import test from 'node:test';
import { agenticPickerContextWindow, contextWindowByKind, shortlistContextWindow, ContextMeasurements } from '../src/llm/context-window.js';

test('suggests a server context window from the peak successful shortlist picker prompt', () => {
  const result = shortlistContextWindow([
    { kind: 'djShortlistPick', ok: true, usage: { input: 11_989, output: 180 } },
    { kind: 'djShortlistPick', ok: true, usage: { input: 6_420, output: 170 } },
    { kind: 'djShortlistRepick', ok: true, usage: { input: 1_900, output: 120 } },
  ]);

  assert.deepEqual(result, {
    samples: 3,
    peakInputTokens: 11_989,
    suggestedTokens: 16_384,
    headroomPct: 25,
    responseReserveTokens: 1_024,
    message: 'Based on the largest successful final-picker prompt since this controller started.',
  });
});

test('reports average prompt context by LLM function without inventing missing usage', () => {
  const rows = contextWindowByKind([
    { kind: 'djAgentPick', ok: true, usage: { input: 4_000 } },
    { kind: 'djAgentPick', ok: true, usage: { input: 6_000 } },
    { kind: 'djAgentPick', ok: false, usage: { input: 99_999 } },
    { kind: 'djSegment', ok: true, usage: {} },
  ]);
  assert.deepEqual(rows, [
    { kind: 'djAgentPick', calls: 3, samples: 2, averageInputTokens: 5_000, peakInputTokens: 6_000 },
    { kind: 'djSegment', calls: 1, samples: 0, averageInputTokens: null, peakInputTokens: null },
  ]);
});

test('uses the largest Agentic Picker model step rather than its tool-loop total', () => {
  const calls = [
    { kind: 'djAgentPick', ok: true, usage: { input: 15_000 }, contextPeakInput: 7_000 },
    { kind: 'djAgentPick', ok: true, usage: { input: 19_000 }, contextPeakInput: 12_000 },
    { kind: 'djAgentPick', ok: true, via: 'ai-sdk:agent', usage: { input: 99_999 } },
  ];
  assert.equal(contextWindowByKind(calls)[0].averageInputTokens, 9_500);
  assert.equal(contextWindowByKind(calls)[0].samples, 2, 'old tool-loop totals are not a context-window sample');
  assert.deepEqual(agenticPickerContextWindow(calls), {
    samples: 2,
    peakInputTokens: 12_000,
    suggestedTokens: 16_384,
    headroomPct: 25,
    responseReserveTokens: 1_024,
    message: 'Based on the largest individual model step from a successful Agentic Picker run since this controller started.',
  });
});

test('context measurements keep peaks and averages after the debug ring would rotate', () => {
  const measurements = new ContextMeasurements();
  measurements.record({ kind: 'djShortlistPick', ok: true, usage: { input: 30_000 } });
  for (let i = 0; i < 120; i++) measurements.record({ kind: 'djLink', ok: true, usage: { input: 1000 } });
  assert.equal(measurements.snapshot().shortlist.suggestedTokens, 38_912);
  measurements.record({ kind: 'djShortlistPick', ok: true, usage: { input: 1000 } });
  const snapshot = measurements.snapshot();
  assert.equal(snapshot.shortlist.peakInputTokens, 30_000);
  assert.equal(snapshot.shortlist.samples, 2);
  assert.equal(snapshot.byKind.find(row => row.kind === 'djShortlistPick')?.averageInputTokens, 15_500);
  assert.equal(new ContextMeasurements().snapshot().shortlist.samples, 0);
});
