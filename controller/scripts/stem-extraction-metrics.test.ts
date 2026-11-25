import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createStemExtractionMetricsStore, stemExtractionMode, summarizeStemExtractions } from '../src/music/stem-extraction-metrics.js';

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'stem-extraction-metrics-'));
  roots.push(root);
  return root;
}
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test('classifies measured Stem Beats bars and summarizes pair separation apart from source and render time', () => {
  assert.equal(stemExtractionMode(8.1, 7.9), 'stem-beats-8-8');
  assert.equal(stemExtractionMode(8, 16.2), 'stem-beats-8-16');
  assert.equal(stemExtractionMode(16.1, 15.9), 'stem-beats-16-16');
  assert.equal(stemExtractionMode(24, 8), 'stem-beats-other');
  const summaries = summarizeStemExtractions([
    { at: '2026-11-24T00:00:00Z', mode: 'stem-beats-8-16', outgoingBars: 8, incomingBars: 16,
      outgoingWindowMs: 10_000, incomingWindowMs: 20_000, extractionMs: 30_000,
      sourceAcquisitionMs: 5_000, renderMs: 4_000 },
    { at: '2026-11-24T00:01:00Z', mode: 'stem-beats-8-16', outgoingBars: 8, incomingBars: 16,
      outgoingWindowMs: 10_000, incomingWindowMs: 20_000, extractionMs: 50_000,
      sourceAcquisitionMs: 7_000, renderMs: 6_000 },
  ]);
  assert.deepEqual(summaries.find(item => item.mode === 'stem-beats-8-16'), {
    mode: 'stem-beats-8-16', samples: 2, averageExtractionMs: 40_000,
    averageSourceAcquisitionMs: 6_000, averageRenderMs: 5_000,
    averageOutgoingBars: 8, averageIncomingBars: 16,
  });
});

test('persists the bounded metrics history under the configured stems root', async () => {
  const store = createStemExtractionMetricsStore(tempRoot());
  const sample = { at: '2026-11-24T00:00:00Z', mode: 'stem-blend' as const,
    outgoingBars: 8, incomingBars: 8, outgoingWindowMs: 12_000, incomingWindowMs: 12_000,
    extractionMs: 20_000, sourceAcquisitionMs: 1_000, renderMs: 2_000 };
  await Promise.all([store.record(sample), store.record({ ...sample, at: '2026-11-24T00:01:00Z' })]);
  assert.deepEqual((await store.read()).map(item => item.at), ['2026-11-24T00:00:00Z', '2026-11-24T00:01:00Z']);
});
