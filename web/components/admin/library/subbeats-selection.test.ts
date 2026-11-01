import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPreparationIds, selectSubbeatsRows, type SubbeatsCandidate } from './subbeats-selection';
const row = (id: string): SubbeatsCandidate => ({ id, title:id, artist:'Artist', album:'', bpm:138, hasBeatGrid:true, genres:['House'], status:'not-started' });

test('selection accumulates across pages/filters, deduplicates and stops at the batch limit', () => {
  const first = Array.from({length:50}, (_,i) => row(`first-${i}`));
  const second = Array.from({length:60}, (_,i) => row(`second-${i}`));
  const selected = selectSubbeatsRows(first, [...first, ...second], []);
  assert.equal(selected.length, 100); assert.deepEqual(selected.slice(0,50), first);
  assert.equal(new Set(selected.map(item => item.id)).size, 100);
});

test('list capacity counts only new admissions and still permits existing failed entries to retry', () => {
  const jobs = Array.from({length:499}, (_,i) => ({id:`known-${i}`, status:'failed' as const}));
  const selected = selectSubbeatsRows([], [row('new-a'), row('new-b'), row('known-0')], jobs);
  assert.deepEqual(selected.map(item => item.id), ['new-a','known-0']);
  assert.deepEqual(selectSubbeatsRows([], [row('new-a'),row('known-0')], [...jobs,{id:'last',status:'prepared'}]).map(item => item.id), ['known-0']);
});

test('fresh queue state removes selections that another request has queued or completed', () => {
  const chosen = [row('queued'), row('prepared'), row('unmeasurable'), row('failed'), row('new')];
  const jobs = [{id:'queued',status:'queued'}, {id:'prepared',status:'prepared'},
    {id:'unmeasurable',status:'unmeasurable'}, {id:'failed',status:'failed'}] as const;
  assert.deepEqual(selectSubbeatsRows(chosen, [], [...jobs]).map(item => item.id), ['failed','new']);
});

test('preparation selection spans pages, deduplicates and excludes active or removed entries', () => {
  const jobs = [{id:'prepared',status:'prepared'}, {id:'failed',status:'failed'}, {id:'queued',status:'queued'}, {id:'running',status:'running'}] as const;
  assert.deepEqual(selectPreparationIds(['prepared','gone'], ['prepared','failed','queued','running'], [...jobs]), ['prepared','failed']);
  assert.deepEqual(selectPreparationIds(['prepared','failed'], [], [...jobs.filter(job=>job.id!=='prepared')]), ['failed']);
});

test('preparation batches stop at 100 entries without dropping prior selections', () => {
  const jobs = Array.from({length:120},(_,i)=>({id:String(i),status:'prepared' as const}));
  const selected = selectPreparationIds(['119'],jobs.map(job=>job.id),jobs);
  assert.equal(selected.length,100); assert.equal(selected[0],'119'); assert.equal(new Set(selected).size,100);
});
