import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTempDir, removeTempDir } from './test-utils/temp-dir.js';
import { prepareRegularStemPreview, readRegularStemPreview } from '../src/broadcast/regular-stem-preview.js';

function audio() {
  const samples=4410, pcm=Buffer.alloc(samples*4);
  for(let i=0;i<samples*2;i++)pcm.writeInt16LE(8192,i*2);
  const header=Buffer.alloc(44);
  header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);
  header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);
  header.writeUInt32LE(44100,24);header.writeUInt32LE(176400,28);header.writeUInt16LE(4,32);
  header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
  return Buffer.concat([header,pcm]);
}

test('working preview uses exact window identity, reuses valid envelopes and rejects replaced sources', async () => {
  const directory=createTempDir(path.join(tmpdir(),'regular-preview-'));
  const need={key:'window-proof',trackId:'a',side:'tail' as const,startMs:200,endMs:300,
    deadlineMs:Date.now()+15000,sourceSha256:'a'.repeat(64),sourceBytes:100};
  const source={stemsDir:directory,regularKey:need.key};
  try {
    await mkdir(directory,{recursive:true});
    for(const stem of ['drums','bass','other','vocals'])await writeFile(path.join(directory,`tail-${stem}.flac`),audio());
    await writeFile(path.join(directory,'tail-regular.json'),JSON.stringify({version:2,key:need.key,start_ms:200,end_ms:300}));
    assert.equal(await readRegularStemPreview(source,'tail'),null,'no decoding on read');
    await prepareRegularStemPreview(directory,{...need,deadlineMs:Date.now()+1000});
    assert.equal(await readRegularStemPreview(source,'tail'),null,'optional preview preserves the audio readiness margin');
    await prepareRegularStemPreview(directory,need);
    const preview=await readRegularStemPreview(source,'tail');assert.ok(preview);
    assert.equal(preview.drums.durationSec,.1);assert.ok(preview.drums.peaks[0]>.24);
    assert.equal(await readRegularStemPreview({...source,regularKey:'other-window'},'tail'),null);
    const cache=path.join(directory,'tail-drums-peaks-v1.bin');
    const corrupt=await readFile(cache);corrupt.writeFloatLE(NaN,28);await writeFile(cache,corrupt);
    assert.equal(await readRegularStemPreview(source,'tail'),null,'invalid envelope cannot claim readiness');
    await prepareRegularStemPreview(directory,need);
    assert.ok(await readRegularStemPreview(source,'tail'),'corrupt envelope is regenerated');
    await utimes(path.join(directory,'tail-drums.flac'),new Date(),new Date(Date.now()+1000));
    assert.equal(await readRegularStemPreview(source,'tail'),null,'changed audio cannot reuse its old envelope');
    await prepareRegularStemPreview(directory,need);
    assert.ok(await readRegularStemPreview(source,'tail'));
    await removeTempDir(directory);
    assert.ok(preview.drums.peaks[0]>.24,'snapshot survives source retirement');
  } finally {await removeTempDir(directory);}
});
