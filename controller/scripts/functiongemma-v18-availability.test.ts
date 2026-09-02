import assert from 'node:assert/strict';
import test from 'node:test';
import { generateV18AvailabilityCorrections, V18_CONTROLLER_PATH_FIXTURES } from './functiongemma/v18-availability.js';

test('keeps the V17 journey-withheld controller conflict as five exact permanent fixtures', () => {
  assert.equal(V18_CONTROLLER_PATH_FIXTURES.length, 5);
  for (const fixture of V18_CONTROLLER_PATH_FIXTURES) {
    assert.match(fixture.prompt, /A sonic journey is active: call tracksTowardJourney/);
    assert.match(fixture.prompt, /Controller authority: call only a function actually offered/);
    assert.match(fixture.prompt, /Do not call tracksTowardJourney/);
    assert.equal(fixture.tools.some(tool => tool.name === 'tracksTowardJourney'), false, fixture.id);
    assert.ok(fixture.route!.firstCallOneOf.every(name => fixture.tools.some(tool => tool.name === name)), fixture.id);
  }
});

test('builds a small V18 availability correction corpus with valid strict-empty recovery calls', () => {
  for (const split of ['train', 'development'] as const) {
    const examples = generateV18AvailabilityCorrections(split);
    assert.equal(examples.length, split === 'train' ? 10 : 5);
    for (const example of examples) {
      const calls = example.messages.filter(message => message.role === 'assistant').flatMap(message => message.tool_calls ?? []);
      const selected = calls.at(-1)!.function;
      assert.notEqual(selected.name, 'tracksTowardJourney', example.id);
      assert.ok(example.tools.some(tool => tool.function.name === selected.name), example.id);
      assert.match(String(example.messages.find(message => message.role === 'user')?.content), /Do not call tracksTowardJourney/);
      if (example.family.startsWith('recover.')) {
        assert.equal(calls[0].function.name, 'showPlaylistTracks', example.id);
        assert.notEqual(selected.name, 'showPlaylistTracks', example.id);
        assert.equal(selected.name === 'songsByGenre' && !selected.arguments.genre, false, example.id);
      }
    }
  }
});
