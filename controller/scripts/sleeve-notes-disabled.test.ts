import assert from 'node:assert/strict';
import test from 'node:test';
import { collectionPlan } from '../src/sleeve-notes/runtime.js';

test('Sleeve Notes disabled state cannot admit provider work', async () => {
  let providerCalls = 0;
  const provider = async () => { providerCalls += 1; };
  const plan = collectionPlan({ enabled: false, providerConfigured: true });
  if (plan.run) await provider();
  assert.deepEqual(plan, { run: false, reason: 'disabled' });
  assert.equal(providerCalls, 0);
});

test('unconfigured provider cannot admit work when Sleeve Notes is enabled', () => {
  assert.deepEqual(collectionPlan({ enabled: true, providerConfigured: false }), {
    run: false,
    reason: 'provider-unconfigured',
  });
});
