import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'subwave-extended-sleeves-'));
process.env.STATE_DIR = root;

const settings = await import('../src/settings.js');
const { setCache } = await import('../src/settings/store.js');
test('extended sleeve notes are off by default and survive a cold load as a reservation', async () => {
  await settings.load();
  assert.equal(settings.get().djBehaviour.extendedSleeveNotes, false);

  await settings.update({ djBehaviour: { extendedSleeveNotes: true } } as never);

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
