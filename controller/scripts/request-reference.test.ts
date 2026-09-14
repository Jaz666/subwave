import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseRequestReferenceCandidate,
  resolveRequestReference,
} from '../src/music/request-reference.js';

test('a described request resolves through web evidence into the local library', async () => {
  const calls: string[] = [];
  const resolved = await resolveRequestReference('the song from the new Dune movie', {
    searchWeb: async reference => {
      calls.push(`web:${reference}`);
      return {
        answer: 'The soundtrack single is A Time of Quiet Between the Storms by Hans Zimmer.',
        results: [{ title: 'Dune: Part Two soundtrack', content: 'Hans Zimmer released the track in 2024.' }],
      };
    },
    identifyTrack: async (reference, evidence) => {
      calls.push(`identify:${reference}:${evidence.includes('Hans Zimmer')}`);
      return {
        title: 'A Time of Quiet Between the Storms',
        artist: 'Hans Zimmer',
        keyword: 'Quiet Between',
      };
    },
    searchLibrary: async query => {
      calls.push(`library:${query}`);
      return [
        { id: 'other', title: 'Beginnings Are Such Delicate Times', artist: 'Hans Zimmer' },
        { id: 'wanted', title: 'A Time of Quiet Between the Storms', artist: 'Hans Zimmer' },
      ];
    },
    resolveArtist: async () => null,
  });

  assert.deepEqual(calls, [
    'web:the song from the new Dune movie',
    'identify:the song from the new Dune movie:true',
    'library:Hans Zimmer A Time of Quiet Between the Storms',
  ]);
  assert.equal(chooseRequestReferenceCandidate(resolved)?.id, 'wanted');
});

test('missing web evidence fails open without an identification or library call', async () => {
  let downstreamCalls = 0;
  const resolved = await resolveRequestReference('an unknown advert song', {
    searchWeb: async () => ({ answer: '', results: [] }),
    identifyTrack: async () => {
      downstreamCalls++;
      return null;
    },
    searchLibrary: async () => {
      downstreamCalls++;
      return [];
    },
    resolveArtist: async () => null,
  });

  assert.equal(resolved, null);
  assert.equal(downstreamCalls, 0);
});
