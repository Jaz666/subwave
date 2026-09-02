import assert from 'node:assert/strict';
import test from 'node:test';
import { generateV22SearchRoutingCorrections, COMPLEMENT } from './functiongemma/v22-search-routing.js';
import { runModelScenario } from './functiongemma/model-runner.js';
import { scorePrediction } from './functiongemma/score.js';

test('V22 corpus balances journey, sound and lyric routes with reduced second offers', () => {
  const train = generateV22SearchRoutingCorrections('train');
  const development = generateV22SearchRoutingCorrections('development');
  assert.equal(train.length, 18);
  assert.equal(development.length, 6);
  assert.deepEqual(new Set(train.map(row => row.family)), new Set(['controller.v22-journey-complement', 'controller.v22-sound-not-lyrics', 'controller.v22-lyrics-not-sound']));
  for (const row of [...train, ...development]) {
    const calls = row.messages.filter(message => message.role === 'assistant');
    const first = calls[0].tool_calls![0].function.name;
    const second = calls[1].tool_calls![0].function.name;
    assert.equal(second, 'tracksLikeThis');
    assert.ok(!row.decisionTools![1].some(tool => tool.function.name === first));
  }
});

test('successful controller continuation removes the used tool and preserves the exact followup', async () => {
  const scenario: any = {
    id: 'v22.test', stage: 'recover', split: 'validation', maxRounds: 2,
    prompt: 'Find music that sounds like warm spacious guitar with a steady pulse. This is audio, not lyric meaning.',
    tools: [{ name: 'searchByLyrics', required: ['query'] }, { name: 'searchBySound', required: ['query'] }, { name: 'tracksLikeThis', required: ['songId'] }],
    mockResults: { searchBySound: { tracks: [{ id: 'one' }] } }, followup: COMPLEMENT,
    route: { firstCallOneOf: ['searchBySound'], arguments: { query: 'warm spacious guitar with a steady pulse' } },
    recovery: { emptyTool: 'searchBySound', nextCallOneOf: ['tracksLikeThis'] },
  };
  const replies = [
    { id: 'one', function: { name: 'searchBySound', arguments: JSON.stringify({ query: 'warm spacious guitar with a steady pulse' }) } },
    { id: 'two', function: { name: 'tracksLikeThis', arguments: JSON.stringify({ songId: 'seed' }) } },
  ];
  const bodies: any[] = [];
  const fakeFetch: typeof fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [replies.shift()] } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const prediction = await runModelScenario(scenario, { baseUrl: 'http://model.test', model: 'test' }, fakeFetch);
  assert.deepEqual(prediction.calls.map(call => call.name), ['searchBySound', 'tracksLikeThis']);
  assert.match(bodies[1].messages.at(-1).content, /complementary discovery source/);
  assert.ok(!bodies[1].tools.some((tool: any) => tool.function.name === 'searchBySound'));
  assert.equal(scorePrediction(scenario, prediction).passed, true);
});
