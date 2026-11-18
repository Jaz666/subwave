import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

test('head/tail confidence and overlap policy on source and playback clocks', () => {
  const result=spawnSync('python3',['subbeats_vocal_confidence_test.py'],{cwd:dirname(fileURLToPath(import.meta.url)),encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
});
