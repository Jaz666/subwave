// Phase 1 status surface. It deliberately does not open the Sleeve Notes
// database: visiting Notes while disabled must be entirely inert.
import express from 'express';
import * as settings from '../settings.js';
import { requireAdmin } from '../middleware/auth.js';
import { rebuildWikipediaClaims, rebuildWikipediaClaimsForArtist, researchStoreReadout, researchStoreSummary } from '../sleeve-notes/research-repository.js';

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
    collectionRunning: enabled,
    collectionBlockedReason: enabled ? null : 'disabled',
    coverage: {},
    // Temporary development readout for the live MusicBrainz → Wikipedia → LLM
    // path. It remains read-only and deliberately does not expose notes on air.
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

// Deliberate maintenance action after changing claim validation. It replays
// only cached Wikipedia documents; it never repeats MusicBrainz/Wikipedia IO.
router.post('/sleeve-notes/rebuild-wikipedia-claims', requireAdmin, async (_req, res) => {
  await settings.load();
  if (settings.get().djBehaviour.extendedSleeveNotes !== true) {
    return res.status(409).json({ error: 'Extended Sleeve Notes is disabled' });
  }
  return res.json({ active: true, ...rebuildWikipediaClaims() });
});

// Narrow maintenance path for a known editorial correction. Artist-scoped
// because extraction jobs select the latest cached Wikipedia source by artist.
router.post('/sleeve-notes/rebuild-wikipedia-artist/:artistId', requireAdmin, async (req, res) => {
  await settings.load();
  if (settings.get().djBehaviour.extendedSleeveNotes !== true) {
    return res.status(409).json({ error: 'Extended Sleeve Notes is disabled' });
  }
  const artistId = String(req.params.artistId ?? '');
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(artistId)) {
    return res.status(400).json({ error: 'artistId must be a UUID' });
  }
  return res.json({ active: true, artistId, ...rebuildWikipediaClaimsForArtist(artistId) });
});
