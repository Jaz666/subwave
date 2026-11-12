// GET /stem-cache/usage: the stem cache's STORED size beside the budget
// in force, for the Settings budget field's "cache used" line and its warning
// when a new budget would make the next sweep delete stems, plus, while
// pick-time stems is on, how far over the budget the cache may run by design.
//
// Admin-only. Reads the usage snapshot and never walks the cache
// (`stemCache.storedUsage()`); `usage` is null until a sweep or an analysis
// pass has measured it once.

import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import * as settings from '../settings.js';
import * as stemCache from '../music/stem-cache.js';
import { designedOvershootBytes } from '../broadcast/pick-stems-policy.js';
import { config } from '../config.js';
import { readSubbeatsQueue } from '../music/subbeats-store.js';

export const router = Router();

router.get('/stem-cache/usage', requireAdmin, async (_req, res) => {
  let usage: stemCache.StoredUsage | null = null;
  try { usage = await stemCache.storedUsage(); } catch { /* reported as unmeasured */ }
  const budgetBytes = stemCache.budgetBytes();
  // With pick-time stems on, the cache runs over its budget between sweeps by
  // design (pick-stems-policy.ts): how far, so the budget field can say so
  // rather than warn. Off, the answer is unchanged.
  const pickTime = settings.get()?.transitions?.pickTimeStems === true && usage
    ? { pickTimeOvershootBytes: designedOvershootBytes(budgetBytes, usage.estTrackBytes) }
    : {};
  res.json({ usage, budgetBytes, ...pickTime });
});

router.get('/stem-cache/coverage', requireAdmin, async (req, res) => {
  const ids = typeof req.query.ids === 'string' ? [...new Set(req.query.ids.split(',').filter(Boolean))] : [];
  if (ids.length > 8 || ids.some(id => id.length > 200)) {
    res.status(400).json({ error: 'Provide up to 8 track ids' });
    return;
  }
  const coverage: Record<string, { regular: { head: boolean; tail: boolean }; subbeats: { head: boolean; exit: boolean } }> = {};
  const jobs = new Map(readSubbeatsQueue(config.stateDir).jobs.map(job => [job.id, job]));
  await Promise.all(ids.map(async id => {
    const [regularHead, regularTail, subbeats] = await Promise.all([
      stemCache.hasWindow(id, 'head'), stemCache.hasWindow(id, 'tail'),
      stemCache.subbeatsCachedCoverage(id, jobs.get(id)),
    ]);
    coverage[id] = {
      regular: { head: regularHead, tail: regularTail },
      subbeats,
    };
  }));
  res.json({ coverage });
});
