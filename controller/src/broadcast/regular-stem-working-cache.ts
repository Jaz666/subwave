/** Queue-owned temporary stems. Leases protect workers and mixer-committed
 * files after a skip/removal. Operations serialize deletion against acquisition.
 * Supply a dedicated regular working root, never the persistent stem root.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { regularStemWorkingIds } from './regular-stem-policy.js';

export class RegularStemWorkingCache {
  private members = new Set<string>();
  private leases = new Map<string, number>();
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly root: string) {}
  private key(id: string): string {
    return createHash('sha256').update(id).digest('hex');
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }
  reconcile(current: string | null, queued: readonly string[]): Promise<void> {
    const members = new Set([...regularStemWorkingIds(current, queued)].map(id => this.key(id)));
    return this.serial(async () => {
      this.members = members;
      await this.sweep();
    });
  }
  acquire(id: string): Promise<{ directory: string; release: () => Promise<void> } | null> {
    return this.serial(async () => {
      const key = this.key(id);
      if (!this.members.has(key)) return null;
      const directory = path.join(this.root, key);
      await mkdir(directory, { recursive: true });
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
  private async sweep(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      // Never follow links or delete miscellaneous operator files.
      if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
      if (this.members.has(entry.name) || this.leases.has(entry.name)) continue;
      await rm(path.join(this.root, entry.name), { recursive: true, force: true });
    }
  }
}
