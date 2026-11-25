import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { writeFileAtomic } from '../util/atomic-file.js';

export type StemExtractionMode = 'stem-blend' | 'stem-beats-8-8' | 'stem-beats-8-16'
  | 'stem-beats-16-16' | 'stem-beats-other';

export interface StemExtractionSample {
  at: string;
  mode: StemExtractionMode;
  outgoingBars: number;
  incomingBars: number;
  outgoingWindowMs: number;
  incomingWindowMs: number;
  extractionMs: number;
  sourceAcquisitionMs: number | null;
  renderMs: number | null;
}

export interface StemExtractionSummary {
  mode: StemExtractionMode;
  samples: number;
  averageExtractionMs: number;
  averageSourceAcquisitionMs: number | null;
  averageRenderMs: number | null;
  averageOutgoingBars: number;
  averageIncomingBars: number;
}

const MAX_SAMPLES = 100;

export function stemExtractionMode(outgoingBars: number, incomingBars: number): StemExtractionMode {
  const nearest = (bars: number) => [8, 16].find(target => Math.abs(bars - target) <= 1) ?? null;
  const outgoing = nearest(outgoingBars), incoming = nearest(incomingBars);
  if (outgoing === 8 && incoming === 8) return 'stem-beats-8-8';
  if (outgoing === 8 && incoming === 16) return 'stem-beats-8-16';
  if (outgoing === 16 && incoming === 16) return 'stem-beats-16-16';
  return 'stem-beats-other';
}

export function summarizeStemExtractions(samples: readonly StemExtractionSample[]): StemExtractionSummary[] {
  const modes: StemExtractionMode[] = ['stem-blend', 'stem-beats-8-8', 'stem-beats-8-16',
    'stem-beats-16-16', 'stem-beats-other'];
  return modes.map(mode => {
    const group = samples.filter(sample => sample.mode === mode);
    const average = (values: readonly (number | null)[]) => {
      const present = values.filter((value): value is number => value != null && Number.isFinite(value));
      return present.length ? Math.round(present.reduce((sum, value) => sum + value, 0) / present.length) : null;
    };
    return {
      mode,
      samples: group.length,
      averageExtractionMs: average(group.map(sample => sample.extractionMs)) ?? 0,
      averageSourceAcquisitionMs: average(group.map(sample => sample.sourceAcquisitionMs)),
      averageRenderMs: average(group.map(sample => sample.renderMs)),
      averageOutgoingBars: average(group.map(sample => sample.outgoingBars)) ?? 0,
      averageIncomingBars: average(group.map(sample => sample.incomingBars)) ?? 0,
    };
  });
}

export function createStemExtractionMetricsStore(stemsRoot: string) {
  const file = join(stemsRoot, 'stembeats', 'pick-time-metrics.json');
  let pendingWrite = Promise.resolve();

  async function read(): Promise<StemExtractionSample[]> {
    const value = await readFile(file, 'utf8').catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '[]';
      throw error;
    });
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error('Stem extraction metrics are malformed.');
    return parsed as StemExtractionSample[];
  }

  return {
    async read(): Promise<StemExtractionSample[]> { return read(); },
    record(sample: StemExtractionSample): Promise<void> {
      const write = pendingWrite.then(async () => {
        await mkdir(dirname(file), { recursive: true });
        const samples = await read();
        samples.push(sample);
        await writeFileAtomic(file, `${JSON.stringify(samples.slice(-MAX_SAMPLES))}\n`, { mode: 0o600 });
      });
      pendingWrite = write.catch(() => {});
      return write;
    },
  };
}
