/** Complete recordings retained only for the current regular-stem working set.
 * Sources stream to disk once; the analysis prefix cap remains unchanged.
 * The existing queue cache supplies retirement and worker-safe leases.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { config } from '../config.js';
import * as analyzer from './analyzer.js';
import * as db from './library-db.js';
import { findLibraryFile } from './subsonic.js';
import { RegularStemWorkingCache } from '../broadcast/regular-stem-working-cache.js';
import { requireRegularStemSpace } from '../broadcast/regular-stem-space.js';

const cache = new RegularStemWorkingCache(path.join(config.stateDir, 'regular-stem-sources'));
let membership: Promise<void> = Promise.resolve();
// One writer at a time makes each disk-space check account for prior sources.
let staging: Promise<unknown> = Promise.resolve();
const readers = new Map<string, number>();
const inFlight = new Map<string, Promise<{ path: string; bytes: number; sha256: string }>>();

export function retainRegularStemSources(current: string | null, queued: readonly string[]): void {
  membership = cache.reconcile(current, queued, []);
  void membership.catch(() => {}); // acquisition reports an unavailable cache
}

async function fingerprint(file: string, bytes: number, signal: AbortSignal): Promise<string> {
  const before = await stat(file);
  if (!before.isFile() || before.size !== bytes) throw new Error('complete recording size differs from the library');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file, { signal })) hash.update(chunk);
  const after = await stat(file);
  if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ino !== before.ino)
    throw new Error('recording changed while reading complete audio');
  return hash.digest('hex');
}

export async function acquireRegularStemSource(id: string, opts: {
  expectedBytes?: number; expectedSha256?: string; timeoutMs?: number; deadlineMs?: number; log?: (message: string) => void;
} = {}) {
  await membership;
  const lease = await cache.acquire(id);
  if (!lease) throw new Error('recording is no longer in the regular working queue');
  readers.set(id, (readers.get(id) ?? 0)+1);
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    const count = (readers.get(id) ?? 1)-1;
    if (count) readers.set(id,count); else readers.delete(id);
    await lease.release();
  };
  const row = db.getDb() ? db.getTrack(id) : null;
  const file = db.getDb() ? db.trackFileInfo(id) : null;
  const bytes = file?.fileSize ?? opts.expectedBytes;
  const label = [row?.title, row?.artist].filter(Boolean).join(' — ') || id;
  try {
    if (!Number.isSafeInteger(bytes) || !bytes || bytes < 1 || bytes > Number.MAX_SAFE_INTEGER - 1024 * 1024)
      throw new Error('complete recording requires a known library file size');
    if (opts.expectedBytes != null && opts.expectedBytes !== bytes) throw new Error('library recording changed before preparation');
    let work = inFlight.get(id);
    if (!work) {
      work = staging.catch(() => {}).then(async () => {
        const timeoutMs = Math.floor(Math.min(300_000, opts.timeoutMs ?? config.analyzer.requestTimeoutMs,
          opts.deadlineMs == null ? Infinity : opts.deadlineMs - Date.now()));
        if (timeoutMs <= 0) throw new Error('complete-source preparation deadline passed');
        const signal = AbortSignal.timeout(timeoutMs);
        const expires = Date.now()+timeoutMs;
        const audio = path.join(lease.directory, 'source.audio');
        const meta = path.join(lease.directory, 'source.json');
        try {
          const saved = JSON.parse(await readFile(meta, 'utf8'));
          if (saved.bytes === bytes) {
            const sha256 = await fingerprint(audio, bytes, signal);
            if (sha256 === saved.sha256 && (!opts.expectedSha256 || sha256 === opts.expectedSha256))
              return { path: audio, bytes, sha256 };
          }
        } catch { /* absent, partial or stale source: acquire a new complete copy */ }
        signal.throwIfAborted();
        // A changed source cannot replace a path still owned by another job.
        if ((readers.get(id) ?? 0) > 1 || await cache.hasBusyJob()) {
          if (await stat(audio).then(() => true, () => false))
            throw new Error('complete recording replacement waits for active workers');
        }
        await rm(meta, { force: true });
        await rm(audio, { force: true });
        await requireRegularStemSpace([{ directory: lease.directory, bytes: bytes + 1024 * 1024 }]);
        const partial = path.join(lease.directory, 'source.part');
        const local = file ? findLibraryFile({ path: file.filePath, size: bytes, title: row?.title }) : null;
        opts.log?.(`Regular stems: ${local ? 'reading local' : 'downloading'} complete source for ${label} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`);
        try {
          if (local) {
            const before = await stat(local);
            if (before.size !== bytes) throw new Error('local recording size differs from the library');
            await pipeline(createReadStream(local, { end: bytes }), createWriteStream(partial), { signal });
            const after = await stat(local);
            if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ino !== before.ino)
              throw new Error('local recording changed during source preparation');
          } else {
            const result = await analyzer.downloadCapped(id, { maxBytes: bytes + 1,
              timeoutMs: Math.max(1, expires-Date.now()), destination: partial });
            if (!result.complete) throw new Error('complete recording exceeds its library file size');
          }
          const sha256 = await fingerprint(partial, bytes, signal);
          if (opts.expectedSha256 && sha256 !== opts.expectedSha256) throw new Error('complete recording differs from the measured grid');
          if (db.getDb() && file?.fileSize !== db.trackFileInfo(id)?.fileSize) throw new Error('library recording changed during source preparation');
          await rename(partial, audio);
          await writeFile(meta, JSON.stringify({ bytes, sha256 }));
          return { path: audio, bytes, sha256 };
        } finally { await rm(partial, { force: true }); }
      });
      inFlight.set(id, work);
      staging = work;
      void work.finally(() => { if (inFlight.get(id) === work) inFlight.delete(id); }).catch(() => {});
    }
    const source = await work;
    if (source.bytes !== bytes || (opts.expectedSha256 && source.sha256 !== opts.expectedSha256))
      throw new Error('complete recording differs from the requested stem window');
    return { ...source, release: async (completed = true) => {
      // After a transport timeout the sidecar may still read/hash this file.
      if (!completed) await writeFile(path.join(lease.directory, '.regular-busy.json'),
        JSON.stringify({ until: Date.now() + 15 * 60_000 }));
      await release();
    } };
  } catch (error) { await release(); throw error; }
}
