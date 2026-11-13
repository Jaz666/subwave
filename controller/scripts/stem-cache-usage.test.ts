// The stem cache's STORED size, for the budget field.
//
// Lowering `audio.stemCacheGb` under what the cache holds makes the next
// hourly sweep delete the difference, and the budget field showed no cache
// size at all. The figure it now shows comes from the usage snapshot
// (`stem-cache-usage.json`) and NEVER from a walk: a walk of a large cache on
// a network share takes minutes, and this is read whenever the Settings page
// opens. Pinned here:
// - storedUsage() reports the snapshot and never walks (cacheWalks unchanged);
// - a snapshot older than a day, or with a pass writing, still reports, but
//   says so (`fresh: false` / `passRunning: true`) — the operator sees an old
//   figure with its age rather than nothing;
// - a snapshot a purge or a replaced file's dropped stems marked stale still
//   reports, flagged (`stale: true`), and the sweep re-measures it rather than
//   trusting it;
// - no snapshot, another root, or a malformed one reports null;
// - GET /stem-cache/usage carries it plus the budget in force.
//
// Run: npm test -- stem-cache-usage

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listen } from './test-utils/http.js';
import { createTempDir, removeTempDir } from './test-utils/temp-dir.js';

const stateDir = createTempDir(join(tmpdir(), 'subwave-stem-usage-'));
after(async () => { await removeTempDir(stateDir); });
process.env.STATE_DIR = stateDir;
delete process.env.ADMIN_USER;
delete process.env.ADMIN_PASS;
const stemCache = await import('../src/music/stem-cache.js');
const { router } = await import('../src/routes/stem-cache.js');
const express = (await import('express')).default;

const root = stemCache.stemsRoot();
const snapFile = join(stateDir, 'stem-cache-usage.json');
const GB = 1024 ** 3;
const HOUR = 3600_000;
const writeSnap = (over: Record<string, unknown>) => {
  const now = new Date().toISOString();
  writeFileSync(snapFile, JSON.stringify({ version: 1, root, bytes: 0, dirs: 0, measuredAt: now, updatedAt: now, ...over }));
};

test('a fresh snapshot is reported as is, with no walk', async () => {
  const measuredAt = new Date(Date.now() - HOUR).toISOString();
  writeSnap({ bytes: 778 * GB, dirs: 76_020, measuredAt });
  const walks = stemCache._cacheWalksForTests();
  const u = await stemCache.storedUsage();
  assert.equal(stemCache._cacheWalksForTests(), walks, 'reading the stored size must never walk the cache');
  assert.ok(u);
  assert.equal(u.bytes, 778 * GB);
  assert.equal(u.dirs, 76_020);
  assert.equal(u.measuredAt, measuredAt);
  assert.equal(u.fresh, true);
  assert.equal(u.passRunning, false);
  assert.equal(u.estTrackBytes, stemCache.estimateTrackBytes(778 * GB, 76_020));
});

test('an old snapshot still reports, marked not fresh', async () => {
  writeSnap({ bytes: 5 * GB, dirs: 400, measuredAt: new Date(Date.now() - 30 * HOUR).toISOString() });
  const walks = stemCache._cacheWalksForTests();
  const u = await stemCache.storedUsage();
  assert.equal(stemCache._cacheWalksForTests(), walks);
  assert.equal(u?.bytes, 5 * GB);
  assert.equal(u?.fresh, false);
});

test('a pass writing right now is said, not hidden', async () => {
  writeSnap({ bytes: 5 * GB, dirs: 400, pending: { pid: process.pid, since: new Date().toISOString() } });
  const u = await stemCache.storedUsage();
  assert.equal(u?.passRunning, true);
  assert.equal(u?.fresh, false);
});

test('no snapshot, another root, or a malformed one is null', async () => {
  rmSync(snapFile, { force: true });
  assert.equal(await stemCache.storedUsage(), null);
  writeSnap({ root: '/elsewhere', bytes: GB, dirs: 10 });
  assert.equal(await stemCache.storedUsage(), null);
  writeSnap({ bytes: 'lots', dirs: 10 });
  assert.equal(await stemCache.storedUsage(), null);
  writeFileSync(snapFile, '{not json');
  assert.equal(await stemCache.storedUsage(), null);
});

test('GET /stem-cache/usage: the stored size and the budget in force', async () => {
  writeSnap({ bytes: 3 * GB, dirs: 250 });
  const app = express();
  app.use(router);
  const s = await listen(app);
  s.server.unref();
  const body = await (await fetch(`${s.url}/stem-cache/usage`)).json() as { usage: { bytes: number; dirs: number } | null; budgetBytes: number };
  assert.equal(body.usage?.bytes, 3 * GB);
  assert.equal(body.usage?.dirs, 250);
  assert.equal(body.budgetBytes, stemCache.budgetBytes());
  rmSync(snapFile, { force: true });
  const none = await (await fetch(`${s.url}/stem-cache/usage`)).json() as { usage: unknown };
  assert.equal(none.usage, null);
  await s.close();
});

test('GET /stem-cache/usage: with pick-time stems on, how far over its budget the cache may run', async () => {
  const settings = await import('../src/settings.js');
  const policy = await import('../src/broadcast/pick-stems-policy.js');
  writeSnap({ bytes: 16 * GB, dirs: 1000 });
  const app = express();
  app.use(router);
  const s = await listen(app);
  s.server.unref();
  type Body = { usage: { bytes: number; estTrackBytes: number } | null; budgetBytes: number; pickTimeOvershootBytes?: number };
  const read = async () => (await (await fetch(`${s.url}/stem-cache/usage`)).json()) as Body;
  try {
    const off = await read();
    assert.equal('pickTimeOvershootBytes' in off, false, 'off: the answer is unchanged');
    await settings.update({ transitions: { pickTimeStems: true } });
    const on = await read();
    assert.equal(on.pickTimeOvershootBytes,
      policy.designedOvershootBytes(on.budgetBytes, on.usage!.estTrackBytes),
      'the allowance plus the one separation admitted under it');
    assert.ok(on.pickTimeOvershootBytes! > 0);
    rmSync(snapFile, { force: true });
    assert.equal('pickTimeOvershootBytes' in (await read()), false, 'nothing measured: nothing to size it by');
  } finally {
    await settings.update({ transitions: { pickTimeStems: false } });
    rmSync(snapFile, { force: true });
    await s.close();
  }
});

test('stems dropped for a replaced file keep the figure, flagged, and the next read walks', async () => {
  writeSnap({ bytes: 80 * GB, dirs: 4000 });
  mkdirSync(stemCache.dirFor('swapped'), { recursive: true });

  assert.equal((await stemCache.forgetStems(['swapped'])).removed, 1);

  const got = await stemCache.storedUsage();
  assert.equal(got?.bytes, 80 * GB, 'with no figure the budget field loses its warning and its confirm');
  assert.equal(got?.stale, true);
  // In the file, not this process: the walk that drops stems is the tagger's child.
  assert.equal(JSON.parse(readFileSync(snapFile, 'utf8')).stale, true);
  const walks = stemCache._cacheWalksForTests();
  await stemCache.usage();
  assert.equal(stemCache._cacheWalksForTests(), walks + 1, 'the sweep re-measures it');
});

test('a stale snapshot is still reported, flagged, and never walked for', async () => {
  writeSnap({ bytes: 80 * GB, dirs: 4000 });
  await stemCache.markUsageStale();
  const walks = stemCache._cacheWalksForTests();
  const got = await stemCache.storedUsage();
  assert.equal(got?.bytes, 80 * GB);
  assert.equal(got?.fresh, false);
  assert.equal(got?.stale, true);
  assert.equal(stemCache._cacheWalksForTests(), walks);
});

test('nothing stored stays nothing: marking stale invents no figure', async () => {
  rmSync(snapFile, { force: true });
  await stemCache.markUsageStale();
  assert.equal(await stemCache.storedUsage(), null);
});

test('stale is a walk for the sweep and the headroom read, and a live pass still owns its mark', () => {
  const base = { version: 1 as const, root, bytes: GB, dirs: 10, measuredAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  assert.equal(stemCache.snapshotVerdict({ snap: base, root, nowMs: Date.now(), pendingAlive: false }), 'use');
  assert.equal(stemCache.snapshotVerdict({ snap: { ...base, stale: true }, root, nowMs: Date.now(), pendingAlive: false }), 'walk');
  const pending = { pid: process.pid, since: new Date().toISOString() };
  assert.equal(stemCache.snapshotVerdict({ snap: { ...base, stale: true, pending }, root, nowMs: Date.now(), pendingAlive: true }), 'pass-running');
});

test('the sweep re-measures a stale snapshot, and the flag goes with it', async () => {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, stemCache.STEMS_MARKER), '{}');
  writeSnap({ bytes: 80 * GB, dirs: 4000 });
  await stemCache.markUsageStale();
  const walks = stemCache._cacheWalksForTests();
  const swept = await stemCache.sweep(100 * GB);
  assert.equal(swept.skipped, undefined, 'walked: a stale figure is not a reason to skip');
  assert.ok(stemCache._cacheWalksForTests() > walks);
  const got = await stemCache.storedUsage();
  assert.equal(got?.bytes, 0, 're-measured');
  assert.equal(got?.fresh, true);
  assert.equal(got?.stale, false);
});

test('a pass settling onto a stale snapshot takes the walk, and cannot launder the flag', async () => {
  writeSnap({ bytes: 80 * GB, dirs: 4000 });
  assert.equal(await stemCache.markPassPending(), true);
  await stemCache.markUsageStale();
  assert.equal(await stemCache.settlePassWrites([]), null);
  assert.equal((await stemCache.storedUsage())?.stale, true);
  // Clear what the refused settlement left for the rest of the file.
  await stemCache.sweep(100 * GB, { force: true });
});

test('GET /stem-cache/usage carries the stale flag to the budget field', async () => {
  writeSnap({ bytes: 80 * GB, dirs: 4000 });
  await stemCache.markUsageStale();
  const app = express();
  app.use(router);
  const { server, url } = await listen(app);
  server.unref();
  const body = await (await fetch(`${url}/stem-cache/usage`)).json() as { usage: { bytes: number; stale: boolean } };
  assert.equal(body.usage.bytes, 80 * GB);
  assert.equal(body.usage.stale, true);
  await new Promise(r => server.close(r));
});

// A walk in flight while stems are dropped (forgetStems, or the orphan purge's
// moves) may have counted some of them. When the snapshot the walk started on
// was untrusted or absent, the drop leaves the file as it found it, so the
// file alone cannot tell the walk: the change token does. Whatever the
// snapshot's state, the walk must end with a figure that is either untrusted
// or right, never trusted and wrong.
test('a walk that a drop of stems lands in never stores a trusted figure that counts them', async () => {
  const states: Array<[string, () => void]> = [
    ['stale', () => writeSnap({ bytes: 80 * GB, dirs: 4000, stale: true })],
    ['over a day old', () => writeSnap({ bytes: 80 * GB, dirs: 4000, measuredAt: new Date(Date.now() - 2 * 24 * HOUR).toISOString() })],
    ['absent', () => rmSync(snapFile, { force: true })],
  ];
  const walkers: Array<[string, () => Promise<unknown>]> = [
    ['a read', () => stemCache.usage()],
    ['the sweep', () => stemCache.sweep(100 * GB, { force: true })],
  ];
  try {
    for (const [stateName, setState] of states) {
      for (const [walkerName, walk] of walkers) {
        const label = `${walkerName} on a snapshot ${stateName}`;
        rmSync(root, { recursive: true, force: true });
        mkdirSync(root, { recursive: true });
        writeFileSync(join(root, stemCache.STEMS_MARKER), '{}');
        for (const id of ['mid-0', 'mid-1', 'mid-2']) {
          mkdirSync(stemCache.dirFor(id), { recursive: true });
          writeFileSync(join(stemCache.dirFor(id), 'head-drums.flac'), 'x'.repeat(1000));
        }
        setState();
        let landed = false;
        // The walk has listed and measured all three dirs; the drop lands now.
        stemCache._duringWalkForTests(async () => {
          if (landed) return;
          landed = true;
          assert.equal((await stemCache.forgetStems(['mid-1'])).removed, 1);
        });
        await walk();
        stemCache._duringWalkForTests(null);
        assert.equal(landed, true, `${label}: the drop landed mid-walk`);
        let snap: Parameters<typeof stemCache.snapshotVerdict>[0]['snap'] = null;
        try { snap = JSON.parse(readFileSync(snapFile, 'utf8')); } catch { /* none stored */ }
        const verdict = stemCache.snapshotVerdict({ snap, root, nowMs: Date.now(), pendingAlive: false });
        if (verdict === 'use') {
          assert.deepEqual([snap?.bytes, snap?.dirs], [2000, 2], `${label}: a trusted figure must be the disk's`);
        }
        // And the next read gets the disk right.
        const u = await stemCache.usage();
        assert.deepEqual([u.bytes, u.dirs], [2000, 2], `${label}: the next read`);
      }
    }
  } finally {
    stemCache._duringWalkForTests(null);
    rmSync(root, { recursive: true, force: true });
    rmSync(snapFile, { force: true });
  }
});

// A pick-time separation writes its dir over seconds to minutes. A walk that
// lands in that time (the hourly sweep) counts the part written so far and
// stores it as a new measurement; the settle's full growth on top of that
// counted the part twice and stayed trusted. The settle now counts against
// the measurement read before the write began (beginTrackWrite).
test('a pick-time settle never adds growth a walk mid-separation already counted', async () => {
  try {
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, stemCache.STEMS_MARKER), '{}');
    for (const id of ['settled-0', 'settled-1']) {
      mkdirSync(stemCache.dirFor(id), { recursive: true });
      writeFileSync(join(stemCache.dirFor(id), 'head-drums.flac'), 'x'.repeat(1000));
    }
    rmSync(snapFile, { force: true });
    await stemCache.usage(); // a trusted measurement of the two dirs
    const base = await stemCache.beginTrackWrite('separating');
    assert.equal(base.bytes, null);
    // Half the set is written when the sweep's walk lands, and it stores what it found.
    mkdirSync(stemCache.dirFor('separating'), { recursive: true });
    writeFileSync(join(stemCache.dirFor('separating'), 'head-drums.flac'), 'x'.repeat(1000));
    await new Promise(r => setTimeout(r, 5)); // a later measuredAt than the first walk's
    await stemCache.sweep(100 * GB, { force: true });
    assert.equal(JSON.parse(readFileSync(snapFile, 'utf8')).dirs, 3, 'the walk counted the half-written dir');
    writeFileSync(join(stemCache.dirFor('separating'), 'head-vocals.flac'), 'x'.repeat(1000));
    await stemCache.settleTrackWrite('separating', base);

    const snap = JSON.parse(readFileSync(snapFile, 'utf8'));
    if (stemCache.snapshotVerdict({ snap, root, nowMs: Date.now(), pendingAlive: false }) === 'use') {
      assert.deepEqual([snap.bytes, snap.dirs], [4000, 3], 'a trusted figure must be the disk\'s');
    }
    const u = await stemCache.usage();
    assert.deepEqual([u.bytes, u.dirs], [4000, 3], 'the next read');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(snapFile, { force: true });
  }
});

// A full walk says why it walks, and the reason comes from the cascade that
// decided to walk (judgeSnapshot), not a second reading of the file: the copy
// that was here called another root's snapshot, or one dated ahead, "over a
// day old".
test('a walk logs the reason its snapshot was refused, from the same cascade', async () => {
  const cases: Array<[Record<string, unknown> | null, string]> = [
    [null, 'no stored size'],
    [{ root: '/elsewhere' }, 'another cache root'],
    [{ bytes: 'x' }, 'malformed'],
    [{ stale: true }, 'marked stale'],
    [{ measuredAt: new Date(Date.now() - 2 * 24 * HOUR).toISOString() }, 'over a day old'],
    [{ measuredAt: new Date(Date.now() + 2 * HOUR).toISOString() }, 'dated in the future'],
    [{ pending: { pid: 2 ** 22 + 12345, since: new Date().toISOString() } }, 'did not settle'],
  ];
  const logged: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => { logged.push(args.join(' ')); };
  try {
    for (const [over, reason] of cases) {
      if (over) writeSnap(over); else rmSync(snapFile, { force: true });
      logged.length = 0;
      await stemCache.usage();
      const line = logged.find(l => l.includes('measuring the stem cache')) ?? '';
      assert.ok(line.includes(reason), `${JSON.stringify(over)}: "${line}" names "${reason}"`);
    }
  } finally {
    console.log = log;
    rmSync(snapFile, { force: true });
  }
});

test('shared usage counts extended artifacts inside the track without adding a synthetic track', async () => {
  const track = join(root,'extended-track');
  const nested = join(track,'subbeats','v1','bundle');
  mkdirSync(nested,{recursive:true});
  writeFileSync(join(track,'head-drums.flac'),'regular');
  writeFileSync(join(nested,'head-drums.flac'),'extended');
  await stemCache.invalidateUsageSnapshot();
  const measured = await stemCache.usage();
  assert.equal(measured.bytes,15);
  assert.equal(measured.dirs,1);
});
