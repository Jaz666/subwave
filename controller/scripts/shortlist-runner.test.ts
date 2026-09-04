import assert from 'node:assert/strict';
import test from 'node:test';
import { executeShortlistPlan, replayFixtureTrace } from '../src/music/shortlist.js';
import { pickerScope } from '../src/llm/tools.js';

test('makes a redacted, replayable trace with source arguments and candidate ids', () => {
  const trace = replayFixtureTrace({
    currentTrack: { id: 'current', title: 'Current Song', artist: 'Current Artist', album: 'Album' },
    show: { id: 'show-1', name: 'Night Shift', genres: ['ambient'], filtersStrict: true },
    scope: pickerScope({
      recentIds: new Set(['recent-b', 'recent-a']),
      playlistTracks: [{ id: 'playlist-track', title: 'Never logged' }],
      audioWaypoint: [0.1, 0.2],
    }),
    toolCalls: [{
      name: 'tracksLikeThis', args: { songId: 'current' }, round: 2,
      result: { tracks: [{ id: 'candidate-a', title: 'Only the id survives' }] },
    }],
  });

  assert.deepEqual(trace.sourceCalls, [{
    source: 'tracksLikeThis', args: { songId: 'current' }, round: 2, candidateIds: ['candidate-a'],
  }]);
  assert.deepEqual(trace.scope.recentIds, ['recent-a', 'recent-b']);
  assert.deepEqual(trace.scope.playlistTrackIds, ['playlist-track']);
  assert.equal(trace.currentTrack.title, 'Current Song');
  assert.equal('title' in trace.sourceCalls[0], false);
});

test('replays a source plan, keeping the picker accumulator as the source of truth', async () => {
  const seen = new Map<string, any>();
  const tools = {
    energy: {
      inputSchema: { safeParse: (value: unknown) => ({ success: true, data: value }) },
      execute: async () => {
        seen.set('a', { id: 'a', title: 'One' });
        seen.set('b', { id: 'b', title: 'Two' });
        return [{ id: 'a' }, { id: 'b' }];
      },
    },
    duplicate: {
      inputSchema: { safeParse: (value: unknown) => ({ success: true, data: value }) },
      execute: async () => [{ id: 'a' }],
    },
  };

  const result = await executeShortlistPlan(tools, seen, [
    { source: 'energy', args: { energy: 'high' } },
    { source: 'duplicate', args: {} },
    { source: 'unavailable', args: {} },
  ]);

  assert.equal(result.uniqueCandidates, 2);
  assert.deepEqual(result.candidates.map((candidate) => candidate.id), ['a', 'b']);
  assert.deepEqual(result.candidates[0].shortlistSources, ['energy']);
  assert.deepEqual(result.sourceRuns.map((run) => [run.source, run.status, run.returned, run.accepted]), [
    ['energy', 'ok', 2, 2],
    ['duplicate', 'ok', 1, 0],
    ['unavailable', 'unavailable', 0, 0],
  ]);
});

test('records invalid input and source errors without abandoning later sources', async () => {
  const seen = new Map<string, any>();
  const tools = {
    invalid: {
      inputSchema: { safeParse: () => ({ success: false, error: { issues: [{ message: 'query required' }] } }) },
      execute: async () => { throw new Error('must not run'); },
    },
    failed: {
      execute: async () => { throw new Error('library offline'); },
    },
  };

  const result = await executeShortlistPlan(tools, seen, [
    { source: 'invalid', args: {} },
    { source: 'failed', args: {} },
  ]);

  assert.deepEqual(result.sourceRuns.map((run) => [run.status, run.error]), [
    ['invalid', 'query required'],
    ['error', 'library offline'],
  ]);
});
