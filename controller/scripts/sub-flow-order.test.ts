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
