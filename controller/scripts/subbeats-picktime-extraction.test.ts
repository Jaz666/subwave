import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createStemBeatsPickTimeWorkspace, extractPreparedSubbeatsPair, stemBeatsWindowKey,
  type StemBeatsWindowRequest } from '../src/music/subbeats-picktime-extraction.js';

test('fractional recording ends retain the complete outgoing samples without requesting audio past EOF', async () => {
  const sampleRate = 44100;
  const frames = 180 * sampleRate + 5444;
  const durationSeconds = frames / sampleRate;
  const role = (outgoing: boolean) => ({ state: 'cue-ready' as const, runId: 'fixture',
    role: outgoing ? 'outgoing' as const : 'incoming' as const,
    job: { id: outgoing ? 'out' : 'in', source: { durationSeconds, bytes: 123,
      sha256: 'a'.repeat(64) } } as never,
    cues: [{ sourceSeconds: outgoing ? 140.123456 : 30.123456,
      ...(outgoing ? { phraseEndSeconds: 160.123456 } : {}),
      bpm: outgoing ? 128 : 124, strength: 1, reason: 'repetition' as const }], grid: {} as never });
  const requests: StemBeatsWindowRequest[] = [];
  const workspace = { directory: '/fixture', release: async () => {},
    extract: async (request: StemBeatsWindowRequest, _source: string, directory: string) => {
      requests.push(request);
      return { directory, evidence: {} };
    } };
  const result = await extractPreparedSubbeatsPair(role(true), role(false),
    { outgoing: '/out.audio', incoming: '/in.audio' }, workspace,
    Date.now() + 120000, new AbortController().signal, () => {});
  assert.ok(result.windows);
  assert.equal(Math.round(requests[0].endMs * sampleRate / 1000), frames,
    'rounding the endpoint down to a whole millisecond discards real outgoing audio');
  for (const request of requests) {
    assert.ok(request.endMs <= durationSeconds * 1000);
    for (const ms of [request.startMs, request.endMs]) {
      const position = ms * sampleRate / 1000;
      assert.ok(Math.abs(position - Math.round(position)) < 1e-7,
        'window boundaries must describe exact source samples');
    }
  }
});

test('pick-time extraction workspace stays under the Stem Beats feature root and retires after use', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'stembeats-workspace-'));
  try {
    const root = path.join(temp, 'stems', 'stembeats', 'pick-time');
    const workspace = await createStemBeatsPickTimeWorkspace(root);
    assert.ok(workspace.directory.startsWith(root + path.sep));
    assert.equal(await readFile(path.join(workspace.directory, '.subwave-stembeats'), 'utf8'), '');
    const request = { trackId: 'track', side: 'tail' as const, startMs: 1000, endMs: 9000,
      sourceSha256: 'a'.repeat(64), sourceBytes: 123 };
    assert.equal(stemBeatsWindowKey(request), stemBeatsWindowKey(request));
    assert.notEqual(stemBeatsWindowKey(request), stemBeatsWindowKey({ ...request, endMs: 10000 }));
    await workspace.release();
    await assert.rejects(stat(workspace.directory));

    const inFlight = await createStemBeatsPickTimeWorkspace(root);
    await inFlight.release(true);
    const protectedPath = inFlight.directory;
    const next = await createStemBeatsPickTimeWorkspace(root);
    await stat(protectedPath);
    await writeFile(path.join(protectedPath, '.stembeats-busy.json'), JSON.stringify({ until: 0 }));
    await next.release();
    const sweep = await createStemBeatsPickTimeWorkspace(root);
    await stat(protectedPath); // completed windows remain available for the bounded preview
    await writeFile(path.join(protectedPath, '.stembeats-preview.json'), JSON.stringify({ until: 0 }));
    await sweep.release();
    const expired = await createStemBeatsPickTimeWorkspace(root);
    await assert.rejects(stat(protectedPath));
    await expired.release();
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('pick-time extraction workspace refuses a symlinked feature path', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'stembeats-symlink-'));
  try {
    const actual = path.join(temp, 'actual');
    const linked = path.join(temp, 'linked');
    await mkdir(actual);
    await symlink(actual, linked);
    await assert.rejects(createStemBeatsPickTimeWorkspace(path.join(linked, 'pick-time')), /real directory/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
