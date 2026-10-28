import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAdjacent, orderedAlbumSongs } from '../src/music/sub-flow-order.js';

const album = { id: 'album', songCount: 4, song: [
  { id: 'c', albumId: 'album', discNumber: 2, track: 1 },
  { id: 'a', albumId: 'album', discNumber: 1, track: 1 },
  { id: 'd', albumId: 'album', discNumber: 2, track: 2 },
  { id: 'b', albumId: 'album', discNumber: 1, track: 2 },
] };

test('the album order includes the boundary between discs', () => {
  const ordered = orderedAlbumSongs('album', album);
  assert.deepEqual(ordered.map(song => song.id), ['a', 'b', 'c', 'd']);
  assert.doesNotThrow(() => assertAdjacent(['b', 'c'], ordered));
  assert.doesNotThrow(() => assertAdjacent(['a', 'b', 'c'], ordered));
  assert.throws(() => assertAdjacent(['a', 'c'], ordered), /consecutive/);
  assert.throws(() => assertAdjacent(['b', 'a'], ordered), /consecutive/);
  assert.throws(() => assertAdjacent(['b', 'missing'], ordered), /consecutive/);
});

test('incomplete or ambiguous albums never supply a guessed order', () => {
  assert.throws(() => orderedAlbumSongs('album', { ...album, songCount: 5 }), /complete/);
  assert.throws(() => orderedAlbumSongs('album', { ...album, song: album.song.slice(1) }), /complete/);
  assert.throws(() => orderedAlbumSongs('album', { ...album, song: album.song.map((s, i) => i === 0 ? { ...s, track: 2 } : s) }), /numbering/);
  assert.throws(() => orderedAlbumSongs('album', { ...album, song: album.song.map((s, i) => i === 0 ? { ...s, discNumber: undefined } : s) }), /numbering/);
  assert.throws(() => orderedAlbumSongs('album', { ...album, song: album.song.map((s, i) => i === 0 ? { ...s, albumId: 'other' } : s) }), /numbering/);
});

test('single-disc tracks can omit the disc number', () => {
  assert.deepEqual(orderedAlbumSongs('album', { id: 'album', songCount: 2, song: [
    { id: 'a', track: 1 }, { id: 'b', track: 2 },
  ] }).map(song => song.id), ['a', 'b']);
});

test('track numbers can also continue across disc boundaries', () => {
  const continuous = { ...album, song: album.song.map(song => song.discNumber === 2 ? { ...song, track: song.track + 2 } : song) };
  assert.doesNotThrow(() => assertAdjacent(['b', 'c'], orderedAlbumSongs('album', continuous)));
});

test('missing non-audio discs do not reject valid pairs on other discs', () => {
  // The station's Dark Side of the Moon box set contains audio discs 1, 2 and 6.
  const song = [1, 2, 6].flatMap(discNumber => Array.from({ length: discNumber === 6 ? 16 : 10 }, (_, i) => ({
    id: `${discNumber}-${i + 1}`, discNumber, track: i + 1,
  })));
  const ordered = orderedAlbumSongs('album', { id: 'album', songCount: 36, song });
  assert.equal(ordered.length, 36);
  assert.doesNotThrow(() => assertAdjacent(['1-1', '1-2'], ordered));
  assert.doesNotThrow(() => assertAdjacent(['6-8', '6-9'], ordered));
  assert.throws(() => assertAdjacent(['2-10', '6-1'], ordered), /consecutive/);
});

test('missing track numbers prevent only joins across the gap', () => {
  const ordered = orderedAlbumSongs('album', { id: 'album', songCount: 4, song: [
    { id: 'a', track: 2 }, { id: 'b', track: 3 }, { id: 'c', track: 5 }, { id: 'd', track: 6 },
  ] });
  assert.doesNotThrow(() => assertAdjacent(['a', 'b'], ordered));
  assert.doesNotThrow(() => assertAdjacent(['c', 'd'], ordered));
  assert.throws(() => assertAdjacent(['b', 'c'], ordered), /consecutive/);
});
