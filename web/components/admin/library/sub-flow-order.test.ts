import assert from 'node:assert/strict';
import { test } from 'node:test';
import { albumSelection } from './sub-flow-order';

test('only neighbouring tracks from the same complete order are offered', () => {
  const album = [{ id: 'one', order: 0 }, { id: 'two', order: 1 }, { id: 'three', order: 2 }];
  assert.deepEqual(albumSelection(['two', 'one'], album), ['one', 'two']);
  assert.deepEqual(albumSelection(['two', 'three', 'one'], album), ['one', 'two', 'three']);
  assert.equal(albumSelection(['one', 'three'], album), null);
  assert.equal(albumSelection(['one', 'other-album'], album), null);
  assert.equal(albumSelection(['one', 'three'], album.filter(track => track.id !== 'two')), null);
});
