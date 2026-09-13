import assert from 'node:assert/strict';
import test from 'node:test';
import { GeniusProvider, projectGeniusSong, selectGeniusSearchHit } from '../src/sleeve-notes/genius.js';
import { exactLocalMatches } from '../src/sleeve-notes/resolver.js';

const search = { response: { hits: [
  { result: { id: 9, title: 'Different Song', url: 'https://genius.com/x', primary_artist: { name: 'Band' } } },
  { result: { id: 10, title: 'The Song', url: 'https://genius.com/y', primary_artist: { name: 'The Band' } } },
] } };

test('Genius search requires an exact title and artist match', () => {
  assert.equal(selectGeniusSearchHit(search, { kind: 'track', title: 'The Song', artist: 'The Band' }), '10');
  assert.equal(selectGeniusSearchHit(search, { kind: 'track', title: 'The Song', artist: 'Someone Else' }), null);
});

test('Genius projection retains only approved credits and relationships', () => {
  const result = projectGeniusSong({ response: { song: {
    id: 10, title: 'The Song', url: 'https://genius.com/y', primary_artist: { name: 'The Band' },
    lyrics: 'must not be used', description: { plain: 'nor this' },
    custom_performances: [
      { label: 'Producer', artists: [{ name: 'A Producer' }] },
      { label: 'Guitar', artists: [{ name: 'A Guitarist' }] },
    ],
    song_relationships: [
      { relationship_type: 'samples', songs: [{ id: 11, title: 'Source', url: 'https://genius.com/source', primary_artist: { name: 'Source Artist' } }] },
      { relationship_type: 'remixed_by', songs: [{ id: 12, title: 'Ignore', url: 'https://genius.com/ignore' }] },
    ],
  } } });
  assert.deepEqual(result?.credits, [{ role: 'Producer', names: ['A Producer'] }]);
  assert.deepEqual(result?.relationships, [{ type: 'samples', target: { providerId: '11', canonicalUrl: 'https://genius.com/source', title: 'Source', artist: 'Source Artist' } }]);
});

test('Genius provider uses only search then song endpoints', async () => {
  const calls: string[] = [];
  const provider = new GeniusProvider('not-a-real-token', async (url) => {
    calls.push(url);
    return new Response(JSON.stringify(calls.length === 1 ? search : { response: { song: {
      id: 10, title: 'The Song', url: 'https://genius.com/y', primary_artist: { name: 'The Band' }, custom_performances: [], song_relationships: [],
    } } }), { status: 200 });
  }, async () => {});
  await provider.fetch({ kind: 'track', title: 'The Song', artist: 'The Band' }, new AbortController().signal);
  assert.deepEqual(calls.map((url) => new URL(url).pathname), ['/search', '/songs/10']);
});

test('local relation matching never accepts a title-only candidate', () => {
  const matches = exactLocalMatches({ title: 'Bitter Sweet Symphony', artist: 'The Verve' }, [
    { id: 'wrong', title: 'Bitter Sweet Symphony', artist: 'Other Artist' },
    { id: 'right', title: 'Bitter Sweet Symphony', artist: 'The Verve' },
  ]);
  assert.deepEqual(matches.map((track) => track.id), ['right']);
});
