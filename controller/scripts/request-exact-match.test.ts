// Exact title + artist is a listener promise, not an editorial pool. This
// pins the narrow deterministic match that runs before broad request search.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exactTitleByArtist, resolveNamedRequest } from '../src/music/request-match.js';
import { normaliseRequestSort } from '../src/llm/internal/prompts/request.js';

const candidates = [
  { id: 'other-grace', title: 'Private Life', artist: 'Grace Jones' },
  { id: 'wanted', title: 'Slave to the Rhythm', artist: 'Grace Jones' },
  { id: 'cover', title: 'Slave to the Rhythm', artist: 'A Different Artist' },
];

assert.equal(
  exactTitleByArtist(candidates, { titles: ['Slave to the Rhythm'], artist: 'Grace Jones' })?.id,
  'wanted',
);
assert.equal(
  exactTitleByArtist(candidates, { titles: ['SLAVE TO THE RHYTHM!'], artist: 'grace-jones' })?.id,
  'wanted',
  'case, punctuation, and accents should not turn an exact listener request into a broad pick',
);
assert.equal(
  exactTitleByArtist(candidates, { titles: ['Slave to the Rhythm'], artist: 'Unknown Artist' }),
  null,
  'a title-only hit must not override an explicitly named different artist',
);
assert.equal(exactTitleByArtist(candidates, { titles: [], artist: 'Grace Jones' }), null);

for (const [title, artist] of [
  ['Пачка сигарет', 'Кино'],
  ['上を向いて歩こう', '坂本九'],
  ['ਤੂੰ ਹੀ ਤੂੰ', 'ਅਮਰਿੰਦਰ ਗਿੱਲ'],
]) {
  assert.equal(
    exactTitleByArtist([{ id: 'wanted', title, artist }], { titles: [title], artist })?.id,
    'wanted',
    `exact matching must preserve the script used by ${artist}`,
  );
}

assert.equal(normaliseRequestSort('none'), null);
assert.equal(normaliseRequestSort('LATEST'), 'latest');
assert.equal(normaliseRequestSort('something else'), null);

let artistFallbackCalls = 0;
const named = await resolveNamedRequest(
  {
    terms: ['Blank Space', 'Taylor Swift'],
    artist: 'Taylor Swift',
    sort: 'popular',
    scope: 'song',
  },
  {
    searchTitle: async title => title === 'Blank Space'
      ? [
          { id: 'other', title: 'Style', artist: 'Taylor Swift' },
          { id: 'wanted', title: 'Blank Space', artist: 'Taylor Swift' },
        ]
      : [],
    pickArtist: async () => {
      artistFallbackCalls++;
      return { id: 'artist-random', title: 'Style', artist: 'Taylor Swift' };
    },
  },
);
assert.equal(named?.track.id, 'wanted', 'an exact title must outrank a valid artist sort');
assert.equal(named?.source, 'search:exact-title-artist');
assert.equal(artistFallbackCalls, 0, 'the artist catalogue must not run after an exact hit');

const exactMiss = await resolveNamedRequest(
  {
    terms: ['Missing Song', 'Taylor Swift'],
    artist: 'Taylor Swift',
    sort: 'popular',
    scope: 'song',
  },
  {
    searchTitle: async () => [],
    pickArtist: async () => {
      artistFallbackCalls++;
      return { id: 'artist-fallback', title: 'Style', artist: 'Taylor Swift' };
    },
  },
);
assert.equal(exactMiss?.track.id, 'artist-fallback', 'a sorted artist request remains the forgiving fallback after an exact miss');
assert.equal(exactMiss?.source, 'artist-sort');

const routeSource = readFileSync(new URL('../src/routes/request.ts', import.meta.url), 'utf8');
const exactPass = routeSource.indexOf('await resolveNamedRequest(');
const broadPool = routeSource.indexOf('const songOffset = Math.floor(Math.random() * 3) * 25;');
assert.ok(exactPass >= 0 && broadPool > exactPass,
  'the deterministic title + artist pass must run before the random broad search pool');

console.log('request exact match: all assertions passed');
