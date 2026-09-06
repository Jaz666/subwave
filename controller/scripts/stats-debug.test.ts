// Local Stats diagnostics: every picker tool and transition combination must
// remain visible at zero, while the full-day windows tally individual events.

import assert from 'node:assert/strict';
import { summarizeDebug, summarizeLlm, TRACK_TRANSITION_COMBINATIONS } from '../src/stats.js';

const tools = ['searchLibrary', 'randomSongs'];
const stats = summarizeDebug(
  [{ name: 'randomSongs' }, { name: 'randomSongs', failed: true }, { name: 'done' }],
  [{ transition: 'normal' }, { transition: 'sweep + washout' }],
  tools,
);

assert.equal(stats.toolCalls.window, 1000);
assert.equal(stats.toolCalls.count, 3);
assert.deepEqual(stats.toolCalls.byName, [
  { name: 'randomSongs', count: 2, failed: 1 },
  { name: 'searchLibrary', count: 0, failed: 0 },
]);
assert.equal(stats.transitions.window, 1000);
assert.equal(stats.transitions.byName.find(row => row.name === 'normal')?.count, 1);
assert.equal(stats.transitions.byName.find(row => row.name === 'sweep + washout')?.count, 1);
assert.equal(stats.transitions.byName.find(row => row.name === 'loop')?.count, 0);
assert.equal(TRACK_TRANSITION_COMBINATIONS.length, 16);

const llm = summarizeLlm([
  { kind: 'djShortlistPick', via: 'ai-sdk:tool', ok: true, steps: 4, toolCalls: [{ name: 'tracksByMood' }] },
  { kind: 'djShortlistRepick', via: 'ai-sdk:tool', ok: true, steps: 1, toolCalls: [] },
  { kind: 'ordinaryObject', via: 'ai-sdk:tool', ok: true },
]);
assert.equal(llm.agent.calls, 2);
assert.equal(llm.agent.avgSteps, 2.5);
assert.equal(llm.agent.avgTools, 0.5);

console.log('stats debug diagnostics: ok');
