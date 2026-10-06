import assert from 'node:assert/strict';
import test from 'node:test';
import { englishWikipediaTitleFromWikidata, projectWikipediaArtistDocument, wikidataIdFromMusicBrainzArtist } from '../src/sleeve-notes/wikipedia.js';
import { parseWikipediaSparks } from '../src/sleeve-notes/wikipedia-extract.js';

test('Wikipedia artist documents retain a bounded revisioned plain-text source', () => {
  const document = projectWikipediaArtistDocument({ query: { pages: {
    '123': {
      title: 'Example Band', fullurl: 'https://en.wikipedia.org/wiki/Example_Band',
      extract: `Example Band formed in Liverpool. ${'History. '.repeat(50_000)}`,
      revisions: [{ revid: 456 }],
    },
  } } });
  assert.ok(document);
  assert.equal(document.revisionId, '456');
  assert.equal(document.url, 'https://en.wikipedia.org/wiki/Example_Band');
  assert.equal(document.text.length, 250_000);
  assert.match(document.attribution, /Wikipedia contributors/);
});

test('Wikipedia identity comes from the MusicBrainz artist relation, not a loose name search', () => {
  assert.equal(wikidataIdFromMusicBrainzArtist({ relations: [{ type: 'wikidata', url: { resource: 'https://www.wikidata.org/wiki/Q123' } }] }), 'Q123');
  assert.equal(wikidataIdFromMusicBrainzArtist({ relations: [{ type: 'official homepage', url: { resource: 'https://example.test' } }] }), null);
  assert.equal(englishWikipediaTitleFromWikidata({ entities: { Q123: { sitelinks: { enwiki: { title: 'Example Band' } } } } }, 'Q123'), 'Example Band');
  assert.equal(englishWikipediaTitleFromWikidata({ entities: { Q123: { sitelinks: {} } } }, 'Q123'), null);
});

test('Wikipedia projection refuses an unrevisioned or empty result', () => {
  assert.equal(projectWikipediaArtistDocument({ query: { pages: {
    '123': { title: 'Example', fullurl: 'https://example.test', extract: 'Text', revisions: [] },
  } } }), null);
});

test('Wikipedia spark parsing stops after the fact list instead of reading suggested links', () => {
  const sparks = parseWikipediaSparks(`Here are some facts:\n\n1. First useful fact about the band's early years.\n2. Second useful fact about a later album.\n\nSome possible links:\n\n* A suggested link about the first useful fact.\n* Another suggested link about the later album.`);
  assert.deepEqual(sparks, [
    "First useful fact about the band's early years.",
    'Second useful fact about a later album.',
  ]);
});

test('Wikipedia spark parsing drops an unfinished item at the output cap', () => {
  const sparks = parseWikipediaSparks('1. A complete source fact worth keeping.\n2. A second fact cut off before its sentence is complete');
  assert.deepEqual(sparks, ['A complete source fact worth keeping.']);
});

test('Wikipedia spark parsing enforces the per-chunk 10 fact limit', () => {
  const response = Array.from({ length: 21 }, (_, index) => `${index + 1}. Source fact number ${index + 1} is complete.`).join('\n');
  const sparks = parseWikipediaSparks(response);
  assert.equal(sparks.length, 10);
  assert.equal(sparks.at(-1), 'Source fact number 10 is complete.');
});
