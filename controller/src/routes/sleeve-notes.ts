// Phase 1 status surface. It deliberately does not open the Sleeve Notes
// database: visiting Notes while disabled must be entirely inert.
import express from 'express';
import * as settings from '../settings.js';
import { recentCalls } from '../llm/log.js';
import { gatedListenerCount } from '../broadcast/listeners.js';
import { activeWikipediaExtractPrompt, DEFAULT_WIKIPEDIA_EXTRACT_PROMPT } from '../sleeve-notes/wikipedia-prompt.js';
import { requireAdmin } from '../middleware/auth.js';
import { geniusAccessToken } from '../sleeve-notes/genius-token.js';
import { open as openSleeveNotesDb } from '../sleeve-notes/db.js';
import {
  adaptiveWikipediaChunkCharacters, requestWikipediaRefresh, researchQueueDetails,
  wikipediaCalibrationProfileHash, type WikipediaRefreshMode,
} from '../sleeve-notes/research-worker.js';
import { LlmResearcher } from '../sleeve-notes/llm-researcher.js';
import { RELEASE_GROUP_NOTE_CATEGORIES, wikipediaNoteCategories } from '../sleeve-notes/researcher.js';
import { allocateWikipediaClaims, planWikipediaChunks } from '../sleeve-notes/wikipedia-extract.js';
import { listModeration, moderateCandidate, moderateExistingClaim, moderationSource } from '../sleeve-notes/moderation.js';
import {
  rebuildWikipediaClaims,
  rebuildWikipediaClaimsForArtist,
  requeueCachedWikipediaResearch,
  researchConnectionsGraph,
  researchEntityDossier,
  resolveConnectionLocalTrack,
  researchStoreCoverage,
  researchStoreExplore,
  researchStoreReadout,
  researchStoreSummary,
  latestSourceDocumentForResearch,
  searchConnections,
  type ConnectionEdgeType,
  type ResearchExploreLevel,
  type ResearchEntityType,
} from '../sleeve-notes/research-repository.js';

export const router = express.Router();

router.get('/sleeve-notes/moderation', requireAdmin, async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
  if (status !== 'pending' && status !== 'approved' && status !== 'deleted'
    && status !== 'retained') {
    return res.status(400).json({ error: 'Unsupported moderation status' });
  }
  const number = (value: unknown, fallback: number, max: number) => {
    const parsed = typeof value === 'string' ? Number(value) : fallback;
    return Number.isFinite(parsed) ? Math.max(0, Math.min(max, Math.trunc(parsed))) : fallback;
  };
  const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 120).trim() : '';
  const provider = typeof req.query.provider === 'string' ? req.query.provider.slice(0, 40) : '';
  const limit = Math.max(1, number(req.query.limit, 25, 100));
  const offset = number(req.query.offset, 0, 1_000_000);
  return res.json(listModeration({ status, search, provider,
    reason: typeof req.query.reason === 'string' ? req.query.reason.slice(0, 40) : '',
    limit, offset,
  }));
});

router.get('/sleeve-notes/moderation/source/:id', requireAdmin, async (req, res) => {
  const source = moderationSource(String(req.params.id));
  if (!source) return res.status(404).json({ error: 'Source not found' });
  return res.json(source);
});

function moderationEdit(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const value = body as Record<string, unknown>;
  const fields = ['category', 'topic', 'wording', 'shortWording', 'evidence'] as const;
  if (fields.some((field) => typeof value[field] !== 'string')) return null;
  return {
    category: value.category as import('../sleeve-notes/researcher.js').SleeveNoteCategory,
    topic: value.topic as string,
    wording: value.wording as string,
    shortWording: value.shortWording as string,
    evidence: value.evidence as string,
  };
}

router.post('/sleeve-notes/moderation/:id/:action', requireAdmin, async (req, res) => {
  const action = String(req.params.action);
  if (action !== 'approved' && action !== 'deleted') return res.status(400).json({ error: 'Unsupported decision' });
  const edit = moderationEdit(req.body);
  if (action === 'approved' && !edit) return res.status(400).json({ error: 'Complete claim fields are required' });
  try {
    return res.json(moderateCandidate(String(req.params.id), action, edit));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Could not review claim' });
  }
});

router.post('/sleeve-notes/claims/:id/:action', requireAdmin, async (req, res) => {
  const action = String(req.params.action);
  if (action !== 'approved' && action !== 'deleted') return res.status(400).json({ error: 'Unsupported decision' });
  const edit = moderationEdit(req.body);
  if (action === 'approved' && !edit) return res.status(400).json({ error: 'Complete claim fields are required' });
  try {
    moderateExistingClaim(String(req.params.id), action, edit);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Could not update claim' });
  }
});

router.get('/sleeve-notes/status', requireAdmin, async (_req, res) => {
  await settings.load();
  const value = settings.get();
  const enabled = value.djBehaviour.extendedSleeveNotes === true;
  const customPrompt = value.sleeveNotes.wikipedia.extractPrompt;
  const providerEnabled = value.sleeveNotes.providers.genius.enabled === true;
  const savedToken = value.sleeveNotes.providers.genius.accessToken;
  const environmentToken = process.env.GENIUS_ACCESS_TOKEN;
  const providerConfigured = !!geniusAccessToken();
  const providerTokenSource = savedToken ? 'settings' : environmentToken ? 'environment' : 'missing';
  const collectionRunning = enabled && providerEnabled && providerConfigured;
  res.json({
    enabled,
    wikipediaPrompt: activeWikipediaExtractPrompt(customPrompt),
    wikipediaDefaultPrompt: DEFAULT_WIKIPEDIA_EXTRACT_PROMPT,
    wikipediaPromptIsCustom: !!customPrompt.trim(),
    provider: 'genius',
    providerEnabled,
    providerConfigured,
    providerTokenSource,
    collectionRunning,
    collectionBlockedReason: !enabled ? 'disabled' : !providerEnabled ? 'provider-disabled' : !providerConfigured ? 'provider-unconfigured' : null,
    coverage: enabled ? researchStoreCoverage() : {},
    // Temporary development readout for the live MusicBrainz → Wikipedia → LLM
    // path. It remains read-only and deliberately does not expose notes on air.
    replacement: enabled ? {
      admissionActive: true,
      researchWorkerActive: collectionRunning,
      ...researchStoreSummary(),
    } : null,
    onAirExposure: enabled,
  });
});

router.get('/sleeve-notes/wikipedia-refresh-preview', requireAdmin, async (_req, res) => {
  const db = openSleeveNotesDb();
  const rows = db.prepare(`SELECT entity_type AS entityType, COUNT(DISTINCT entity_id) AS entities,
      (SELECT COUNT(*) FROM sleeve_claims claim WHERE claim.entity_type = source.entity_type
        AND claim.operator_state = 'auto' AND claim.enabled = 1
        AND claim.entity_id IN (SELECT DISTINCT matching.entity_id FROM sleeve_source_documents matching
          WHERE matching.provider = 'wikipedia' AND matching.entity_type = source.entity_type)) AS claims
    FROM sleeve_source_documents source WHERE provider = 'wikipedia'
      AND entity_type IN ('artist', 'release-group') GROUP BY entity_type`).all() as Array<{
        entityType: string; entities: number; claims: number;
      }>;
  const artists = rows.find((row) => row.entityType === 'artist');
  const albums = rows.find((row) => row.entityType === 'release-group');
  return res.json({ artists: artists?.entities ?? 0, albums: albums?.entities ?? 0,
    claims: (artists?.claims ?? 0) + (albums?.claims ?? 0) });
});

router.post('/sleeve-notes/wikipedia-refresh', requireAdmin, async (req, res) => {
  const mode = req.body?.mode;
  if (mode !== 'clear' && mode !== 'replace') {
    return res.status(400).json({ error: 'Refresh mode must be clear or replace' });
  }
  return res.json({ active: true, mode: mode as WikipediaRefreshMode, ...requestWikipediaRefresh(mode) });
});

router.get('/sleeve-notes/wikipedia-preview-artists', requireAdmin, async (_req, res) => {
  const artists = openSleeveNotesDb().prepare(`SELECT DISTINCT artist.id AS id, artist.name AS name,
      EXISTS (SELECT 1 FROM sleeve_source_documents source WHERE source.provider = 'wikipedia'
        AND source.entity_type = 'artist' AND source.entity_id = artist.id) AS hasCachedArticle
    FROM sleeve_encounters encounter
    JOIN sleeve_local_attachments local ON local.local_track_id = encounter.local_track_id
    JOIN sleeve_recordings recording ON recording.id = local.recording_id
    JOIN sleeve_artists artist ON artist.id = recording.artist_id
    WHERE encounter.source = 'played'
    ORDER BY artist.name COLLATE NOCASE`).all() as Array<{ id: string; name: string; hasCachedArticle: number }>;
  return res.json({ artists: artists.map((artist) => ({
    ...artist, hasCachedArticle: Boolean(artist.hasCachedArticle),
  })) });
});

router.get('/sleeve-notes/wikipedia-preview-albums/:artistId', requireAdmin, async (req, res) => {
  const artistId = String(req.params.artistId ?? '').trim();
  if (!artistId || artistId.length > 300) return res.status(400).json({ error: 'Choose an encountered artist' });
  const albums = openSleeveNotesDb().prepare(`SELECT release.musicbrainz_release_group_id AS id,
      MIN(release.title) AS name,
      EXISTS (SELECT 1 FROM sleeve_source_documents source WHERE source.provider = 'wikipedia'
        AND source.entity_type = 'release-group'
        AND source.entity_id = release.musicbrainz_release_group_id) AS hasCachedArticle
    FROM sleeve_encounters encounter
    JOIN sleeve_local_attachments local ON local.local_track_id = encounter.local_track_id
    JOIN sleeve_recordings recording ON recording.id = local.recording_id
    JOIN sleeve_recording_releases recordingRelease ON recordingRelease.recording_id = recording.id
    JOIN sleeve_releases release ON release.id = recordingRelease.release_id
    WHERE encounter.source = 'played' AND recording.artist_id = ?
      AND release.musicbrainz_release_group_id IS NOT NULL
    GROUP BY release.musicbrainz_release_group_id
    ORDER BY name COLLATE NOCASE`).all(artistId) as Array<{
      id: string; name: string; hasCachedArticle: number;
    }>;
  return res.json({ albums: albums.map((album) => ({
    ...album, hasCachedArticle: Boolean(album.hasCachedArticle),
  })) });
});

router.post('/sleeve-notes/wikipedia-prompt-preview', requireAdmin, async (req, res) => {
  const entityType = req.body?.entityType === 'release-group' ? 'release-group'
    : req.body?.entityType === 'artist' ? 'artist' : null;
  const entityId = typeof req.body?.entityId === 'string' ? req.body.entityId.trim() : '';
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : null;
  if (!entityType || !entityId || entityId.length > 300 || prompt === null || prompt.length > 8000) {
    return res.status(400).json({ error: 'Choose an encountered artist or album and provide a prompt of at most 8,000 characters' });
  }
  const source = latestSourceDocumentForResearch(entityType, entityId, 'wikipedia');
  if (!source) return res.status(404).json({ error: `No cached Wikipedia article is available for this ${entityType === 'artist' ? 'artist' : 'album'}` });
  const profileHash = wikipediaCalibrationProfileHash(prompt);
  const chunks = planWikipediaChunks(source.content, adaptiveWikipediaChunkCharacters(profileHash));
  const chunk = chunks[0];
  if (!chunk) return res.status(422).json({ error: 'The cached article has no extractable text' });
  const job = {
    id: `wikipedia-prompt-preview:${entityType}:${entityId}`,
    document: { ...source, text: chunk.text },
    subjectKind: entityType === 'artist' ? 'artist' as const : 'album' as const,
    categories: entityType === 'artist' ? wikipediaNoteCategories('artist') : RELEASE_GROUP_NOTE_CATEGORIES,
    maxCandidates: 64,
    wikiNumber: (() => {
      const limit = entityType === 'artist' ? settings.get().sleeveNotes.wikipedia.artistClaimLimit
        : settings.get().sleeveNotes.wikipedia.albumClaimLimit;
      return allocateWikipediaClaims(chunks, limit)[0] ?? 0;
    })(),
    requireShortWording: false,
  };
  const controller = new AbortController();
  const disconnect = () => controller.abort(new Error('Preview client disconnected'));
  req.on('aborted', disconnect);
  res.on('close', () => { if (!res.writableEnded) disconnect(); });
  const timeout = setTimeout(() => controller.abort(new Error('45-second preview limit reached')), 45_000);
  const startedAt = Date.now();
  try {
    const output = await new LlmResearcher().extractWikipediaSparks(job, chunk.sectionPath,
      controller.signal, prompt);
    if (!controller.signal.aborted && !res.destroyed) {
      return res.json({ entityType, subject: source.entityName, section: chunk.sectionPath, output,
        wikiNumber: job.wikiNumber,
        elapsedMs: Date.now() - startedAt, inputCharacters: chunk.text.length });
    }
  } catch (error) {
    if (!controller.signal.aborted && !res.destroyed) {
      return res.status(502).json({ error: error instanceof Error ? error.message : 'Wikipedia prompt preview failed' });
    }
  } finally {
    clearTimeout(timeout);
    req.off('aborted', disconnect);
  }
  return undefined;
});

// This is intentionally a temporary admin inspection surface, not an API for
// DJ consumers. It is inert unless collection is already running.
router.get('/sleeve-notes/readout', requireAdmin, async (_req, res) => {
  await settings.load();
  if (settings.get().djBehaviour.extendedSleeveNotes !== true) {
    return res.json({ active: false, artists: [], claims: [], jobs: [] });
  }
  const wikipediaCalls = recentCalls.filter((call) => call.kind === 'sleeveNotesWikipediaExtract'
    && typeof call.ms === 'number');
  const wikipediaExtractAverageLatencyMs = wikipediaCalls.length
    ? Math.round(wikipediaCalls.reduce((total, call) => total + call.ms, 0) / wikipediaCalls.length)
    : null;
  const allowIdleRescans = settings.get().djBehaviour.sleeveNotesMaintenanceWhenEmpty === true
    && gatedListenerCount() === 0;
  const workQueueItems = researchQueueDetails(new Date(), allowIdleRescans);
  const queueCounts = new Map<string, { provider: string; capability: string; phase: string; jobs: number }>();
  for (const item of workQueueItems) {
    const key = `${item.provider}\u0000${item.capability}\u0000${item.phase}`;
    const count = queueCounts.get(key) ?? {
      provider: item.provider, capability: item.capability, phase: item.phase, jobs: 0,
    };
    count.jobs++;
    queueCounts.set(key, count);
  }
  return res.json({
    active: true,
    ...researchStoreReadout(),
    workQueue: [...queueCounts.values()],
    workQueueItems,
    wikipediaChunkCharacterTarget: adaptiveWikipediaChunkCharacters(),
    wikipediaExtractAverageLatencyMs,
    wikipediaExtractCallCount: wikipediaCalls.length,
  });
});

// Paged, level-specific reads for the artist → album → track explorer. Keep
// the bounded recent readout above for Overview and Research.
router.get('/sleeve-notes/explore', requireAdmin, async (req, res) => {
  await settings.load();
  const validLevels: ResearchExploreLevel[] = ['artists', 'albums', 'tracks'];
  const rawLevel = typeof req.query.level === 'string' ? req.query.level : 'artists';
  if (!validLevels.includes(rawLevel as ResearchExploreLevel)) {
    return res.status(400).json({ error: 'A supported Explore level is required' });
  }
  const level = rawLevel as ResearchExploreLevel;
  const artistId = typeof req.query.artistId === 'string' ? req.query.artistId.trim() : '';
  const albumId = typeof req.query.albumId === 'string' ? req.query.albumId.trim() : '';
  const rawAlbumType = typeof req.query.albumType === 'string' ? req.query.albumType : '';
  const albumType = rawAlbumType === 'release-group' || rawAlbumType === 'release' ? rawAlbumType : undefined;
  const rawLetter = typeof req.query.letter === 'string' ? req.query.letter.trim() : '';
  if (rawLetter && !/^[a-z]$/i.test(rawLetter)) {
    return res.status(400).json({ error: 'Explore letter must be a single A–Z character' });
  }
  const letter = rawLetter.toLowerCase();
  if ((level === 'albums' || level === 'tracks') && (!artistId || artistId.length > 200)) {
    return res.status(400).json({ error: 'A supported artist id is required for this Explore level' });
  }
  if (level === 'tracks' && (!albumId || albumId.length > 200 || !albumType)) {
    return res.status(400).json({ error: 'A supported album id and type are required for track Explore' });
  }
  if (settings.get().djBehaviour.extendedSleeveNotes !== true) {
    return res.json({ active: false, level, entities: [], total: 0, limit: 30, offset: 0 });
  }
  const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 30;
  const rawOffset = typeof req.query.offset === 'string' ? Number(req.query.offset) : 0;
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.trunc(rawLimit))) : 30;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.trunc(rawOffset)) : 0;
  const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 120) : '';
  return res.json({ active: true, level, ...researchStoreExplore({
    level, artistId, albumType, albumId, letter, search, limit, offset,
  }) });
});

router.get('/sleeve-notes/dossier/:entityType/:entityId', requireAdmin, async (req, res) => {
  await settings.load();
  if (settings.get().djBehaviour.extendedSleeveNotes !== true) {
    return res.status(409).json({ error: 'Extended Sleeve Notes is disabled' });
  }
  const entityType = String(req.params.entityType);
  const validTypes: ResearchEntityType[] = ['artist', 'recording', 'release', 'release-group'];
  const entityId = String(req.params.entityId ?? '').trim();
  if (!validTypes.includes(entityType as ResearchEntityType) || !entityId || entityId.length > 200) {
    return res.status(400).json({ error: 'A supported entity type and id are required' });
  }
  const dossier = researchEntityDossier(entityType as ResearchEntityType, entityId);
  if (!dossier) return res.status(404).json({ error: 'No retained dossier exists for this entity' });
  return res.json({ active: true, ...dossier });
});

const connectionEdgeTypes: ConnectionEdgeType[] = [
  'samples', 'sampled-in', 'cover-of', 'covered-by', 'producer', 'writer',
  'performed-by', 'appears-on', 'series-membership',
];

router.get('/sleeve-notes/connections/search', requireAdmin, async (req, res) => {
  await settings.load();
  if (settings.get().djBehaviour.extendedSleeveNotes !== true) {
    return res.json({ active: false, results: [] });
  }
  const query = typeof req.query.q === 'string' ? req.query.q.slice(0, 120) : '';
  const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 12;
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(30, Math.trunc(rawLimit))) : 12;
  return res.json({ active: true, results: searchConnections(query, limit) });
});

router.get('/sleeve-notes/connections/resolve/:localTrackId', requireAdmin, async (req, res) => {
  await settings.load();
  if (settings.get().djBehaviour.extendedSleeveNotes !== true) {
    return res.status(409).json({ error: 'Extended Sleeve Notes is disabled' });
  }
  const localTrackId = String(req.params.localTrackId ?? '').trim();
  if (!localTrackId || localTrackId.length > 300) {
    return res.status(400).json({ error: 'A supported local track id is required' });
  }
  const result = resolveConnectionLocalTrack(localTrackId);
  if (!result) return res.status(404).json({ error: 'The current track has not been matched for Sleeve Notes yet' });
  return res.json({ active: true, result });
});

router.get('/sleeve-notes/connections/graph', requireAdmin, async (req, res) => {
  await settings.load();
  if (settings.get().djBehaviour.extendedSleeveNotes !== true) {
    return res.status(409).json({ error: 'Extended Sleeve Notes is disabled' });
  }
  const entityType = typeof req.query.entityType === 'string' ? req.query.entityType : '';
  const entityId = typeof req.query.entityId === 'string' ? req.query.entityId.trim() : '';
  const validTypes = ['artist', 'recording', 'release', 'release-group', 'series'] as const;
  if (!validTypes.includes(entityType as typeof validTypes[number]) || !entityId || entityId.length > 300) {
    return res.status(400).json({ error: 'A supported Connections entity type and id are required' });
  }
  const requestedEdges = typeof req.query.edges === 'string'
    ? [...new Set(req.query.edges.split(',').filter((value): value is ConnectionEdgeType =>
      connectionEdgeTypes.includes(value as ConnectionEdgeType)))]
    : connectionEdgeTypes;
  const graph = researchConnectionsGraph({
    entityType: entityType as typeof validTypes[number], entityId, edgeTypes: requestedEdges,
  });
  if (!graph) return res.status(404).json({ error: 'No retained Connections entity was found' });
  return res.json({ active: true, ...graph });
});

// Non-destructive replay from cached text. Existing claims and sources remain.
router.post('/sleeve-notes/requeue-wikipedia-research', requireAdmin, async (_req, res) => {
  await settings.load();
  if (settings.get().djBehaviour.extendedSleeveNotes !== true) {
    return res.status(409).json({ error: 'Extended Sleeve Notes is disabled' });
  }
  return res.json({ active: true, ...requeueCachedWikipediaResearch() });
});

// Deliberate rebuild after changing claim validation. This removes and
// re-extracts Wikipedia claims from cached documents.
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
