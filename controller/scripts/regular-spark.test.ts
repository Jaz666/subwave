import assert from 'node:assert/strict';
import test from 'node:test';
import { enforceIntroBudget } from '../src/llm/internal/prompts/intro-budget.js';
import { regularSparkAppearsFirst, regularSparkFallback } from '../src/llm/internal/prompts/regular-spark.js';

test('Regular requires the offered claim in the opening sentence', () => {
  const spark = { wording: 'The band consists of David Maclean, Vincent Neff, Jimmy Dixon, and Tommy Grace.' };
  const track = { artist: 'Django Django', title: 'Kick the Devil Out' };
  assert.equal(regularSparkAppearsFirst('The band consists of David Maclean, Vincent Neff, Jimmy Dixon, and Tommy Grace. That is Django Django.', spark, track), true);
  assert.equal(regularSparkAppearsFirst('Here is Django Django. The band consists of David Maclean, Vincent Neff, Jimmy Dixon, and Tommy Grace.', spark, track), false);
  assert.equal(regularSparkAppearsFirst('Here is Django Django with Kick the Devil Out.', spark, track), false);
});

test('the sourced fallback repairs a trailing comma and leads with the claim', () => {
  const spark = { wording: 'Founders Andy McCluskey and Paul Humphreys met at primary school in Meols, England in the early 1960s,' };
  const track = { artist: 'Orchestral Manoeuvres in the Dark', title: 'Locomotion' };
  const link = regularSparkFallback(spark, track);
  assert.equal(link, 'Founders Andy McCluskey and Paul Humphreys met at primary school in Meols, England in the early 1960s. That\'s Orchestral Manoeuvres in the Dark with Locomotion.');
  assert.equal(regularSparkAppearsFirst(link, spark, track), true);
});

test('a short intro budget keeps the claim when it keeps only the first sentence', () => {
  const spark = { wording: 'The album bankrupted Factory Records.' };
  const track = { artist: 'Happy Mondays', title: 'Stinkin Thinkin' };
  const link = regularSparkFallback(spark, track);
  const trimmed = enforceIntroBudget(link, 4_000);
  assert.equal(trimmed, 'The album bankrupted Factory Records.');
  assert.equal(regularSparkAppearsFirst(trimmed, spark, track), true);
});

test('the literal fallback does not send unsupported scripts to an English voice', () => {
  assert.equal(regularSparkFallback({ wording: '王菲 recorded the track.' }, { artist: 'Faye Wong', title: 'Example' }), '');
  assert.equal(regularSparkFallback({ wording: 'The album bankrupted Factory Records.' }, { artist: 'Happy Mondays', title: '曲名' }), 'The album bankrupted Factory Records.');
});
