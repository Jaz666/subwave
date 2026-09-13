// Phase 1 status surface. It deliberately does not open the Sleeve Notes
// database: visiting Notes while disabled must be entirely inert.
import express from 'express';
import * as settings from '../settings.js';
import { requireAdmin } from '../middleware/auth.js';
import { collectionPlan } from '../sleeve-notes/runtime.js';
import { databaseReadout, sourceCounts } from '../sleeve-notes/repository.js';

export const router = express.Router();

router.get('/sleeve-notes/status', requireAdmin, async (_req, res) => {
  await settings.load();
  const value = settings.get();
  const enabled = value.djBehaviour.extendedSleeveNotes === true;
  const providerEnabled = value.sleeveNotes.providers.genius.enabled === true;
  const providerConfigured = providerEnabled && !!process.env.GENIUS_ACCESS_TOKEN;
  const plan = collectionPlan({ enabled, providerConfigured });
  res.json({
    enabled,
    provider: 'genius',
    providerEnabled,
    providerConfigured,
    collectionRunning: plan.run,
    collectionBlockedReason: plan.run ? null : plan.reason,
    coverage: plan.run ? sourceCounts('genius') : {},
    onAirExposure: false,
  });
});

// This is intentionally a temporary admin inspection surface, not an API for
// DJ consumers. It is inert unless collection is already running.
router.get('/sleeve-notes/readout', requireAdmin, async (_req, res) => {
  await settings.load();
  const value = settings.get();
  const plan = collectionPlan({
    enabled: value.djBehaviour.extendedSleeveNotes === true,
    providerConfigured: value.sleeveNotes.providers.genius.enabled === true && !!process.env.GENIUS_ACCESS_TOKEN,
  });
  if (!plan.run) return res.json({ active: false, entities: [], relationships: [], jobs: [] });
  return res.json({ active: true, ...databaseReadout('genius') });
});
