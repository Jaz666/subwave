import assert from 'node:assert/strict';
import test from 'node:test';
import { RegularStemPreparation, type RegularStemNeed } from '../src/broadcast/regular-stem-preparation.js';

const need = (key: string, deadlineMs = 100): RegularStemNeed => ({ key, trackId: key, side: 'tail', deadlineMs });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function harness() {
  let now = 0;
  const starts: string[] = [], ready: string[] = [], failures: string[] = [];
  const finish: Array<(ok: boolean) => void> = [];
  const lane = new RegularStemPreparation({
    now: () => now,
    run: async item => { starts.push(item.key); return new Promise(resolve => finish.push(resolve)); },
    ready: item => { ready.push(item.key); },
    failed: item => { failures.push(item.key); },
  });
  return { lane, starts, ready, failures, finish, clock: (value: number) => { now = value; } };
}

test('single-flight lane uses current queue order after every job, not arrival order', async () => {
  const h = harness();
  h.lane.update([need('first-tail'), need('later-tail')]);
  assert.deepEqual(h.starts, ['first-tail']);
  h.lane.update([need('first-tail'), { ...need('incoming-head'), side: 'head' }, need('later-tail')]);
  assert.deepEqual(h.starts, ['first-tail']);
  h.finish.shift()!(true);
  await tick();
  assert.deepEqual(h.starts, ['first-tail', 'incoming-head']);
  h.finish.shift()!(true);
  await tick();
  assert.deepEqual(h.starts, ['first-tail', 'incoming-head', 'later-tail']);
  h.finish.shift()!(true);
  await tick();
  assert.equal(h.lane.state('first-tail'), 'ready');
  assert.deepEqual(h.ready, h.starts);
});

test('removal/handoff suppresses stale completion and deadline skips later work', async () => {
  const h = harness();
  h.lane.update([need('removed'), need('expired', 10), need('valid')]);
  h.lane.update([need('expired', 10), need('valid')]);
  h.clock(20);
  h.finish.shift()!(true);
  await tick();
  assert.deepEqual(h.ready, []);
  assert.deepEqual(h.starts, ['removed', 'valid']);
  h.clock(101);
  h.finish.shift()!(true);
  await tick();
  assert.deepEqual(h.ready, []);
  h.lane.update([]);
  assert.equal(h.lane.state('valid'), 'absent');
});

test('failure never hot-retries; fresh need can retry after removal', async () => {
  const h = harness();
  h.lane.update([need('broken')]);
  h.finish.shift()!(false);
  await tick();
  h.lane.update([need('broken')]);
  assert.deepEqual(h.starts, ['broken']);
  assert.equal(h.lane.state('broken'), 'failed');
  h.lane.update([]);
  h.lane.update([need('broken')]);
  h.finish.shift()!(true);
  await tick();
  assert.deepEqual(h.starts, ['broken', 'broken']);
  assert.deepEqual(h.failures, ['broken']);
  assert.deepEqual(h.ready, ['broken']);
});


test('deferred work waits for a later tick rather than spinning or becoming failed', async () => {
  let calls=0,ready=0;
  const lane=new RegularStemPreparation({run:async()=>++calls===1 ? 'deferred' : true,
    ready:()=>{ready++;},failed:()=>{throw new Error('deferred work failed');},now:()=>0});
  lane.update([need('waiting')]); await tick();
  assert.equal(calls,1); assert.equal(lane.state('waiting'),'pending');
  lane.update([need('waiting')]); await tick();
  assert.equal(calls,2); assert.equal(ready,1);
});
