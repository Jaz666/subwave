import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPreparationIds, selectSubbeatsRows, subbeatsOutgoingCues, subbeatsIncomingCues, type SubbeatsCandidate } from './subbeats-selection';
const row = (id: string): SubbeatsCandidate => ({ id, title:id, artist:'Artist', album:'', bpm:138, hasBeatGrid:true, genres:['House'], status:'not-started' });

test('outgoing choices keep their original indices and allow the second-half search window', () => {
  const cues = [44,111,161,160,213.6].map(sourceSeconds => ({sourceSeconds,bpm:130,strength:1,reason:'arrangement' as const}));
  assert.deepEqual(subbeatsOutgoingCues(cues,213.6).map(({index}) => index),[1,2,3]);
  assert.deepEqual(subbeatsOutgoingCues(cues,undefined),[]);
  assert.deepEqual(subbeatsOutgoingCues(cues,0),[]);
  assert.equal(subbeatsOutgoingCues([{...cues[0]!,sourceSeconds:106.8}],213.6).length,1);
});

test('selection accumulates across pages/filters, deduplicates and stops at the batch limit', () => {
  const first = Array.from({length:50}, (_,i) => row(`first-${i}`));
  const second = Array.from({length:60}, (_,i) => row(`second-${i}`));
  const selected = selectSubbeatsRows(first, [...first, ...second], []);
  assert.equal(selected.length, 100); assert.deepEqual(selected.slice(0,50), first);
  assert.equal(new Set(selected.map(item => item.id)).size, 100);
});

test('more than 500 saved entries do not block another batch or retries', () => {
  const jobs = Array.from({length:501}, (_,i) => ({id:`known-${i}`, status:'failed' as const}));
  const selected = selectSubbeatsRows([], [row('new-a'), row('new-b'), row('known-0')], jobs);
  assert.deepEqual(selected.map(item => item.id), ['new-a','new-b','known-0']);
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


test('incoming length order uses the complete source opening and matched tempo without renumbering', () => {
  const outgoing={sourceSeconds:160,bpm:130,strength:1,reason:'arrangement' as const,phraseBars:16 as const,phraseEndSeconds:190};
  const cues=[
    {sourceSeconds:22,bpm:125,strength:1,reason:'repetition' as const},
    {sourceSeconds:31.2,bpm:125,strength:1,reason:'repetition' as const,phraseBars:8 as const,phraseStartSeconds:16},
    {sourceSeconds:30,bpm:100,strength:1,reason:'arrangement' as const},
  ];
  const ranked=subbeatsIncomingCues(cues,outgoing);
  assert.deepEqual(ranked.map(c=>c.index),[1,0,2]);
  assert.equal(ranked[0]!.matchedSeconds,30);
  assert.equal(ranked[0]!.differenceSeconds,0,'leading source audio is included in the length');
  assert.equal(ranked[2]!.tempoFits,false);
  assert.deepEqual(subbeatsIncomingCues(cues).map(c=>c.index),[0,1,2]);
  assert.equal(subbeatsIncomingCues(cues,{...outgoing,phraseEndSeconds:undefined})[0]!.differenceSeconds,null);
  assert.deepEqual(subbeatsIncomingCues([{...cues[1]!,timingValidated:false},cues[0]!],outgoing)
    .map(c=>c.index),[1,0],'review candidates stay available after usable choices with original indices');
});
