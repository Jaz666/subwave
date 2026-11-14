import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { rankVersionMatches } from '../src/music/lrclib.js';
import { selectSubbeatsLyrics, saveSubbeatsLyrics, readSubbeatsLyrics, withSubbeatsLyrics } from '../src/music/subbeats-lyrics.js';
import { subbeatsJobSchema } from '../src/schemas/subbeats.js';

const track={title:'Show Me Love',artist:'Steve Angello',album:'Compilation',durationSec:184};
const record=(id:number,first:number,album='Compilation',last=175) => ({id,trackName:track.title,artistName:track.artist,
  albumName:album,duration:182,syncedLyrics:`[00:${first.toFixed(2)}]First line\n[${Math.floor(last/60)}:${(last%60).toFixed(2)}]Last line`});
const key='a'.repeat(64);

test('Sub/Beats version selection ranks album/title evidence and retains timing disagreement', () => {
  const wrong=record(1,6.5,'Other album'),right=record(2,9.13);
  assert.equal(rankVersionMatches([wrong,right],track)[0]?.id,2);
  const evidence=selectSubbeatsLyrics(key,track,null,[wrong,right],false);
  assert.equal(evidence.firstSeconds,9.13);
  assert.equal(evidence.selected?.album,'Compilation');
  assert.ok(evidence.firstSpreadSeconds>2,'a plausible alternative still lowers head confidence in the pair assessor');
  assert.equal(evidence.lastStartSeconds,175,'last line start stays distinct from its end');
  const exactEdit={...track,title:'Show Me Love (Radio Edit)'};
  assert.equal(rankVersionMatches([{...right,id:3,trackName:exactEdit.title},wrong],exactEdit)[0]?.id,3);
  assert.equal(rankVersionMatches([{...right,duration:250}],track).length,0);
});

test('Navidrome timed lyrics lead; out-of-range timestamps and plain text cannot supply boundaries', () => {
  const server={synced:true,lines:[{startMs:14000,text:'Opening'},{startMs:300000,text:'Wrong duration'}]};
  const evidence=selectSubbeatsLyrics(key,track,server,[record(2,9.13)],false);
  assert.equal(evidence.source,'music-server');
  assert.equal(evidence.firstSeconds,14);
  assert.equal(evidence.versionConfidence,'low','out-of-range lyric timing is a version warning');
  assert.equal(selectSubbeatsLyrics(key,track,{synced:false,lines:[{startMs:0,text:'Words'}]},[],false).firstSeconds,null);
  assert.equal(selectSubbeatsLyrics(key,track,{synced:false,lines:[{startMs:0,text:'Words'}]},[record(2,9.13)],false).source,'lrclib');
});

test('refresh preserves manual boundaries only for the same prepared recording', async () => {
  const evidence=selectSubbeatsLyrics(key,track,null,[record(2,9.13)],false);
  evidence.reviewedHeadSeconds=9;
  evidence.reviewedTailSeconds=179;
  await saveSubbeatsLyrics(config.stateDir,{song:evidence});
  await saveSubbeatsLyrics(config.stateDir,{song:selectSubbeatsLyrics(key,track,null,[record(3,8)],false)});
  assert.equal(readSubbeatsLyrics(config.stateDir).song?.reviewedHeadSeconds,9);
  const job=subbeatsJobSchema.parse({id:'song',title:'Show Me Love',artist:'Steve Angello',album:'Compilation',status:'prepared',
    attempts:1,bundleKey:key,error:null,updatedAt:new Date().toISOString()});
  assert.equal(withSubbeatsLyrics([job],config.stateDir)[0]?.lyricEvidence?.reviewedTailSeconds,179);
  assert.equal(withSubbeatsLyrics([{...job,bundleKey:'b'.repeat(64)}],config.stateDir)[0]?.lyricEvidence,undefined);
  await saveSubbeatsLyrics(config.stateDir,{song:selectSubbeatsLyrics('b'.repeat(64),track,null,[record(3,8)],false)});
  assert.equal(readSubbeatsLyrics(config.stateDir).song?.reviewedHeadSeconds,null);
});
