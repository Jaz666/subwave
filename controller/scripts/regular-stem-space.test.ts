import assert from 'node:assert/strict';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { requireRegularStemSpace, regularStemWindowBytes } from '../src/broadcast/regular-stem-space.js';

const MiB = 1024 * 1024;
const requests = [{ directory: '/staging', bytes: 20*MiB }, { directory: '/working', bytes: 100*MiB }];

test('space admission sums a shared volume, keeps a station margin, and checks separate volumes', async () => {
  const inspect = async () => ({ device: 1, available: 375*MiB });
  await assert.rejects(requireRegularStemSpace(requests, inspect), /Insufficient free space/);
  await requireRegularStemSpace(requests, async () => ({ device: 1, available: 376*MiB }));
  await requireRegularStemSpace(requests, async directory => ({ device: directory === '/staging' ? 1 : 2, available: 356*MiB }));
  await assert.rejects(requireRegularStemSpace(requests, async directory => ({
    device: directory === '/staging' ? 1 : 2, available: directory === '/staging' ? 275*MiB : 1000*MiB,
  })), /Insufficient free space/);
});

test('unknown space and invalid estimates stand down; checks do not create missing directories', async () => {
  await assert.rejects(requireRegularStemSpace(requests, async () => ({ device: 1, available: NaN })), /unavailable/);
  await assert.rejects(requireRegularStemSpace(requests, async () => { throw new Error('volume offline'); }), /volume offline/);
  await assert.rejects(requireRegularStemSpace([{directory:'/working',bytes:-1}]), /Invalid/);
  const missing = path.join(tmpdir(), `regular-space-${randomUUID()}`, 'nested');
  // A nearly full host may refuse, but must still resolve the missing child's
  // filesystem without creating that directory just to measure it.
  await requireRegularStemSpace([{directory:missing,bytes:0}])
    .catch(error => assert.match(error.message, /Insufficient free space/));
  await assert.rejects(access(missing));
});

test('window estimates bound slow-track output without assuming compressed stems', () => {
  assert.ok(regularStemWindowBytes(0, 120000) > 600*MiB);
  assert.ok(regularStemWindowBytes(1000, 21000) < regularStemWindowBytes(0, 120000));
  for (const end of [0, -1, 120001, Infinity, NaN]) assert.throws(() => regularStemWindowBytes(0, end));
});
