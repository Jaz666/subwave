import assert from 'node:assert/strict';
import test from 'node:test';
import { generateV19AvailabilityCorrections } from './functiongemma/v19-availability.js';

test('balances V19 availability corrections while strengthening its two failed offered subsets', () => {
  for (const split of ['train', 'development'] as const) {
    const examples = generateV19AvailabilityCorrections(split);
    assert.equal(examples.length, split === 'train' ? 30 : 10);
    const selected = examples.map(example => example.messages.filter(message => message.role === 'assistant').at(-1)!.tool_calls![0].function);
    assert.ok(selected.filter(call => call.name === 'searchLibrary').length >= (split === 'train' ? 9 : 4));
    assert.ok(selected.filter(call => call.name === 'tracksLikeThis').length >= (split === 'train' ? 9 : 3));
    for (const [index, example] of examples.entries()) {
      const last = selected[index];
      assert.notEqual(last.name, 'tracksTowardJourney', example.id);
      assert.ok(example.tools.some(tool => tool.function.name === last.name), example.id);
      assert.match(String(example.messages.find(message => message.role === 'user')?.content), /Do not call tracksTowardJourney/);
      if (example.family.startsWith('recover.')) {
        assert.equal(example.messages.filter(message => message.role === 'assistant')[0].tool_calls![0].function.name, 'showPlaylistTracks');
        assert.notEqual(last.name, 'showPlaylistTracks');
      }
    }
  }
});
