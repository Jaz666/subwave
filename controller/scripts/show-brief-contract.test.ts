import assert from 'node:assert/strict';
import test from 'node:test';
import { hasEraReference, validateShowBrief, validateShowMusicContract } from '../src/broadcast/show-brief-contract.js';
const brief = { name: 'Shared textures', topic: 'Two perspectives on rhythm and songwriting.', talkingPoint: 'How does a melody change the feel of a rhythm?' };
const names = ['First DJ', 'Second DJ', 'Other DJ'];
const cast = ['First DJ', 'Second DJ'];
test('an era-neutral brief and the actual cast pass', () => {
  validateShowBrief({ ...brief, topic: 'First DJ and Second DJ explore melodic textures.' }, [], names, cast);
});
test('default shows reject year and decade promises in every published field', () => {
  for (const phrase of ['the 80s and beyond', '1980–1995', 'the 1990s', 'the eighties', '1984']) {
    for (const field of ['name', 'topic', 'talkingPoint']) {
      assert.throws(() => validateShowBrief({ ...brief, [field]: phrase }, [], names, cast), /period/);
    }
  }
});
test('a closed period cannot be widened to a whole decade or current music', () => {
  const eras = [{ fromYear: 1983, toYear: 1987 }];
  validateShowBrief({ ...brief, topic: 'First DJ explores music from 1983–1987.' }, eras, names, cast);
  for (const topic of ['Music from the 80s', 'From 1983 to 1995', '1983 and beyond']) {
    assert.throws(() => validateShowBrief({ ...brief, topic }, eras, names, cast), /period/);
  }
});
test('an open upper bound supports the promised decade and beyond', () => {
  validateShowBrief({ ...brief, topic: 'Music from the 80s and beyond.' }, [{ fromYear: 1980, toYear: null }], names, cast);
});
test('a year range cannot cross a gap between separate permitted periods', () => {
  assert.throws(() => validateShowBrief({ ...brief, topic: 'Music from 1980–1999.' }, [{ fromYear: 1980, toYear: 1985 }, { fromYear: 1990, toYear: 1999 }], names, cast), /period/);
});
test('known unassigned presenters and unsupported appearances are rejected', () => {
  assert.throws(() => validateShowBrief({ ...brief, topic: 'Other DJ joins the discussion.' }, [], names, cast), /cast/);
  for (const topic of ['Joined by special artists.', 'With surprise guests.', 'Expect live interviews.']) {
    assert.throws(() => validateShowBrief({ ...brief, topic }, [], names, cast), /appearance/);
  }
});
test('contract accepts reordered genres but rejects additions, omissions and duplicates', () => {
  const expected = { genres: ['Indie Rock', 'Post-Punk'], eras: [] };
  validateShowMusicContract({ genres: ['Post-Punk', 'Indie Rock'], eras: [] }, expected);
  for (const genres of [['Indie Rock'], ['Indie Rock', 'Post-Punk', 'Blues Rock'], ['Indie Rock', 'Indie Rock']]) {
    assert.throws(() => validateShowMusicContract({ genres, eras: [] }, expected), /genre palette/);
  }
});
test('settings cannot add, remove or broaden the concept era', () => {
  const restricted = { genres: ['Folk Rock'], eras: [{ fromYear: 1980, toYear: 1989 }] };
  const unrestricted = { genres: restricted.genres, eras: [] };
  assert.throws(() => validateShowMusicContract(restricted, unrestricted), /era restrictions/);
  assert.throws(() => validateShowMusicContract(unrestricted, restricted), /era restrictions/);
  assert.throws(() => validateShowMusicContract({ ...restricted, eras: [{ fromYear: 1980, toYear: null }] }, restricted), /era restrictions/);
});
test('only period-related operator direction enables an era contract', () => {
  for (const text of ['1980–1989 only', 'Eighties radio', 'The 90s and beyond', '1990s only']) assert.equal(hasEraReference(text), true);
  for (const text of ['', 'More guitars', 'Sunday Sessions', 'Exploring 808s']) assert.equal(hasEraReference(text), false);
});

test('qualified late-decade wording can fit a shorter closed period', () => {
  for (const topic of ['Textures from the late 1960s.', 'Textures from the late sixties.']) {
    validateShowBrief({ ...brief, topic }, [{ fromYear: 1965, toYear: 1969 }], names, cast);
  }
});
test('explicit catalogue subgenres must be selected or documented as taste context', () => {
  const contract = { known: ['Rock', 'Indie Rock', 'Blues Rock'], selected: ['Indie Rock'], context: [] };
  validateShowBrief({ ...brief, topic: 'Exploring Indie Rock arrangements.' }, [], names, cast, contract);
  assert.throws(() => validateShowBrief({ ...brief, topic: 'Exploring Blues Rock arrangements.' }, [], names, cast, contract), /unselected style/);
  validateShowBrief({ ...brief, topic: 'A Blues Rock fan explores Indie Rock.' }, [], names, cast, { ...contract, context: ['Blues Rock'] });
});

test('ambiguous genre words can request editorial repair without becoming a publication veto', () => {
  const contract = { known: ['Indie', 'Electronic', 'Alternative Hip Hop'], selected: ['Alternative Hip Hop'], context: [] };
  const draft = { ...brief, topic: 'Explore Indie and Electronic styles.' };
  assert.throws(() => validateShowBrief(draft, [], names, cast, { ...contract, inspectAmbiguous: true }), /unselected style/);
  validateShowBrief(draft, [], names, cast, contract);
});
