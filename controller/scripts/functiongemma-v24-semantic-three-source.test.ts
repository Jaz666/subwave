import assert from 'node:assert/strict';
import test from 'node:test';
import { generateV24SemanticThreeSourceCorrections } from './functiongemma/v24-semantic-three-source.js';

test('V24 weights sound routing while keeping held-out literals out of the correction corpus', () => {
  const train = generateV24SemanticThreeSourceCorrections('train');
  const development = generateV24SemanticThreeSourceCorrections('development');
  assert.equal(train.length, 48);
  assert.equal(development.length, 15);
  const families = train.reduce<Record<string, number>>((counts, row) => {
    counts[row.family] = (counts[row.family] ?? 0) + 1;
    return counts;
  }, {});
  assert.equal(families['controller.v24-sound-not-lyrics'], 24);
  assert.equal(families['controller.v24-lyrics-copy'], 12);
  assert.equal(families['controller.v24-journey-complement'], 12);
  const serialised = JSON.stringify([...train, ...development]);
  assert.doesNotMatch(serialised, /warm cello, muted trumpet/);
  assert.doesNotMatch(serialised, /starting over after a long journey/);
});

test('V24 keeps all three calls distinct and removes every prior call from later offers', () => {
  for (const row of generateV24SemanticThreeSourceCorrections('development')) {
    const calls = row.messages.filter(message => message.role === 'assistant').map(message => message.tool_calls![0].function.name);
    assert.equal(new Set(calls).size, 3, row.id);
    for (const [round, call] of calls.entries()) {
      assert.ok(row.decisionTools![round].some(tool => tool.function.name === call), `${row.id}: round ${round + 1}`);
      for (const used of calls.slice(0, round)) assert.ok(!row.decisionTools![round].some(tool => tool.function.name === used), `${row.id}: ${used} leaked into round ${round + 1}`);
    }
  }
});
