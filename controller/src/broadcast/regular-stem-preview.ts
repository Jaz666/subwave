/** Preview envelopes belong to the exact working window, then travel with the
 * rendered seam so retiring its source stems cannot change the visible pair.
 * Preview failure never changes audio readiness or starts a decoder at handoff.
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { readStemWaveform, subbeatsStemWaveform, STEM_WAVEFORM_NAMES, type StemWaveform } from '../music/stem-waveform-peaks.js';
import type { RegularStemWindowNeed } from './regular-stem-needs.js';
import type { RegularStemStyle } from './regular-stem-policy.js';

export const REGULAR_STEM_PREVIEW_RETAIN_MS = 60_000;

export type RegularStemEnvelopes = Record<typeof STEM_WAVEFORM_NAMES[number], StemWaveform>;
export type RegularStemPreview = {
  id: string; gainsDb: [number, number]; style: RegularStemStyle; outgoingStartSec: number; incomingStartSec: number;
  envelopes?: { outgoing: RegularStemEnvelopes | null; incoming: RegularStemEnvelopes | null };
};
const envelopePath = (directory: string, side: 'head' | 'tail', stem: string) =>
  path.join(directory, `${side}-${stem}-peaks-v1.bin`);

export async function prepareRegularStemPreview(directory: string, need: RegularStemWindowNeed): Promise<void> {
  const budget = Math.min(12000, need.deadlineMs-Date.now()-5000);
  if (budget <= 0) return; // optional preview never spends the readiness margin
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), budget);
  try {
    for (const stem of STEM_WAVEFORM_NAMES) {
      abort.signal.throwIfAborted();
      await subbeatsStemWaveform(path.join(directory, `${need.side}-${stem}.flac`),
        envelopePath(directory, need.side, stem), abort.signal);
    }
  } finally { clearTimeout(timer); }
}

export async function readRegularStemPreview(source: { stemsDir: string; regularKey: string }, side: 'head' | 'tail'): Promise<RegularStemEnvelopes | null> {
  try {
    const stamp = JSON.parse(await readFile(path.join(source.stemsDir, `${side}-regular.json`), 'utf8'));
    if (stamp.key !== source.regularKey || stamp.version !== 2
        || !Number.isFinite(stamp.start_ms) || !Number.isFinite(stamp.end_ms) || stamp.end_ms <= stamp.start_ms) return null;
    const result = {} as RegularStemEnvelopes;
    for (const stem of STEM_WAVEFORM_NAMES) {
      const waveform = await readStemWaveform(path.join(source.stemsDir, `${side}-${stem}.flac`),
        envelopePath(source.stemsDir, side, stem));
      if (!waveform || waveform.peaks.length > 1201 || waveform.peaks.some(peak => !Number.isFinite(peak) || peak < 0 || peak > 1)
          || Math.abs(waveform.durationSec-(stamp.end_ms-stamp.start_ms)/1000) > .1) return null;
      result[stem] = waveform;
    }
    return result;
  } catch { return null; }
}
