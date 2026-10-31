// Delete only a track's extended artifacts. Keep its record until file removal
// succeeds, so a permission failure can be retried without losing the entry.
import { lstat, rm } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { createSubbeatsStore } from './subbeats-store.js';
import * as stems from './stem-cache.js';
import { readPidfile, isPidAlive } from './tagger-lock.js';

let removing = false;
export const subbeatsRemovalRunning = () => removing;
async function realDirectory(dir:string):Promise<boolean> {
  const st = await lstat(dir).catch((error:NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (!st) return false;
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('Extended cache path is unsafe; no files were removed');
  return true;
}
export async function removeSubbeatsEntry(id:string):Promise<void> {
  if (removing) throw new Error('Another Sub/Beats entry is being removed');
  removing = true;
  try {
    const lock = readPidfile();
    if (lock && isPidAlive(lock.pid)) throw new Error('Wait for library analysis to finish before removing an entry');
    const store = createSubbeatsStore(config.stateDir);
    const state = store.read();
    const job = state.jobs.find(job => job.id === id);
    if (!job) return;
    if (['queued','running'].includes(job.status)) throw new Error('Wait for preparation to finish before removing this entry');
    if (!id || id.startsWith('.') || path.basename(id) !== id || id.includes('\\')) throw new Error('Invalid track id');
    const marker = await lstat(path.join(stems.stemsRoot(),stems.STEMS_MARKER)).catch(() => null);
    if (!marker?.isFile() || marker.isSymbolicLink() || !(await stems.stemsRootStatus({readOnly:true})).online) throw new Error('Stem cache is offline. Connect it before removing this entry');
    const track = stems.dirFor(id);
    const extended = path.join(track,'subbeats');
    const paths:string[] = [];
    if (await realDirectory(track) && await realDirectory(extended)) paths.push(extended);
    const legacy = path.join(config.stateDir,'subbeats');
    if (await realDirectory(legacy) && await realDirectory(path.join(legacy,'v1')) && job.bundleKey
      && !state.jobs.some(other => other.id !== id && other.bundleKey === job.bundleKey)) {
      const bundle = path.join(legacy,'v1',job.bundleKey);
      if (await realDirectory(bundle)) paths.push(bundle);
    }
    // All paths are checked before deletion. Never remove the regular track folder.
    if (paths.length) {
      try { for (const dir of paths) await rm(dir,{recursive:true,force:true}); }
      finally { await stems.invalidateUsageSnapshot(); }
    }
    store.remove(id);
  } finally { removing = false; }
}
