// Pins the one-call agent's listener-facing `say` boundary.
// Run: npm test -- agent-say-boundary

import assert from 'node:assert/strict';
import { PICK_SCHEMA, PICK_SAY_BOUNDARY } from '../src/broadcast/dj-agent/schemas.js';

const description = PICK_SCHEMA.shape.say.description || '';

assert.match(PICK_SAY_BOUNDARY, /listener-facing speech only/);
assert.match(PICK_SAY_BOUNDARY, /never mention tools/);
assert.match(PICK_SAY_BOUNDARY, /internal reasoning/);
assert.match(PICK_SAY_BOUNDARY, /selected track title or artist/);
assert.match(PICK_SAY_BOUNDARY, /do not add or infer music-history claims/);

assert.ok(description.includes(PICK_SAY_BOUNDARY),
  'the schema field sent to the model must carry the listener-only boundary');
assert.match(description, /When the event says stay silent, set this to null/,
  'the existing silent-output contract remains intact');

console.log('agent say boundary: all tests passed');
