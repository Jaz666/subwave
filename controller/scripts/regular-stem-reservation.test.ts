import assert from 'node:assert/strict';
import test from 'node:test';

// The npm runner supplies an isolated STATE_DIR.
const db = await import('../src/music/library-db.js');
const library = await import('../src/music/library.js');
const settings = await import('../src/settings.js');
const { maybeRenderBlend } = await import('../src/broadcast/stem-blend.js');

test('live regular renderer evaluates its own working windows for dance and non-dance pairs', async () => {
  await library.load();
  await settings.load();
  await settings.update({
    personas: settings.get().personas.map(persona => ({ ...persona, djMode: true })),
    transitions: { pairDrain: true, stemBlends: true },
  });
  for (const id of ['dance', 'regular', 'other']) {
    db.upsertTrackMeta(id, { title: id, duration: 240, genres: id === 'dance' ? ['House'] : ['Rock'] });
    db.upsertTrackAnalysis(id, { bpm: 120 });
  }
  try {
    assert.ok(db.subbeatsEligibleTrack('dance'));
    assert.equal(db.subbeatsEligibleTrack('regular'), null);
    for (const [out, incoming] of [['dance', 'regular'], ['regular', 'dance'], ['dance', 'dance']]) {
      const messages: string[] = [];
      const result = await maybeRenderBlend({ id: out }, { id: incoming }, 120,
        { regularStyle: 'drums-late', log: (_kind, message) => messages.push(message) });
      assert.equal(result, null);
      assert.match(messages.join('\n'), /working windows not ready at handoff/);
      assert.doesNotMatch(messages.join('\n'), /subbeats-reserved/);
    }
    const messages: string[] = [];
    await maybeRenderBlend({ id: 'regular' }, { id: 'other' }, 120,
      { regularStyle: 'drums-late', log: (_kind, message) => messages.push(message) });
    assert.doesNotMatch(messages.join('\n'), /subbeats-reserved/);
  } finally { db.close(); }
});
