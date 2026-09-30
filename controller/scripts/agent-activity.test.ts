import assert from 'node:assert/strict';
import test from 'node:test';
import { agentWorkActive, withAgentActivity } from '../src/llm/agent-activity.js';

test('named Agent work holds the background-research gate until it settles', async () => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const run = withAgentActivity(async () => {
    assert.equal(agentWorkActive(), true);
    await waiting;
  });
  assert.equal(agentWorkActive(), true);
  release();
  await run;
  assert.equal(agentWorkActive(), false);
});

test('a failed Agent run releases the background-research gate', async () => {
  await assert.rejects(withAgentActivity(async () => { throw new Error('agent failure'); }));
  assert.equal(agentWorkActive(), false);
});
