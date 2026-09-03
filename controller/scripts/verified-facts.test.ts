// Unit tests for the deterministic facts handed to the main DJ link prompt.
// Run: npm test -- verified-facts

import assert from 'node:assert/strict';
import {
  selectSleeveNotes,
  sleeveNotesFor,
  verifiedFactsForLink,
  verifiedFactsSection,
} from '../src/llm/internal/prompts/sleeve-notes.js';

let failures = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failures++;
    console.error(`  ✗ ${name}\n      ${err?.message || err}`);
  }
}

const track = (over: Record<string, unknown> = {}) => ({
  title: 'After Laughter (Comes Tears)',
  artist: 'Wendy Rene',
  album: 'After Laughter Comes Tears',
  year: 2012,
  originalYear: 1964,
  yearUntrusted: false,
  ...over,
});

test('uses the resolved original year, not a reissue year', () => {
  assert.deepEqual(sleeveNotesFor(track(), 3), [
    'Album: After Laughter Comes Tears.',
    'Release year: 1964.',
    'Station plays before today: 3.',
  ]);
});

test('does not assert an unresolved compilation year', () => {
  assert.deepEqual(sleeveNotesFor(track({ originalYear: null, yearUntrusted: true }), null), [
    'Album: After Laughter Comes Tears.',
  ]);
});

test('does not repeat a self-titled album or invent a missing play count', () => {
  assert.deepEqual(sleeveNotesFor(track({ album: 'After Laughter (Comes Tears)' }), null), [
    'Release year: 1964.',
  ]);
});

test('selects one supplemental fact with an injectable random seam', () => {
  const notes = ['Album: A.', 'Release year: 1999.', 'Station plays before today: 4.'];
  assert.deepEqual(selectSleeveNotes(notes, () => 0), ['Album: A.']);
  assert.deepEqual(selectSleeveNotes(notes, () => 0.99), ['Station plays before today: 4.']);
});

test('builds a bounded verified packet and formats a distinct facts section', () => {
  const facts = verifiedFactsForLink(track(), 3, () => 0);
  assert.deepEqual(facts, [
    'Track: "After Laughter (Comes Tears)" by Wendy Rene.',
    'Album: After Laughter Comes Tears.',
  ]);
  assert.equal(verifiedFactsSection(facts),
    'Verified facts:\n- Track: "After Laughter (Comes Tears)" by Wendy Rene.\n- Album: After Laughter Comes Tears.');
});

test('malformed track data produces no factual packet', () => {
  assert.deepEqual(verifiedFactsForLink({ album: 'Unknown' }), []);
  assert.equal(verifiedFactsSection([]), '');
});

if (failures) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nverified facts: all tests passed');
