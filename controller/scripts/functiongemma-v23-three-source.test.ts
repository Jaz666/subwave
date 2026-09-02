import assert from 'node:assert/strict';
import test from 'node:test';
import { generateV23ThreeSourceCorrections, COMPLEMENT } from './functiongemma/v23-three-source.js';
import { runModelScenario } from './functiongemma/model-runner.js';
import { scorePrediction } from './functiongemma/score.js';

test('V23 corpus has three distinct calls and removes every used source', () => {
  const rows = [...generateV23ThreeSourceCorrections('train'), ...generateV23ThreeSourceCorrections('development')];
  assert.equal(rows.length, 24);
  for (const row of rows) {
    const calls = row.messages.filter(message => message.role === 'assistant').map(message => message.tool_calls![0].function.name);
    assert.equal(new Set(calls).size, 3, row.id);
    assert.equal(row.decisionTools!.length, 3, row.id);
    for (const [round, name] of calls.entries()) {
      assert.ok(row.decisionTools![round].some(tool => tool.function.name === name), `${row.id}: round ${round + 1}`);
      for (const used of calls.slice(0, round)) assert.ok(!row.decisionTools![round].some(tool => tool.function.name === used), `${row.id}: reused ${used}`);
    }
  }
});

test('scorer rejects a source that was offered initially but removed in a later round', () => {
  const scenario: any = {
    id: 'v23.round-offer', stage: 'recover', split: 'validation', description: 'round offers', prompt: 'x',
    tools: [{ name: 'first' }, { name: 'second' }, { name: 'third' }],
    decisionTools: [[{ name: 'first' }, { name: 'second' }, { name: 'third' }], [{ name: 'second' }, { name: 'third' }], [{ name: 'third' }]],
  };
  const score = scorePrediction(scenario, { scenario: scenario.id, calls: [{ name: 'first', arguments: {} }, { name: 'first', arguments: {} }, { name: 'third', arguments: {} }], callsPerRound: [1, 1, 1] });
  assert.deepEqual(score.dimensions.protocol?.violations, ['round-2:unoffered-tool:first']);
});

test('model runner sends the full three-round vanilla-compatible offer sequence', async () => {
  const scenario: any = {
    id: 'v23.runner', stage: 'recover', split: 'validation', maxRounds: 3, description: 'runner', prompt: 'x',
    tools: [{ name: 'first' }, { name: 'second' }, { name: 'third' }],
    decisionTools: [[{ name: 'first' }, { name: 'second' }, { name: 'third' }], [{ name: 'second' }, { name: 'third' }], [{ name: 'second' }, { name: 'third' }]],
    mockResults: { first: { tracks: [{ id: 'one' }] }, second: { tracks: [{ id: 'two' }] } }, followup: COMPLEMENT,
  };
  const replies = ['first', 'second', 'third'].map((name, index) => ({ id: String(index), function: { name, arguments: '{}' } }));
  const bodies: any[] = [];
  const fakeFetch: typeof fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [replies.shift()] } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const prediction = await runModelScenario(scenario, { baseUrl: 'http://model.test', model: 'test' }, fakeFetch);
  assert.deepEqual(prediction.calls.map(call => call.name), ['first', 'second', 'third']);
  assert.deepEqual(prediction.callsPerRound, [1, 1, 1]);
  assert.deepEqual(bodies.map(body => body.tools.map((tool: any) => tool.function.name)), [['first', 'second', 'third'], ['second', 'third'], ['third']]);
});
