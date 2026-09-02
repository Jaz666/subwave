// Local Stats diagnostics: every picker tool and transition combination must
// remain visible at zero, while the full-day windows tally individual events.

import assert from 'node:assert/strict';
import { summarizeDebug, TRACK_TRANSITION_COMBINATIONS } from '../src/stats.js';

const tools = ['searchLibrary', 'randomSongs'];
const stats = summarizeDebug(
  [{ name: 'randomSongs' }, { name: 'randomSongs', error: true }, { name: 'randomSongs', empty: true }, { name: 'done' }],
  [{ transition: 'normal' }, { transition: 'sweep + washout' }],
  tools,
);

assert.equal(stats.toolCalls.window, 1000);
assert.equal(stats.toolCalls.count, 4);
assert.deepEqual(stats.toolCalls.byName, [
  { name: 'randomSongs', count: 3, errors: 1, empty: 1 },
  { name: 'searchLibrary', count: 0, errors: 0, empty: 0 },
]);
assert.equal(stats.transitions.window, 1000);
assert.equal(stats.transitions.byName.find(row => row.name === 'normal')?.count, 1);
assert.equal(stats.transitions.byName.find(row => row.name === 'sweep + washout')?.count, 1);
assert.equal(stats.transitions.byName.find(row => row.name === 'loop')?.count, 0);
assert.equal(TRACK_TRANSITION_COMBINATIONS.length, 17);

console.log('stats debug diagnostics: ok');
