// Phase 1 status surface. It deliberately does not open the Sleeve Notes
// database: visiting Notes while disabled must be entirely inert.
import express from 'express';
import * as settings from '../settings.js';
import { requireAdmin } from '../middleware/auth.js';
import { researchStoreReadout, researchStoreSummary } from '../sleeve-notes/research-repository.js';

export const router = express.Router();

router.get('/sleeve-notes/status', requireAdmin, async (_req, res) => {
  await settings.load();
  const value = settings.get();
  const enabled = value.djBehaviour.extendedSleeveNotes === true;
  const providerEnabled = value.sleeveNotes.providers.genius.enabled === true;
  const providerConfigured = providerEnabled && !!process.env.GENIUS_ACCESS_TOKEN;
  res.json({
    enabled,
    provider: 'genius',
    providerEnabled,
    providerConfigured,
    collectionRunning: false,
    collectionBlockedReason: enabled ? 'replacement-stage-1-only' : 'disabled',
    coverage: {},
    // The replacement path is live only as a local Stage-1 admission queue.
    // A quiet-time MusicBrainz worker is introduced separately, so this makes
    // the temporary state explicit rather than suggesting that Genius runs.
    replacement: enabled ? {
      admissionActive: true,
      researchWorkerActive: true,
      ...researchStoreSummary(),
    } : null,
    onAirExposure: false,
  });
});

// This is intentionally a temporary admin inspection surface, not an API for
// DJ consumers. It is inert unless collection is already running.
router.get('/sleeve-notes/readout', requireAdmin, async (_req, res) => {
  await settings.load();
  if (settings.get().djBehaviour.extendedSleeveNotes !== true) {
    return res.json({ active: false, artists: [], claims: [], jobs: [] });
  }
  return res.json({ active: true, ...researchStoreReadout() });
});
