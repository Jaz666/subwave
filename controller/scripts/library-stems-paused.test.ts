import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import express from 'express';

process.env.ADMIN_USER = 'test';
process.env.ADMIN_PASS = 'test';
process.env.ANALYZE_URL = 'http://127.0.0.1:9';
process.env.ANALYZE_PYTHON = '';

const { subbeatsStore } = await import('../src/music/subbeats-manager.js');
const { tagger } = await import('../src/broadcast/tagger.js');
const { router } = await import('../src/routes/jingles.js');
subbeatsStore.enqueue([{ id: 'waiting', title: 'Waiting', artist: 'Fixture', album: '' }]);
subbeatsStore.pause(true);
const before = subbeatsStore.read();
const app = express();
app.use(express.json());
app.use(router);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

test('every Library track limit reports a paused Sub/Beats queue without starting a no-op run', async () => {
  for (const limit of [100, 500, 5000, 10000, undefined]) {
    const response = await fetch(base + '/tag-library', {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from('test:test').toString('base64')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit, reconcile: false, enrich: false, tagMoods: false, analyze: false, stems: true }),
    });
    assert.equal(response.status, 409, `limit=${limit ?? 'all'}`);
    const body = await response.json() as { reason: string; error: string };
    assert.equal(body.reason, 'subbeats-paused');
    assert.match(body.error, /Resume/);
    assert.equal(tagger.running, false);
    assert.deepEqual(subbeatsStore.read(), before, 'the explicit pause and queued jobs must be preserved');
  }
});
