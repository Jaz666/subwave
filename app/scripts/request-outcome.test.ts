import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { requestResultLabel } from '../src/lib/request-outcome';

test('native request labels distinguish refused, substituted and queued tracks', () => {
  const track = { title: 'Bohemian Rhapsody' };
  assert.equal(requestResultLabel({ track, outcome: 'cooldown' }), 'Played recently');
  assert.equal(requestResultLabel({ track, outcome: 'already-queued' }), 'Already playing or queued');
  assert.equal(requestResultLabel({ track, outcome: 'substituted' }), 'Alternative queued');
  assert.equal(requestResultLabel({ track }), 'Queued');
  assert.equal(requestResultLabel({ outcome: 'chat' }), 'Answered');
});


test('native and web players share identical outcome labels', () => {
  assert.equal(readFileSync(new URL('../src/lib/request-outcome.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../../web/lib/request-outcome.ts', import.meta.url), 'utf8'));
});
