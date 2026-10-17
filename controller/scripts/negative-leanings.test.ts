import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agenticLeaningsSources, compactAgenticReviewCandidate, eligibleAgenticLeanings,
  interpretableAgenticLeanings, selectAgenticReviewCandidates, validateAgenticLeaningsReplacement,
  agenticLeaningsSelectionReason, leaningsBlindPickReason,
} from '../src/broadcast/dj-agent/leanings-review.js';

const options = (host: string) => agenticLeaningsSources({ host }).map(({ phrase }) => phrase);
for (const [input, expected] of [
  ['Favours northern soul and Motown. Avoids stadium rock.', ['northern soul', 'Motown', 'Avoids stadium rock']],
  ['Avoids stadium rock.', ['Avoids stadium rock']],
  ['Does not favour stadium rock.', ['Avoids stadium rock']],
  ["Doesn't enjoy stadium rock.", ['Avoids stadium rock']],
  ['Never favours stadium rock.', ['Avoids stadium rock']],
  ['Favours soul but avoids stadium rock.', ['soul', 'Avoids stadium rock']],
  ['Avoids stadium rock and metal but loves soul.', ['Avoids stadium rock', 'Avoids metal', 'soul']],
  ['Favours soul, avoids stadium rock, and enjoys Motown.', ['soul', 'Avoids stadium rock', 'Motown']],
  ['Soul and Motown. Avoids stadium rock.', ['Soul', 'Motown', 'Avoids stadium rock']],
  ['Favours soul without harsh vocals.', ['soul', 'Avoids harsh vocals']],
  ['Favours soul, not stadium rock.', ['soul', 'Avoids stadium rock']],
  ['She steers away from stadium rock.', ['Avoids stadium rock']],
  ['Leans away from stadium rock.', ['Avoids stadium rock']],
  ['No stadium rock.', ['Avoids stadium rock']],
  ['Do not favour stadium rock.', ['Avoids stadium rock']],
  ['Does not avoid soul.', []],
  ['Never dislikes soul.', []],
  ["Isn’t keen on stadium rock.", ['Avoids stadium rock']],
  ["Doesn’t dislike soul.", []],
  ['No-wave and post-punk', ['No-wave', 'post-punk']],
  ['Favours no wave and post-punk.', ['no wave', 'post-punk']],
  ['Not only favours soul but enjoys jazz.', ['soul', 'jazz']],
  ['patient dub, deep soul', ['patient dub', 'deep soul']],
  ['Avoids stadium rock\nFavours soul', ['Avoids stadium rock', 'soul']],
] as Array<[string, string[]]>) {
  test(`preserves preference direction: ${input}`, () => assert.deepEqual(options(input), expected));
}

const baseline = { id: 'baseline', genre: 'stadium rock', energy: 'medium', moods: ['reflective'], bpm: 120, key: '8A' };
const alternative = { ...baseline, id: 'alternative', genre: 'soul' };
const phrase = 'Avoids stadium rock';
const sources = agenticLeaningsSources({ host: `${phrase}.` });
const evidence = {
  baselineFacts: [{ field: 'genre', value: 'stadium rock' }],
  challengerFacts: [{ field: 'genre', value: 'soul' }],
  comparison: 'Avoids stadium rock: the baseline is labelled stadium rock, while the soul challenger offers a different musical direction.',
};
const validation = {
  musicalReason: 'its warm singing adds a gentler melodic focus to the sequence',
  leaningsBasis: phrase, musicalLeanings: `${phrase}.`, allowedLeanings: [phrase],
  supportedLeanings: [], baselineSupportedLeanings: [], flowCloseness: 'close',
  interpretableLeanings: [phrase], baseline, challenger: alternative, editorialEvidence: evidence,
};

test('negative phrases never become positive metadata matches or advantages', () => {
  for (const track of [baseline, alternative]) {
    const compact = compactAgenticReviewCandidate(track, [phrase], baseline);
    assert.equal(compact.leaningsMatches, undefined);
    assert.equal(compact.leaningsAdvantages, undefined);
  }
  assert.deepEqual(interpretableAgenticLeanings(sources, [baseline, alternative]), [phrase]);
  assert.equal(validateAgenticLeaningsReplacement({ ...validation, editorialEvidence: null }).valid, false);
  assert.equal(validateAgenticLeaningsReplacement({ ...validation, supportedLeanings: [phrase], editorialEvidence: null }).valid, false);
});

test('avoidance needs grounded facts about both tracks, and cannot favour the avoided tag', () => {
  assert.deepEqual(validateAgenticLeaningsReplacement(validation), { valid: true, basis: phrase, evidenceKind: 'editorial-comparison' });
  for (const overrides of [
    { challenger: baseline },
    { challenger: { ...alternative, lastfm_tags: ['stadium rock'] } },
    { challenger: { id: 'unknown' } },
    { editorialEvidence: { ...evidence, challengerFacts: [{ field: 'genre', value: 'jazz' }] } },
    { flowCloseness: 'weak' },
    { musicalLeanings: 'Favours stadium rock.' },
  ]) assert.equal(validateAgenticLeaningsReplacement({ ...validation, ...overrides }).valid, false);
});

test('each negative item in a list remains verifiable against the actual source text', () => {
  assert.equal(validateAgenticLeaningsReplacement({ ...validation,
    musicalLeanings: 'Host: Avoids metal and stadium rock.',
  }).valid, true);
  assert.equal(validateAgenticLeaningsReplacement({ ...validation,
    musicalLeanings: 'Host: Avoids stadium rock\nGuest (Guest DJ, secondary): Favours soul',
  }).valid, true);
});

test('host avoidance of the baseline cannot be displaced by an exact guest preference', () => {
  const guest = { guest: { name: 'Guest' }, musicalLeanings: 'Favours stadium rock.' };
  const mixed = agenticLeaningsSources({ host: `${phrase}.`, guest });
  assert.deepEqual(eligibleAgenticLeanings(baseline, [alternative], mixed), sources);
  assert.deepEqual(eligibleAgenticLeanings(alternative, [baseline], mixed), sources);
  assert.deepEqual(interpretableAgenticLeanings(mixed, [baseline, alternative]), [phrase]);
  const guestOnly = agenticLeaningsSources({ guest: { ...guest, musicalLeanings: `${phrase}.` } });
  assert.deepEqual(interpretableAgenticLeanings(guestOnly, [baseline, alternative]), [phrase]);
});

test('candidate limit reserves an escape from an avoided trait without admitting weak flow', () => {
  const same = Array.from({ length: 8 }, (_, i) => ({ ...baseline, id: `same-${i}` }));
  const weak = { ...alternative, id: 'weak', energy: 'high', moods: ['workout'], bpm: 65, key: '2B' };
  const selected = selectAgenticReviewCandidates(baseline, [...same, alternative, weak], [phrase]);
  assert.equal(selected.length, 6);
  assert.ok(selected.some(track => track.id === alternative.id));
  assert.ok(!selected.some(track => track.id === weak.id));
});


test('negative preference explanations stay private for arbitrary presenter names', () => {
  for (const djName of ['Mara Vex', 'Charles', 'DJ 42', '李雷']) {
    const track = { id: 'soul', title: 'Soul Tune', artist: 'Soul Artist' };
    const reason = agenticLeaningsSelectionReason({ replacement: track, djName, basis: phrase,
      musicalReason: 'its warm voices bring a more intimate melodic turn to the sequence' });
    assert.match(reason, /preference to steer away from stadium rock/);
    assert.doesNotMatch(leaningsBlindPickReason(reason, track), /stadium rock|preference|reflecting/i);
  }
});
