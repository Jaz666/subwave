import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'subwave-extended-sleeves-'));
process.env.STATE_DIR = root;

const settings = await import('../src/settings.js');
const { setCache } = await import('../src/settings/store.js');
const { linkPrompt } = await import('../src/llm/internal/prompts/scripts.js');

const track = {
  title: 'Dead at the Wheel', artist: 'The Cribs', album: '24–7 Rockstar Shit',
  year: 2017, eraUntrusted: false,
};

test('extended sleeve notes are off by default, live when enabled, and survive a cold load', async () => {
  await settings.load();
  assert.equal(settings.get().djBehaviour.extendedSleeveNotes, false);

  await settings.update({ djBehaviour: { extendedSleeveNotes: true } } as never);
  const prompt = linkPrompt({ current: track, context: {} });
  assert.match(prompt, /Album: 24–7 Rockstar Shit\./);
  assert.match(prompt, /Release year: 2017\./);

  setCache(null);
  await settings.load();
  assert.equal(settings.get().djBehaviour.extendedSleeveNotes, true);
});

test('extended sleeve notes refuse non-boolean patches', async () => {
  await assert.rejects(
    () => settings.update({ djBehaviour: { extendedSleeveNotes: 'on' } } as never),
    /djBehaviour\.extendedSleeveNotes must be a boolean/,
  );
});

test.after(() => rmSync(root, { recursive: true, force: true }));
