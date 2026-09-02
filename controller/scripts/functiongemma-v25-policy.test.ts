import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('V25 pins only the classified initial source and leaves distinct complementary choices', () => {
  const output = mkdtempSync(join(tmpdir(), 'functiongemma-v25-'));
  try {
    execFileSync('npx', ['tsx', 'scripts/functiongemma/v25-policy-validation-cli.ts', output], { cwd: process.cwd() });
    const rows = JSON.parse(readFileSync(join(output, 'validation.json'), 'utf8'));
    assert.equal(rows.length, 3);
    for (const row of rows) {
      assert.equal(row.decisionTools[0].length, 1, row.id);
      assert.deepEqual(row.decisionTools.slice(1).map((tools: any[]) => tools.map(tool => tool.name)), [
        ['tracksLikeThis', 'tracksByMood', 'deepCuts'],
        ['tracksLikeThis', 'tracksByMood', 'deepCuts'],
      ]);
    }
    assert.equal(rows[0].decisionTools[0][0].name, 'searchBySound');
    assert.equal(rows[1].decisionTools[0][0].name, 'searchByLyrics');
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
