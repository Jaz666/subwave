/** Queue-owned temporary stems. Leases protect workers and mixer-committed
 * files after a skip/removal. Operations serialize deletion against acquisition.
 * Supply a dedicated regular working root, never the persistent stem root.
 */
import { createHash } from 'node:crypto';
import { chmod, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { regularStemWorkingIds } from './regular-stem-policy.js';

export class RegularStemWorkingCache {
  private members = new Set<string>();
  private windows = new Map<string, Set<string>>();
  private leases = new Map<string, number>();
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly root: string) {}
  directoryFor(id: string): string { return path.join(this.root, this.key(id)); }
  private key(id: string): string {
    return createHash('sha256').update(id).digest('hex');
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }
  reconcile(current: string | null, queued: readonly string[],
    windows: readonly { trackId: string; key: string }[] = []): Promise<void> {
    const members = new Set([...regularStemWorkingIds(current, queued)].map(id => this.key(id)));
    return this.serial(async () => {
      this.members = members;
      this.windows = new Map();
      for (const window of windows) {
        const track = this.key(window.trackId);
        if (!members.has(track) || !/^[a-f0-9]{64}$/.test(window.key)) continue;
        const keys = this.windows.get(track) ?? new Set<string>();
        keys.add(window.key);
        this.windows.set(track, keys);
      }
      await this.sweep();
    });
  }
  acquire(id: string): Promise<{ directory: string; release: () => Promise<void> } | null> {
    return this.serial(async () => {
      const key = this.key(id);
      if (!this.members.has(key)) return null;
      const directory = path.join(this.root, key);
      await mkdir(directory, { recursive: true });
      await chmod(directory, 0o777).catch(() => {});
      this.leases.set(key, (this.leases.get(key) ?? 0) + 1);
      let released = false;
      return { directory, release: () => this.serial(async () => {
        if (released) return;
        released = true;
        const count = (this.leases.get(key) ?? 1) - 1;
        if (count) this.leases.set(key, count);
        else this.leases.delete(key);
        await this.sweep();
      }) };
    });
  }
  private async busyDirectory(directory: string): Promise<boolean> {
    for (const name of ['.regular-busy.json','.regular-render-busy.json']) {
      try {
        const busyPath = path.join(directory, name);
        const busy = JSON.parse(await readFile(busyPath, 'utf8')) as { until?: number };
        const info = await stat(busyPath);
        if (typeof busy.until === 'number' && busy.until > Date.now()
            && Date.now() - info.mtimeMs < 15 * 60_000) return true;
      } catch { /* absent/malformed/expired leases retain nothing */ }
    }
    return false;
  }
  async hasBusyJob(): Promise<boolean> {
    try {
      for (const entry of await readdir(this.root, { withFileTypes: true })) {
        if (entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name)
            && await this.busyDirectory(path.join(this.root,entry.name))) return true;
      }
    } catch { /* a root not created yet has no old jobs */ }
    return false;
  }
  private async sweep(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await chmod(this.root, 0o777).catch(() => {});
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      // Never follow links or delete miscellaneous operator files.
      if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
      if (this.leases.has(entry.name)) continue;
      // A controller restart loses process-local leases while a sidecar can
      // still be separating. The runner's bounded busy stamp protects it.
      if (await this.busyDirectory(path.join(this.root,entry.name))) continue;
      const directory = path.join(this.root, entry.name);
      if (!this.members.has(entry.name)) {
        await rm(directory, { recursive: true, force: true });
        continue;
      }
      // A new queue/grid revision can replace a window without retiring its
      // track. Only hash-named window dirs in this dedicated root are ours.
      const keep = this.windows.get(entry.name);
      for (const window of await readdir(directory, { withFileTypes: true })) {
        if (window.isDirectory() && /^[a-f0-9]{64}$/.test(window.name) && !keep?.has(window.name)) {
          await rm(path.join(directory, window.name), { recursive: true, force: true });
        }
      }
    }
  }
}
