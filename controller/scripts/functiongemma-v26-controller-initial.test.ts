import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { scorePrediction } from './functiongemma/score.js';

test('V26 executes the classified initial source in the controller and offers only complementary choices to the model', () => {
  const output = mkdtempSync(join(tmpdir(), 'functiongemma-v26-'));
  try {
    execFileSync('npx', ['tsx', 'scripts/functiongemma/v26-controller-initial-validation-cli.ts', output], { cwd: process.cwd() });
    const rows = JSON.parse(readFileSync(join(output, 'validation.json'), 'utf8'));
    assert.equal(rows.length, 3);
    for (const row of rows) {
      assert.equal(row.maxRounds, 2, row.id);
      assert.deepEqual(row.decisionTools.map((tools: any[]) => tools.map(tool => tool.name)), [['tracksLikeThis', 'tracksByMood', 'deepCuts'], ['tracksLikeThis', 'tracksByMood', 'deepCuts']]);
      assert.ok(row.controllerInitial, row.id);
      const score = scorePrediction(row, { scenario: row.id, calls: [{ name: 'tracksLikeThis', arguments: { songId: 'V26validation00000001' } }, { name: 'deepCuts', arguments: {} }], callsPerRound: [1, 1] });
      assert.equal(score.passed, true, JSON.stringify(score));
    }
    assert.deepEqual(rows[0].controllerInitial, { name: 'searchBySound', arguments: { query: 'warm cello, muted trumpet and a slow brushed groove' } });
    assert.deepEqual(rows[1].controllerInitial, { name: 'searchByLyrics', arguments: { query: 'songs about starting over after a long journey' } });
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
