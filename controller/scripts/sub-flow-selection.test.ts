import assert from 'node:assert/strict';
import test from 'node:test';
import { selectionFlows, flowForPrompt } from '../src/music/sub-flow-selection.js';
import { pickerScope, buildPickerTools } from '../src/llm/tools.js';
import type { Flow } from '../src/music/sub-flow.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../src/config.js';
import { coldLoadSettings } from './test-utils/settings.js';
import * as settings from '../src/settings.js';
import { queue } from '../src/broadcast/queue.js';
import { trimLinkToIntro } from '../src/broadcast/dj-agent/enqueue.js';
import { linkPrompt } from '../src/llm/internal/prompts/scripts.js';

const flow: Flow = {
  id: '01921dc2-7451-41b4-8c9c-6b73294c5000', name: 'Album sequence', revision: 1, enabled: true,
  orderVerified: true, verification: 'verified', verificationError: null, createdAt: '', updatedAt: '',
  tracks: [23, 240, 180].map((duration, index) => ({
    id: `member-${index}`, title: `Track ${index + 1}`, artist: 'Artist', album: 'Album', duration,
    fingerprint: { sha256: 'a'.repeat(64), bytes: 100, decodedSeconds: duration },
  })),
};
const scope = () => pickerScope({ automaticFlows: true, minTrackSec: 60, flowMaxTrackSec: 300 });
const lookup = (id: string) => ({ id, genre: 'Rock', bpm: id === 'member-0' ? 90 : 160 });
const resolve = (ids: string[], patch: Partial<ReturnType<typeof pickerScope>> = {}, definitions = [flow]) =>
  selectionFlows(ids.map(id => ({ id })), { ...scope(), ...patch }, definitions, lookup);

test('each member resolves to the same entry and complete ordered scheduling unit', () => {
  for (const track of flow.tracks) {
    const [entry] = resolve([track.id]);
    assert.equal(entry?.id, 'member-0');
    assert.equal((entry as any).bpm, 90, 'entry analysis is never copied from a companion');
    assert.equal(entry?.subFlow?.duration, 443);
    assert.deepEqual(entry?.subFlow?.tracks.map(member => member.id), flow.tracks.map(member => member.id));
    assert.doesNotMatch(JSON.stringify(entry?.subFlow), /sha256|fingerprint/);
  }
  assert.equal(resolve(['member-2', 'member-0', 'member-1']).length, 1, 'one discovery opportunity');
});

test('the total may exceed the track cap; an individual member may not unless overridden', () => {
  assert.equal(resolve(['member-2']).length, 1);
  assert.equal(resolve(['member-2'], { flowMaxTrackSec: 200 }).length, 0);
  assert.equal(resolve(['member-2'], { flowMaxTrackSec: 200, flowAllowAboveMax: true }).length, 1);
  assert.equal(resolve(['member-2'], { minTrackSec: 500 }).length, 0);
});

test('all members must pass history, exclusions, playlist membership and strict music rules', () => {
  for (const patch of [
    { recentIds: new Set(['member-1']) }, { recentKeys: new Set(['track 3|artist']) },
    { hardRecentIds: new Set(['member-2']) }, { hardRecentKeys: new Set(['track 2|artist']) },
    { excludedIds: new Set(['member-0']) }, { playlistLock: new Set(['member-1', 'member-2']) },
    { genreLock: ['Jazz'] }, { flowUnavailable: true }, { flowAvoidArtistRoots: new Set(['artist']) },
  ]) assert.equal(resolve(['member-2'], patch).length, 0, JSON.stringify(patch));
  assert.equal(resolve(['member-2'], { genreLock: ['Rock'] }).length, 1);
});

test('unchecked enabled definitions cannot silently fall back to one member; requests remain individual', () => {
  for (const definition of [
    { ...flow, verification: 'failed' as const }, { ...flow, orderVerified: false },
    { ...flow, tracks: flow.tracks.map(track => ({ ...track, fingerprint: null })) },
  ]) assert.equal(resolve(['member-1'], {}, [definition]).length, 0);
  assert.deepEqual(resolve(['member-1'], { automaticFlows: false }), [{ id: 'member-1' }]);
  assert.deepEqual(resolve(['member-1'], {}, [{ ...flow, enabled: false }]), [{ id: 'member-1' }]);
});

test('a definition edited or disabled during selection refuses the stale unit', () => {
  const candidates = resolve(['member-2']);
  assert.equal(selectionFlows(candidates, scope(), [{ ...flow, revision: 2 }], lookup).length, 0);
  assert.equal(selectionFlows(candidates, scope(), [], lookup).length, 0);
});

test('global override persists through cold load and a show can explicitly turn it off', async () => {
  await coldLoadSettings({ picker: { flowAllowAboveMax: true } });
  assert.equal(settings.get().picker.flowAllowAboveMax, true);
  const personaId = settings.get().personas[0]!.id;
  await settings.update({ picker: { flowAllowAboveMax: false }, shows: [
    { id: 'flow_show', name: 'Flow Show', personaId, flowAllowAboveMax: false },
  ] });
  const saved = await coldLoadSettings(settings.get());
  assert.equal(saved.picker.flowAllowAboveMax, false);
  assert.equal(saved.shows[0]?.flowAllowAboveMax, false);
  await settings.update({ picker: { flowAllowAboveMax: false } });
  assert.equal(settings.get().picker.flowAllowAboveMax, false);
  await assert.rejects(() => settings.update({ picker: { flowAllowAboveMax: 'sometimes' } }));
});

test('a complete Flow must fit before a firm show change, even with the length override on', async () => {
  const start = Date.now();
  const boundary = start + 200_000;
  const personaId = settings.get().personas[0]!.id;
  const schedule = Object.fromEntries(Array.from({ length: 7 }, (_, day) => [day, Array(24).fill('flow_show')]));
  await settings.update({ timezone: 'UTC', fadeAtShowEnd: true,
    shows: [{ id: 'flow_show', name: 'Flow Show', personaId }], schedule,
    scheduleOverride: { showId: null, startedAt: boundary, expiresAt: boundary + 3600_000 },
  });
  assert.equal(resolve(['member-1'], { flowStartMs: start, flowAllowAboveMax: true }).length, 0);
  assert.equal(resolve(['member-1'], { flowStartMs: boundary + 1 }).length, 1);
  await settings.update({ fadeAtShowEnd: false });
});

test('real discovery offers an ordered Flow once and keeps a short opener despite the track floor', async () => {
  writeFileSync(join(config.stateDir, 'sub-flows.json'), JSON.stringify([flow]));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ 'subsonic-response': { status: 'ok', randomSongs: { song: flow.tracks } } })) as typeof fetch;
  try {
    const { tools, seen } = buildPickerTools(scope());
    const tool = tools.randomSongs as any;
    await tool.execute({}, { toolCallId: 'flow-discovery', messages: [], abortSignal: AbortSignal.timeout(5000) });
    assert.deepEqual([...seen.keys()], ['member-0']);
    assert.equal(seen.get('member-0').subFlow.duration, 443);
  } finally { globalThis.fetch = originalFetch; }
});

test('Flow introduction names the ordered sequence, budgets its real entry and drops a tiny opening', () => {
  const entry = resolve(['member-2'])[0]!;
  const prompt = linkPrompt({ current: entry, flow: flowForPrompt(entry.subFlow) });
  assert.match(prompt, /first listed track is playing now/);
  assert.match(prompt, /Here’s a nice flow of tracks from \[album\] by \[artist\]/);
  assert.match(prompt, /rather than listing every track title/);
  assert.match(prompt, /Track 1.*Track 2.*Track 3/s);
  const short = { ...entry, duration: 2 };
  assert.equal(trimLinkToIntro('Here is our next sequence.', short), null);
});

test('automatic queue admission captures the whole Flow, measured members and only one entry link', async () => {
  queue.current = null; queue.upcoming = [];
  const originalDrain = queue.drainToLiquidsoap;
  queue.drainToLiquidsoap = async () => {};
  const playback = { occurrenceId: 'test', definitionId: flow.id, revision: 1, label: flow.name,
    path: '/unused-test.wav', members: flow.tracks.map(({ id, title, artist, album, duration }) => ({ id, title, artist, album, duration: duration! })) };
  try {
    await queue.queueFlow(playback, { automatic: true, introScript: 'The ordered album sequence.', introKind: 'link',
      ...({ track: { id: 'wrong', sweep: true } } as object) });
    assert.deepEqual(queue.upcoming.map(item => item.track.id), flow.tracks.map(track => track.id));
    assert.ok(queue.upcoming.every(item => item.aiPicked && !item.requestedBy && !item.operator && !item.track.sweep));
    assert.deepEqual(queue.upcoming.map(item => item.introScript), ['The ordered album sequence.', undefined, undefined]);
    assert.equal(queue.heldPlayableSec(queue.upcoming[0]!), 23);
  } finally { queue.drainToLiquidsoap = originalDrain; queue.upcoming = []; }
});
