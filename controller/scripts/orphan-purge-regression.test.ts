// Real filesystem permission failures: quarantine must fail closed and report honestly.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, chmodSync, existsSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTempDir, removeTempDir } from './test-utils/temp-dir.js';

const stateDir = createTempDir(join(tmpdir(), 'subwave-orphan-regression-'));
process.env.STATE_DIR = stateDir;
after(async () => { await removeTempDir(stateDir); });
const cache = await import('../src/music/stem-cache.js');
const { runOrphanPurge } = await import('../src/music/orphan-purge.js');
const root = cache.stemsRoot();
const day = 86400000;
const now = Date.now();
mkdirSync(root, { recursive: true });
writeFileSync(join(root, cache.STEMS_MARKER), '{}');

function seed(id: string) {
  const dir = join(root, id);
  mkdirSync(dir);
  writeFileSync(join(dir, 'head-drums.flac'), 'cached stems');
  const old = new Date(now - 14 * day);
  utimesSync(dir, old, old);
  return dir;
}

test('a failed timestamp write leaves the orphan live, even with a readable stale stamp', async () => {
  const live = seed('timestamp-denied');
  const stamp = join(live, '.orphaned-at');
  writeFileSync(stamp, String(now - 14 * day));
  chmodSync(stamp, 0o444);
  const old = new Date(now - 14 * day);
  utimesSync(live, old, old);
  try {
    const first = await runOrphanPurge({ knownIds: ['sentinel'], confirm: true, now });
    assert.equal(first.failed, 1);
    assert.equal(first.quarantined, 0);
    const second = await runOrphanPurge({ knownIds: ['sentinel'], confirm: true, now: now + 60000 });
    assert.equal(second.deletedCount, 0);
    assert.ok(existsSync(live));
  } finally {
    chmodSync(stamp, 0o644);
  }
});

test('quarantines without a trustworthy timestamp never age by their old directory mtime', async () => {
  for (const value of [null, '', 'invalid']) {
    const dir = join(root, '.orphan-quarantine', `unknown-${String(value)}`);
    mkdirSync(dir, { recursive: true });
    if (value !== null) writeFileSync(join(dir, '.orphaned-at'), value);
    const old = new Date(now - 14 * day);
    utimesSync(dir, old, old);
    const report = await runOrphanPurge({ knownIds: ['sentinel'], confirm: true, now });
    assert.equal(report.deletedCount, 0);
    assert.ok(existsSync(dir));
  }
});

test('a refused deletion does not report its bytes as freed', async () => {
  seed('delete-denied');
  await runOrphanPurge({ knownIds: ['sentinel'], confirm: true, now });
  const dir = join(root, '.orphan-quarantine', 'delete-denied');
  chmodSync(dir, 0o555);
  try {
    // Keep the other test's repaired orphan out of this pass's deletion totals.
    const report = await runOrphanPurge({ knownIds: ['sentinel', 'timestamp-denied'], confirm: true, now: now + 8 * day });
    assert.equal(report.failed, 1);
    assert.equal(report.deletedCount, 0);
    assert.equal(report.freedBytes, 0);
    assert.ok(existsSync(dir));
  } finally {
    chmodSync(dir, 0o755);
  }
});
