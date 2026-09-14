import assert from 'node:assert/strict';
import test from 'node:test';
import { projectWikipediaArtistDocument } from '../src/sleeve-notes/wikipedia.js';

test('Wikipedia artist documents retain a bounded revisioned plain-text source', () => {
  const document = projectWikipediaArtistDocument({ query: { pages: {
    '123': {
      title: 'Example Band', fullurl: 'https://en.wikipedia.org/wiki/Example_Band',
      extract: `Example Band formed in Liverpool. ${'History. '.repeat(5_000)}`,
      revisions: [{ revid: 456 }],
    },
  } } });
  assert.ok(document);
  assert.equal(document.revisionId, '456');
  assert.equal(document.url, 'https://en.wikipedia.org/wiki/Example_Band');
  assert.equal(document.text.length, 24_000);
  assert.match(document.attribution, /Wikipedia contributors/);
});

test('Wikipedia projection refuses an unrevisioned or empty result', () => {
  assert.equal(projectWikipediaArtistDocument({ query: { pages: {
    '123': { title: 'Example', fullurl: 'https://example.test', extract: 'Text', revisions: [] },
  } } }), null);
});
