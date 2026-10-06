// Phase 1 status surface. It deliberately does not open the Sleeve Notes
// database: visiting Notes while disabled must be entirely inert.
import express from 'express';
import * as settings from '../settings.js';
import { requireAdmin } from '../middleware/auth.js';
import { researchStoreCoverage, researchStoreReadout, researchStoreSummary } from '../sleeve-notes/research-repository.js';

export const router = express.Router();

router.get('/sleeve-notes/status', requireAdmin, async (_req, res) => {
  await settings.load();
  const value = settings.get();
  const enabled = value.djBehaviour.extendedSleeveNotes === true;
  const providerEnabled = value.sleeveNotes.providers.genius.enabled === true;
  const providerConfigured = !!process.env.GENIUS_ACCESS_TOKEN;
  const collectionRunning = enabled && providerEnabled && providerConfigured;
  const collectionBlockedReason = !enabled ? 'disabled'
    : !providerEnabled ? 'provider-disabled'
      : !providerConfigured ? 'provider-unconfigured' : null;
  res.json({
    enabled,
    provider: 'genius',
    providerEnabled,
    providerConfigured,
    collectionRunning,
    collectionBlockedReason,
    coverage: enabled ? researchStoreCoverage() : {},
    replacement: enabled ? {
      admissionActive: true,
      researchWorkerActive: collectionRunning,
      geniusLyricsFetched: false,
      ...researchStoreSummary(),
    } : null,
    onAirExposure: enabled,
  });
});

// This is an admin inspection surface, not an API for DJ consumers.
router.get('/sleeve-notes/readout', requireAdmin, async (_req, res) => {
  await settings.load();
  if (settings.get().djBehaviour.extendedSleeveNotes !== true) {
    return res.json({ active: false, artists: [], claims: [], jobs: [] });
  }
  return res.json({ active: true, ...researchStoreReadout() });
});
