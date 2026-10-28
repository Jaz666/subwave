import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NAVIDROME_URL = 'http://navidrome.test:4533';
process.env.NAVIDROME_USER = 'dj';
process.env.NAVIDROME_PASS = 'test';
const { renderJoin } = await import('../src/music/sub-flow-preview.js');
const originalFetch = globalThis.fetch;
const rate = 44100;
const frameBytes = 4;

function fixture(seconds: number, offset: number) {
  const pcm = Buffer.alloc(seconds * rate * frameBytes);
  for (let frame = 0; frame < seconds * rate; frame++) {
    const sample = (frame + offset) % 20000 - 10000;
    pcm.writeInt16LE(sample, frame * frameBytes);
    pcm.writeInt16LE(-sample, frame * frameBytes + 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * frameBytes, 28);
  header.writeUInt16LE(frameBytes, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
const sources = { left: fixture(12, 100), right: fixture(12, 7000), short: fixture(2, 3500) };
globalThis.fetch = (async input => {
  const id = new URL(String(input)).searchParams.get('id') as keyof typeof sources;
  assert.ok(sources[id]);
  return new Response(sources[id], { headers: { 'content-type': 'audio/wav' } });
}) as typeof fetch;
test.after(() => { globalThis.fetch = originalFetch; });

test('join preview preserves the exact decoded samples on both sides without a gap or fade', async () => {
  const wav = await renderJoin([{ id: 'left', duration: 12 }, { id: 'right', duration: 12 }], new AbortController().signal);
  const side = 10 * rate * frameBytes;
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(40), side * 2);
  assert.equal(wav.readUInt32LE(24), rate);
  assert.deepEqual(wav.subarray(44, 44 + side), sources.left.subarray(sources.left.length - side));
  assert.deepEqual(wav.subarray(44 + side), sources.right.subarray(44, 44 + side));
});

test('a short opener is kept intact without silence padding', async () => {
  const wav = await renderJoin([{ id: 'short', duration: 2 }, { id: 'right', duration: 12 }], new AbortController().signal);
  assert.equal(wav.readUInt32LE(40), 12 * rate * frameBytes);
  assert.deepEqual(wav.subarray(44, 44 + sources.short.length - 44), sources.short.subarray(44));
});

test('cancelled previews and tracks with mismatched durations do not return audio', async () => {
  await assert.rejects(() => renderJoin([{ id: 'left', duration: 12 }], AbortSignal.abort()));
  await assert.rejects(() => renderJoin([{ id: 'left', duration: 30 }], new AbortController().signal), /duration differs/);
});
