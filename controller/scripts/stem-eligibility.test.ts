import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { stemCacheEligible } from '../src/music/stem-eligibility.js';
const db = await import('../src/music/library-db.js');
await db.open({ embeddingDim: 8, adoptStoredDim: true });
after(() => db.close());
const bars = JSON.stringify([0, 2000, 4000]);
const tail = JSON.stringify({ ending: 'cold', startMs: 180000, bars: [180000, 182000] });

test('unplayed/unstarred admission fallback requires dance, tempo and a measured grid', () => {
  const fixtures: Array<[string, unknown[], number]> = [
    ['head', ['["House"]', 138, bars, null, 200], 1],
    ['tail', ['["Trance"]', 140, null, tail, 200], 1],
    ['mixed genres', ['["Pop","Big Beat"]', 100, bars, null, 200], 1],
    ['rock', ['["Garage Rock"]', 138, bars, tail, 200], 0],
    ['missing genre', ['[]', 138, bars, tail, 200], 0],
    ['no tempo', ['["House"]', null, bars, tail, 200], 0],
    ['slow', ['["House"]', 89, bars, tail, 200], 0],
    ['fast', ['["House"]', 181, bars, tail, 200], 0],
    ['minimum tempo', ['["House"]', 90, bars, null, 200], 1],
    ['maximum tempo', ['["House"]', 180, bars, null, 200], 1],
    ['fresh unmeasured', ['["House"]', 138, null, null, 200], 0],
    ['single point', ['["House"]', 138, '[0]', null, 200], 0],
    ['duplicate points', ['["House"]', 138, '[0,0]', null, 200], 0],
    ['reversed points', ['["House"]', 138, '[2000,0]', null, 200], 0],
    ['wrong types', ['["House"]', 138, '[0,"2000"]', null, 200], 0],
    ['malformed', ['["House"]', 138, 'broken', '{}', 200], 0],
    ['past duration', ['["House"]', 138, '[0,201000]', null, 200], 0],
    ['tail needs duration', ['["House"]', 138, null, tail, null], 0],
    ['invalid outro', ['["House"]', 138, null, '{"bars":[0,2000]}', 200], 0],
  ];
  for (const [name, args, expected] of fixtures) {
    assert.equal(stemCacheEligible(...args as [unknown,unknown,unknown,unknown,unknown]), expected, name);
    assert.equal(db.getDb()!.prepare('SELECT stem_cache_eligible(?,?,?,?,?)').pluck().get(...args), expected, `SQL ${name}`);
  }
});

test('unmeasured tracks become eligible for backfill after ordinary beat analysis', () => {
  for (const [id,genres] of [['dance',['House']],['rock',['Rock']]] as const) {
    db.upsertTrackMeta(id, {title:id,genres:[...genres],duration:200});
  }
  assert.deepEqual(db.needsStemsIds(), []);
  for (const id of ['dance','rock']) db.upsertTrackAnalysis(id, {bpm:138,bars:[0,2000,4000]});
  assert.deepEqual(db.needsStemsIds(), ['dance']);
  assert.equal(db.canCacheStems('dance'), true);
  assert.equal(db.canCacheStems('rock'), false);
  assert.equal(db.canCacheStems('missing'), false);
  db.upsertTrackAnalysis('dance', {bpm:138,bars:[0,2000,4000],stemsAttempted:true});
  assert.deepEqual(db.needsStemsIds(), [], 'a cached/attempted eligible track does not churn');
  assert.equal(db.canCacheStems('dance'), true, 'existing eligible stems may be refreshed');
});

test('any historical play, operator star, Navidrome star or Sub/Beats preparation bypasses genre, tempo and grid checks', () => {
  for (const id of ['played-rock','operator-rock','navidrome-rock','subbeats-rock','listener-rock']) {
    db.upsertTrackMeta(id, {title:id,genres:['Rock']});
  }
  db.recordPlay({trackId:'played-rock',title:'played-rock',artist:'A',album:'B',playedAt:'2000-01-01T00:00:00.000Z',source:'auto',requestedBy:null,showId:null,showName:null});
  const signals = {operatorLikedIds:['operator-rock'],starredIds:['navidrome-rock'],subbeatsIds:['subbeats-rock'],listenerLikedIds:['listener-rock']};
  for (const id of ['played-rock','operator-rock','navidrome-rock','subbeats-rock']) assert.equal(db.canCacheStems(id, signals), true, id);
  assert.equal(db.canCacheStems('listener-rock', signals), false, 'a listener like alone is not an operator/Navidrome star');
  assert.equal(db.canCacheStems('navidrome-rock'), false, 'unstarred, unplayed non-dance tracks no longer qualify');
  assert.equal(db.canCacheStems('missing', {starredIds:['missing']}), false);
  assert.deepEqual(db.needsStemsIds(undefined,signals).sort(), ['navidrome-rock','operator-rock','played-rock','subbeats-rock']);
});
