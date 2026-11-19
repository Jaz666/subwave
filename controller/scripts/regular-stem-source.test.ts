import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

test('complete regular sources exceed the prefix cap, reuse one download and retire after leases', async () => {
  const audio=Buffer.alloc(13*1024*1024,7);
  const sha256=createHash('sha256').update(audio).digest('hex');
  let downloads=0, body=audio;
  const server=createServer((_req,res)=>{downloads++;res.setHeader('Content-Type','audio/flac');res.end(body);});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address && typeof address!=='string');
  process.env.NAVIDROME_URL=`http://127.0.0.1:${address.port}`;
  const source=await import('../src/music/regular-stem-source.js');
  try {
    source.retainRegularStemSources(null,['large']);
    const [first,second]=await Promise.all([1,2].map(()=>source.acquireRegularStemSource('large',{
      expectedBytes:audio.length,expectedSha256:sha256})));
    assert.equal(downloads,1);assert.equal(first.sha256,sha256);
    assert.equal((await readFile(first.path)).length,audio.length);
    await first.release();
    source.retainRegularStemSources(null,[]);
    await access(second.path);
    await second.release();
    await assert.rejects(access(second.path),'removed only after the last worker lease');
    for(const [id,bytes] of [['short',audio.length-1],['long',audio.length+1]] as const){
      body=Buffer.alloc(bytes,7);source.retainRegularStemSources(null,[id]);
      await assert.rejects(source.acquireRegularStemSource(id,{expectedBytes:audio.length}),/size/);
    }
    source.retainRegularStemSources(null,['unknown']);
    const before=downloads;
    await assert.rejects(source.acquireRegularStemSource('unknown'),/known library file size/);
    assert.equal(downloads,before);
    body=audio;source.retainRegularStemSources(null,['cached']);
    const cached=await source.acquireRegularStemSource('cached',{expectedBytes:audio.length});await cached.release();
    await writeFile(cached.path,'partial');
    const repaired=await source.acquireRegularStemSource('cached',{expectedBytes:audio.length});
    assert.equal(repaired.sha256,sha256);assert.equal(downloads,before+2,'damaged cache is downloaded again');
    await repaired.release(false);
    source.retainRegularStemSources(null,[]);
    // Reconcile before checking: transport uncertainty keeps a worker-safe file.
    await assert.rejects(source.acquireRegularStemSource('retired',{expectedBytes:audio.length}));
    await access(path.join(path.dirname(repaired.path),'.regular-busy.json'));
    await access(repaired.path);
    const analyzer=await import('../src/music/analyzer.js');
    const prefix=await analyzer.downloadCapped('generic');
    assert.equal(prefix.complete,false,'generic analysis remains prefix-capped');
    assert.equal((await stat(prefix.path)).size,12*1024*1024);
    await rm(prefix.path,{force:true});
    const {config}=await import('../src/config.js');
    const library=await import('../src/music/library.js');
    const db=await import('../src/music/library-db.js');
    await library.load();
    try {
      const localRoot=path.join(config.stateDir,'library-fixture');
      await mkdir(localRoot,{recursive:true});
      const original=path.join(localRoot,'complete.flac');await writeFile(original,audio);
      process.env.MUSIC_LIBRARY_PATH=localRoot;
      db.upsertTrackMeta('local',{title:'Local recording',filePath:original,fileSize:audio.length});
      const beforeLocal=downloads;
      source.retainRegularStemSources(null,['local']);
      const copy=await source.acquireRegularStemSource('local');
      assert.equal(copy.sha256,sha256);assert.notEqual(copy.path,original);assert.equal(downloads,beforeLocal);
      await copy.release();source.retainRegularStemSources(null,[]);
      await assert.rejects(source.acquireRegularStemSource('removed',{expectedBytes:audio.length}));
      await access(original);
    } finally { db.close(); delete process.env.MUSIC_LIBRARY_PATH; }

  } finally {
    source.retainRegularStemSources(null,[]);
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
