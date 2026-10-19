import assert from 'node:assert/strict';
import test from 'node:test';
import { GeniusProvider, projectGeniusSong, selectGeniusSearchHit } from '../src/sleeve-notes/genius.js';
import { clearProviderCallsForTest, recentProviderCalls } from '../src/sleeve-notes/telemetry.js';

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
    producer_artists: [{ name: 'A Producer' }],
    writer_artists: [{ name: 'A Writer' }],
    song_relationships: [
      { relationship_type: 'samples', songs: [{ id: 11, title: 'Source', url: 'https://genius.com/source', primary_artist: { name: 'Source Artist' } }] },
      { relationship_type: 'remixed_by', songs: [{ id: 12, title: 'Ignore', url: 'https://genius.com/ignore' }] },
    ],
  } } });
  assert.deepEqual(result?.credits, [
    { role: 'Producer', names: ['A Producer'] },
    { role: 'Writer', names: ['A Writer'] },
  ]);
  assert.deepEqual(result?.relationships, [{ type: 'samples', target: { providerId: '11', canonicalUrl: 'https://genius.com/source', title: 'Source', artist: 'Source Artist' } }]);
});

test('Genius provider uses only search then song endpoints', async () => {
  clearProviderCallsForTest();
  const calls: string[] = [];
  const provider = new GeniusProvider('not-a-real-token', async (url) => {
    calls.push(url);
    return new Response(JSON.stringify(calls.length === 1 ? search : { response: { song: {
      id: 10, title: 'The Song', url: 'https://genius.com/y', primary_artist: { name: 'The Band' }, custom_performances: [], song_relationships: [],
    } } }), { status: 200 });
  }, async () => {});
  await provider.fetch({ kind: 'track', title: 'The Song', artist: 'The Band' }, new AbortController().signal);
  assert.deepEqual(calls.map((url) => new URL(url).pathname), ['/search', '/songs/10']);
  assert.deepEqual(recentProviderCalls().map((call) => [call.endpoint, call.ok, call.status]), [
    ['song', true, 200], ['search', true, 200],
  ]);
  assert.ok(recentProviderCalls().every((call) => Number.isFinite(call.ms) && call.ms >= 0));
});

test('known Genius song IDs skip search and send an identifiable User-Agent', async () => {
  const calls: string[] = [];
  const provider = new GeniusProvider('test', async (url, init) => {
    calls.push(new URL(url).pathname);
    assert.match(new Headers(init?.headers).get('User-Agent') ?? '', /Subwave/);
    return Response.json({ response: { song: {
      id: 10, title: 'The Song', url: 'https://genius.com/y', primary_artist: { name: 'The Band' },
    } } });
  }, async () => { throw new Error('Direct fetch should not schedule a search delay'); });
  const entity = { kind: 'track' as const, title: 'The Song', artist: 'The Band' };
  assert.equal((await provider.fetchSong('10', entity, new AbortController().signal))?.identity.providerId, '10');
  assert.deepEqual(calls, ['/songs/10']);
  await assert.rejects(provider.fetchSong('../search', entity, new AbortController().signal), /Invalid Genius song ID/);
  assert.equal(calls.length, 1);
});

test('song detail refuses mismatched identity without searching for a replacement', async () => {
  let calls = 0;
  for (const song of [
    { id: 11, title: 'The Song', artist: 'The Band' },
    { id: 10, title: 'The Song (Live)', artist: 'The Band' },
    { id: 10, title: 'The Song', artist: 'Another Band' },
  ]) {
    const provider = new GeniusProvider('test', async () => {
      calls++;
      return Response.json({ response: { song: {
        ...song, primary_artist: { name: song.artist }, url: 'https://genius.com/y',
      } } });
    });
    assert.equal(await provider.fetchSong('10', { kind: 'track', title: 'The Song', artist: 'The Band' },
      new AbortController().signal), null);
  }
  assert.equal(calls, 3);
});
