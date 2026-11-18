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
