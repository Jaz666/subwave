import { spawn } from 'node:child_process';
import { lstat, mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { writeFileAtomic } from '../util/atomic-file.js';
import { reportProgress } from './tagger-progress.js';
import { readSubbeatsQueue, type SubbeatsJob } from './subbeats-store.js';
import * as stemCache from './stem-cache.js';

export const STEM_WAVEFORM_NAMES = ['drums', 'bass', 'other', 'vocals'] as const;
export type StemWaveformName = typeof STEM_WAVEFORM_NAMES[number];
export type StemWaveform = { durationSec: number; peaks: number[] };

const SAMPLE_RATE = 8_000;
const BIN_SAMPLES = 800;
const HEADER_BYTES = 28;
const MAGIC = 'SWP1';
const pending = new Map<string, Promise<StemWaveform>>();

export function subbeatsStemWaveformPath(trackId: string, bundleKey: string, window: 'head' | 'tail', stem: StemWaveformName): string {
  if (!/^[a-f0-9]{64}$/.test(bundleKey)) throw new Error('Invalid Sub/Beats bundle key');
  return path.join(stemCache.dirFor(trackId), 'subbeats-waveform-peaks-v1', `${bundleKey}-${window}-${stem}.bin`);
}

function peaksFromPcm(pcm: Buffer): StemWaveform {
  const count = Math.floor(pcm.length / 4);
  const peaks: number[] = [];
  for (let start = 0; start < count; start += BIN_SAMPLES) {
    let peak = 0;
    const end = Math.min(count, start + BIN_SAMPLES);
    for (let i = start; i < end; i++) {
      const offset = i * 4;
      peak = Math.max(peak, Math.abs(pcm.readInt16LE(offset)) / 32768,
        Math.abs(pcm.readInt16LE(offset + 2)) / 32768);
    }
    peaks.push(peak);
  }
  return { durationSec: count / SAMPLE_RATE, peaks };
}

async function decode(pathname: string, signal?: AbortSignal): Promise<StemWaveform> {
  const decoder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', pathname, '-map', '0:a:0', '-vn',
    '-ac', '2', '-ar', String(SAMPLE_RATE), '-f', 's16le', 'pipe:1'], signal ? { signal } : {});
  const chunks: Buffer[] = [];
  let outputBytes = 0;
  const stderr: Buffer[] = [];
  let stderrBytes = 0;
  decoder.stderr.on('data', (chunk: Buffer) => {
    if (stderrBytes < 16_384) {
      const kept = chunk.subarray(0, 16_384 - stderrBytes);
      stderr.push(kept);
      stderrBytes += kept.length;
    }
  });
  const output = (async () => {
    for await (const chunk of decoder.stdout) {
      outputBytes += chunk.length;
      if (outputBytes > 64 * 1024 * 1024) throw new Error('Stem waveform source is too long.');
      chunks.push(Buffer.from(chunk));
    }
  })();
  const closed = new Promise<void>((resolve, reject) => {
    decoder.once('error', reject);
    decoder.once('close', code => code === 0 ? resolve()
      : reject(new Error(Buffer.concat(stderr).toString('utf8').trim() || `ffmpeg exited with ${code}`)));
  });
  try {
    await Promise.all([output, closed]);
    const result = peaksFromPcm(Buffer.concat(chunks));
    if (!(result.durationSec > 0)) throw new Error('Stem waveform source has no usable audio.');
    return result;
  } catch (error) {
    decoder.kill('SIGKILL');
    throw error;
  }
}

function encode(sourceBytes: number, sourceMtime: number, waveform: StemWaveform): Buffer {
  const output = Buffer.alloc(HEADER_BYTES + waveform.peaks.length * 4);
  output.write(MAGIC, 0, 'ascii');
  output.writeUInt32LE(sourceBytes, 4);
  output.writeDoubleLE(sourceMtime, 8);
  output.writeDoubleLE(waveform.durationSec, 16);
  output.writeUInt32LE(waveform.peaks.length, 24);
  waveform.peaks.forEach((peak, index) => output.writeFloatLE(peak, HEADER_BYTES + index * 4));
  return output;
}

function decodeCache(data: Buffer, sourceBytes: number, sourceMtime: number): StemWaveform | null {
  if (data.length < HEADER_BYTES || data.toString('ascii', 0, 4) !== MAGIC
    || data.readUInt32LE(4) !== sourceBytes || data.readDoubleLE(8) !== sourceMtime) return null;
  const durationSec = data.readDoubleLE(16);
  const count = data.readUInt32LE(24);
  if (!(durationSec > 0) || data.length !== HEADER_BYTES + count * 4) return null;
  const peaks = Array.from({ length: count }, (_, index) => data.readFloatLE(HEADER_BYTES + index * 4));
  return { durationSec, peaks };
}

async function cacheIsCurrent(sourcePath: string, cachePath: string): Promise<boolean> {
  const source = await stat(sourcePath).catch(() => null);
  if (!source) return false;
  const cache = await lstat(cachePath).catch(() => null);
  if (!cache?.isFile() || cache.isSymbolicLink()) return false;
  const header = await readFile(cachePath).catch(() => null);
  return !!header && decodeCache(header, source.size, source.mtimeMs) !== null;
}

async function loadOrGenerate(sourcePath: string, cachePath: string, signal?: AbortSignal): Promise<StemWaveform> {
  const source = await stat(sourcePath);
  const cached = await lstat(cachePath).then(info => info.isFile() && !info.isSymbolicLink()
    ? readFile(cachePath).then(data => decodeCache(data, source.size, source.mtimeMs), () => null) : null, () => null);
  if (cached) return cached;
  const waveform = await decode(sourcePath, signal);
  const directory = path.dirname(cachePath);
  await mkdir(directory, { recursive: true, mode: 0o777 });
  const directoryInfo = await lstat(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error('Invalid stem waveform cache directory.');
  await writeFileAtomic(cachePath, encode(source.size, source.mtimeMs, waveform), { mode: 0o666 });
  return waveform;
}

export function subbeatsStemWaveform(sourcePath: string, cachePath: string, signal?: AbortSignal): Promise<StemWaveform> {
  const key = `${sourcePath}\0${cachePath}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const task = loadOrGenerate(sourcePath, cachePath, signal).finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}

export async function prepareSubbeatsStemWaveforms(trackId: string, preparedJob?: SubbeatsJob): Promise<void> {
  const job = preparedJob ?? readSubbeatsQueue(config.stateDir).jobs.find(item => item.id === trackId);
  if (!job?.bundleKey || !['prepared', 'unmeasurable'].includes(job.status)) return;
  await prepareJobSubbeatsStemWaveforms(job);
}

async function prepareJobSubbeatsStemWaveforms(job: SubbeatsJob): Promise<void> {
  const trackId = job.id;
  for (const window of ['head', 'tail'] as const) {
    const region = await stemCache.subbeatsCachedRegion(trackId, window, job);
    if (!region) continue;
    const prefix = window === 'head' ? 'head' : 'exit';
    for (const stem of STEM_WAVEFORM_NAMES) {
      const source = path.join(region.subbeatsBundleDir, `${prefix}-${stem}.flac`);
      const cache = subbeatsStemWaveformPath(trackId, region.subbeatsBundleKey, window, stem);
      await subbeatsStemWaveform(source, cache);
    }
  }
}

async function hasSubbeatsStemWaveforms(job: SubbeatsJob): Promise<boolean> {
  for (const window of ['head', 'tail'] as const) {
    const region = await stemCache.subbeatsCachedRegion(job.id, window, job);
    if (!region) continue;
    const prefix = window === 'head' ? 'head' : 'exit';
    for (const stem of STEM_WAVEFORM_NAMES) {
      if (!await cacheIsCurrent(path.join(region.subbeatsBundleDir, `${prefix}-${stem}.flac`),
        subbeatsStemWaveformPath(job.id, region.subbeatsBundleKey, window, stem))) return false;
    }
  }
  return true;
}

export async function backfillSubbeatsStemWaveforms(limit?: number): Promise<{ done: number; total: number; failed: number }> {
  const jobs = readSubbeatsQueue(config.stateDir).jobs.filter(job =>
    !!job.bundleKey && ['prepared', 'unmeasurable'].includes(job.status));
  const pendingJobs: SubbeatsJob[] = [];
  for (const job of jobs) if (!await hasSubbeatsStemWaveforms(job)) pendingJobs.push(job);
  const selected = Number.isFinite(limit) && limit! > 0 ? pendingJobs.slice(0, Math.floor(limit!)) : pendingJobs;
  let failed = 0;
  reportProgress({ phase: 'analyze', label: 'Preparing Sub/Beats stem preview waveforms', done: 0, total: selected.length });
  for (let index = 0; index < selected.length; index++) {
    const job = selected[index]!;
    try {
      await prepareJobSubbeatsStemWaveforms(job);
    } catch (error) {
      failed++;
      console.error(`[analyze] stem waveforms failed for ${job.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    reportProgress({ phase: 'analyze', label: `Preparing Sub/Beats stem preview waveforms: ${job.artist} — ${job.title}`,
      done: index + 1, total: selected.length, errors: failed });
  }
  console.log(`[analyze] Sub/Beats stem preview waveforms: ${selected.length - failed}/${selected.length} track(s) ready`);
  return { done: selected.length, total: selected.length, failed };
}
