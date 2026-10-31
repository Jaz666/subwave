// Explicit opt-in for selective regular stems. Missing state preserves upstream
// admission. Reads never create files; invalid state is surfaced, not overwritten.
import { existsSync, readFileSync, mkdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { writeFileAtomicSync } from '../util/atomic-file.js';
import { subbeatsStemPolicySchema, type subbeatsStemPolicyPatchSchema } from '../schemas/subbeats.js';
import type { z } from 'zod';

export function readSubbeatsStemPolicy() {
  const file = join(config.stateDir, 'subbeats', 'stem-policy.json');
  return existsSync(file) ? subbeatsStemPolicySchema.parse(JSON.parse(readFileSync(file, 'utf8')))
    : subbeatsStemPolicySchema.parse({});
}

export function updateSubbeatsStemPolicy(patch: z.infer<typeof subbeatsStemPolicyPatchSchema>) {
  const state = readSubbeatsStemPolicy();
  if (patch.enabled !== undefined) state.enabled = patch.enabled;
  if (patch.track) {
    const ids = new Set(state.regularIds);
    if (patch.track.include) ids.add(patch.track.id); else ids.delete(patch.track.id);
    state.regularIds = [...ids];
  }
  const validated = subbeatsStemPolicySchema.parse(state);
  const root = join(config.stateDir, 'subbeats');
  if (existsSync(root) && lstatSync(root).isSymbolicLink()) throw new Error('Sub/Beats requires its own state folder');
  mkdirSync(root, { recursive: true });
  writeFileAtomicSync(join(root, 'stem-policy.json'), JSON.stringify(validated), { durable: true });
  return validated;
}
