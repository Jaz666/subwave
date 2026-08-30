import assert from 'node:assert/strict';
import test from 'node:test';

import { decoratePrompt } from '../src/llm/internal/prompts/context.js';
import { stripRecapSpokenTags, stripSpokenTags } from '../src/llm/internal/prompts/recent-speech.js';

test('recent speech sanitization removes delivery tags but preserves recap metadata', () => {
  const recap = '- 7m ago [link]: "[softly] As we drift further into Saturday night."';
  assert.equal(
    stripRecapSpokenTags(recap),
    '- 7m ago [link]: "As we drift further into Saturday night."',
  );
  assert.equal(stripSpokenTags('[Soft and warm] As the evening unfolds'), 'As the evening unfolds');
});

test('decorated prompts never expose delivery tags in recent examples', () => {
  const prompt = decoratePrompt('Write a link.', {
    kind: 'link',
    recap: '- 15m ago [ident]: "[Soft and warm] As the evening unfolds."',
    recentOpeners: ['[whispers] The darkness outside seems'],
  });
  assert.match(prompt, /\[ident\]/);
  assert.doesNotMatch(prompt, /\[(?:softly|Soft and warm|whispers)\]/i);
  assert.match(prompt, /As the evening unfolds/);
  assert.match(prompt, /The darkness outside seems/);
});
