import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFlags } from '../src/music/tag-library/flags.js';

test('Library stem-cache selection is independent of acoustic analysis', () => {
  const originalArgv = process.argv;
  try {
    process.argv = ['node', 'tag-library.ts', '--stems', '--skip-analyze', '--skip-tag', '--skip-enrich'];
    const flags = parseFlags();
    assert.equal(flags.stems, true);
    assert.equal(flags.skipAnalyze, true);
    assert.equal(flags.skipTag, true);
    assert.equal(flags.skipEnrich, true);
  } finally {
    process.argv = originalArgv;
  }
});
