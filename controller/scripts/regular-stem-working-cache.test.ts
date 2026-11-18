import assert from 'node:assert/strict';
import test from 'node:test';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { access, mkdir, readdir, symlink, writeFile } from 'node:fs/promises';
import { createTempDir, removeTempDir } from './test-utils/temp-dir.js';
import { RegularStemWorkingCache } from '../src/broadcast/regular-stem-working-cache.js';

test('retirement waits for all worker and mixer leases; release is idempotent', async () => {
  const root = createTempDir(path.join(tmpdir(), 'regular-working-'));
  try {
    const cache = new RegularStemWorkingCache(root);
    await cache.reconcile('current', ['next']);
    const worker = await cache.acquire('next');
    const mixer = await cache.acquire('next');
    assert.ok(worker && mixer);
    await cache.reconcile('replacement', []);
    assert.equal(await cache.acquire('next'), null);
    await worker.release();
    await worker.release();
    await access(mixer.directory);
    await mixer.release();
    await assert.rejects(access(mixer.directory));
  } finally { await removeTempDir(root); }
});

test('nine identities retained; restart cleans retired dirs but preserves links and operator files', async () => {
  const root = createTempDir(path.join(tmpdir(), 'regular-working-'));
  try {
    const cache = new RegularStemWorkingCache(root);
    const queued = Array.from({ length: 8 }, (_, i) => `track-${i}`);
    await cache.reconcile('current', queued);
    for (const id of ['current', ...queued]) {
      const lease = await cache.acquire(id);
      assert.ok(lease);
      await lease.release();
    }
    assert.equal((await readdir(root)).length, 9);
    assert.throws(() => cache.reconcile('current', [...queued, 'overflow']));
    assert.equal((await readdir(root)).length, 9);
    await mkdir(path.join(root, 'operator-notes'));
    await symlink(path.join(root, 'operator-notes'), path.join(root, 'a'.repeat(64)));
    await new RegularStemWorkingCache(root).reconcile('current', []);
    assert.equal((await readdir(root)).length, 3);
  } finally { await removeTempDir(root); }
});


for (const busyName of ['.regular-busy.json','.regular-render-busy.json']) test(`bounded ${busyName} protects a sidecar job across controller restart`, async () => {
  const root = createTempDir(path.join(tmpdir(), 'regular-working-'));
  try {
    const cache = new RegularStemWorkingCache(root);
    await cache.reconcile(null,['active']);
    const lease = await cache.acquire('active');
    assert.ok(lease);
    const busy = path.join(lease.directory,busyName);
    await writeFile(busy,JSON.stringify({until:Date.now()+60_000}));
    await lease.release();
    const restarted = new RegularStemWorkingCache(root);
    await restarted.reconcile(null,[]);
    assert.equal(await restarted.hasBusyJob(),true);
    await access(lease.directory);
    await writeFile(busy,JSON.stringify({until:Date.now()-1}));
    assert.equal(await restarted.hasBusyJob(),false);
    await restarted.reconcile(null,[]);
    await assert.rejects(access(lease.directory));
  } finally { await removeTempDir(root); }
});

for (const busyName of [null, '.regular-busy.json', '.regular-render-busy.json']) {
  test(`active tracks retire obsolete windows after ${busyName ?? 'process lease'} settles`, async () => {
    const root = createTempDir(path.join(tmpdir(), 'regular-working-'));
    try {
      const oldKey = 'b'.repeat(64), newKey = 'c'.repeat(64);
      const cache = new RegularStemWorkingCache(root);
      await cache.reconcile(null, ['active'], [{ trackId: 'active', key: oldKey }]);
      const lease = await cache.acquire('active');
      assert.ok(lease);
      const oldWindow = path.join(lease.directory, oldKey);
      const newWindow = path.join(lease.directory, newKey);
      await mkdir(oldWindow); await mkdir(newWindow);
      await mkdir(path.join(lease.directory, 'operator-notes'));
      await symlink(oldWindow, path.join(lease.directory, 'd'.repeat(64)));
      await writeFile(path.join(lease.directory, 'notes.txt'), 'keep');
      const windows = [{ trackId: 'active', key: newKey }];
      if (busyName) {
        await writeFile(path.join(lease.directory, busyName), JSON.stringify({ until: Date.now()+60_000 }));
        await lease.release();
        const restarted = new RegularStemWorkingCache(root);
        await restarted.reconcile(null, ['active'], windows);
        await access(oldWindow);
        await writeFile(path.join(lease.directory, busyName), JSON.stringify({ until: Date.now()-1 }));
        await restarted.reconcile(null, ['active'], windows);
      } else {
        await cache.reconcile(null, ['active'], windows);
        await access(oldWindow);
        await lease.release();
      }
      await assert.rejects(access(oldWindow));
      await access(newWindow);
      const entries = await readdir(lease.directory, { withFileTypes: true });
      assert.ok(entries.some(entry => entry.name === 'd'.repeat(64) && entry.isSymbolicLink()));
      await access(path.join(lease.directory, 'notes.txt'));
      await access(path.join(lease.directory, 'operator-notes'));
    } finally { await removeTempDir(root); }
  });
}
