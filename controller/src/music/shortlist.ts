// Native shortlist execution.
//
// This first seam deliberately accepts an explicit source plan. It lets us
// replay recorded vanilla picker calls through the exact existing source
// registry before we introduce a native source-planning policy of our own.
// Nothing here calls an LLM, chooses a track, or writes queue state.

import { buildPickerTools, type PickerScope } from '../llm/tools.js';

export type ShortlistSourceCall = {
  source: string;
  args: Record<string, unknown>;
};

export type ShortlistPlanningContext = {
  scope: PickerScope;
  // The current track remains a discovery seed, never a shortlist candidate.
  currentTrackId: string | null;
  discoveryPasses: number;
  // Resolved from the show snapshot by the eventual controller call site. The
  // scope carries strict locks; these soft values are only source arguments.
  moods?: string[] | null;
  energies?: string[] | null;
  // Mirrors the existing ε-greedy deep-cut nudge. Callers decide the random
  // draw once, outside this deterministic planner.
  explore?: boolean;
};

const ENERGY_VALUES = new Set(['low', 'medium', 'high']);

// Produce the native source plan from already-resolved station state. The
// ordering is deliberately small and factual: a journey or show playlist
// leads, then current-track similarity, then the show's mood/energy context.
// A lane wraps when the pass budget exceeds its distinct calls, so repeated
// source calls remain possible just as they are in the vanilla tool loop.
export function planShortlistSources(
  context: ShortlistPlanningContext,
  availableSources: ReadonlySet<string>,
): ShortlistSourceCall[] {
  const budget = Math.max(1, Math.min(5, Math.floor(context.discoveryPasses) || 1));
  const calls: ShortlistSourceCall[] = [];
  const add = (source: string, args: Record<string, unknown> = {}) => {
    if (availableSources.has(source)) calls.push({ source, args });
  };

  const mood = context.moods?.find((value): value is string => typeof value === 'string' && value.length > 0) ?? null;
  const energy = context.energies?.find((value): value is 'low' | 'medium' | 'high' => ENERGY_VALUES.has(value)) ?? null;

  // The first lane is source-owned: a non-existent journey or playlist source
  // is simply absent from `availableSources`, never represented as a futile
  // empty call. Later passes keep going when an earlier source is thin.
  if (context.scope.audioWaypoint?.length) add('tracksTowardJourney');
  else if (context.scope.playlistTracks?.length) add('showPlaylistTracks');

  if (mood) add('tracksByMood', { mood, energy });
  else if (energy) add('tracksByEnergy', { energy });
  if (context.currentTrackId) {
    add('tracksThatSoundLikeThis', { songId: context.currentTrackId });
    add('tracksLikeThis', { songId: context.currentTrackId });
  }
  if (context.explore) add('deepCuts');

  // A strict playlist's curated source remains the only guaranteed in-set
  // source. Put it back into the lane after the first contextual pass instead
  // of adding a special ranking or a global cap.
  if (context.scope.playlistLock && context.scope.playlistTracks?.length) add('showPlaylistTracks');
  if (context.scope.audioWaypoint?.length) add('tracksTowardJourney');

  if (!calls.length) return [];
  return Array.from({ length: budget }, (_, index) => calls[index % calls.length]);
}

export type ShortlistSourceRun = ShortlistSourceCall & {
  status: 'ok' | 'unavailable' | 'invalid' | 'error';
  returned: number;
  accepted: number;
  elapsedMs: number;
  error?: string;
};

export type ShortlistCandidate = any & { shortlistSources: string[] };

export type ShortlistResult = {
  candidates: ShortlistCandidate[];
  sourceRuns: ShortlistSourceRun[];
  uniqueCandidates: number;
  elapsedMs: number;
};

type ReplayToolCall = {
  name?: string;
  args: unknown;
  result: unknown;
  round?: number;
};

function resultTrackIds(result: unknown): string[] {
  const tracks = Array.isArray(result)
    ? result
    : result && typeof result === 'object' && Array.isArray((result as { tracks?: unknown }).tracks)
      ? (result as { tracks: unknown[] }).tracks
      : [];
  return tracks
    .map((track: any) => track?.id)
    .filter((id): id is string => typeof id === 'string');
}

// The durable replay record deliberately contains only data required to rerun
// discovery: resolved guards, source calls, and stable candidate ids. It keeps
// prompts, model responses, credentials, and unrelated session history out of
// the fixture stream.
export function replayFixtureTrace({
  currentTrack,
  show,
  scope,
  toolCalls,
}: {
  currentTrack: any;
  show: any;
  scope: PickerScope;
  toolCalls: ReplayToolCall[];
}) {
  return {
    version: 1,
    currentTrack: currentTrack ? {
      id: currentTrack.id ?? null,
      title: currentTrack.title ?? null,
      artist: currentTrack.artist ?? null,
      album: currentTrack.album ?? null,
    } : null,
    show: show ? {
      id: show.id ?? null,
      name: show.name ?? null,
      genres: show.genres ?? [],
      moods: show.moods ?? [],
      energies: show.energies ?? [],
      eras: show.eras ?? [],
      filtersStrict: !!show.filtersStrict,
      playlistStrict: !!show.playlistStrict,
    } : null,
    scope: {
      recentIds: [...scope.recentIds].sort(),
      recentKeys: [...scope.recentKeys].sort(),
      hardRecentIds: [...scope.hardRecentIds].sort(),
      hardRecentKeys: [...scope.hardRecentKeys].sort(),
      genreLock: scope.genreLock,
      eraLock: scope.eraLock,
      moodLock: scope.moodLock,
      energyLock: scope.energyLock,
      vocalLock: scope.vocalLock,
      playlistLock: scope.playlistLock ? [...scope.playlistLock].sort() : null,
      playlistTrackIds: scope.playlistTracks?.map((track: any) => track?.id).filter(Boolean) ?? null,
      excludedIds: scope.excludedIds ? [...scope.excludedIds].sort() : null,
      audioWaypoint: scope.audioWaypoint,
    },
    sourceCalls: toolCalls
      .filter((call) => typeof call.name === 'string')
      .map((call) => ({
        source: call.name,
        args: call.args && typeof call.args === 'object' ? call.args : {},
        round: call.round ?? 1,
        candidateIds: resultTrackIds(call.result),
      })),
  };
}

type PickerTool = {
  inputSchema?: { safeParse?: (value: unknown) => { success: boolean; data?: unknown; error?: { issues?: Array<{ message?: string }> } } };
  execute?: (args: unknown, context: unknown) => Promise<unknown>;
};

type PickerToolSet = Record<string, PickerTool | undefined>;

function trackCount(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  if (!result || typeof result !== 'object') return 0;
  const value = result as { tracks?: unknown; candidates?: unknown };
  if (Array.isArray(value.tracks)) return value.tracks.length;
  if (Array.isArray(value.candidates)) return value.candidates.length;
  return 0;
}

function resultError(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const error = (result as { error?: unknown }).error;
  return typeof error === 'string' && error ? error : undefined;
}

// Execute an explicit source plan against a freshly-built picker registry.
// `seen` is the existing registry's authoritative, already-filtered and
// de-duplicated candidate accumulator; the size delta is therefore the exact
// number this source contributed to a vanilla agent run.
export async function executeShortlistPlan(
  tools: PickerToolSet,
  seen: Map<string, any>,
  plan: ShortlistSourceCall[],
): Promise<ShortlistResult> {
  const started = performance.now();
  const sourceRuns: ShortlistSourceRun[] = [];
  const sourcesById = new Map<string, string[]>();

  for (const call of plan) {
    const tool = tools[call.source];
    if (!tool?.execute) {
      sourceRuns.push({ ...call, status: 'unavailable', returned: 0, accepted: 0, elapsedMs: 0 });
      continue;
    }

    const parsed = tool.inputSchema?.safeParse?.(call.args);
    if (parsed && !parsed.success) {
      sourceRuns.push({
        ...call,
        status: 'invalid',
        returned: 0,
        accepted: 0,
        elapsedMs: 0,
        error: parsed.error?.issues?.[0]?.message || 'invalid source input',
      });
      continue;
    }

    const before = new Set(seen.keys());
    const callStarted = performance.now();
    try {
      const result = await tool.execute(parsed?.data ?? call.args, {
        toolCallId: `shortlist:${call.source}`,
        messages: [],
      });
      const added = [...seen.keys()].filter((id) => !before.has(id));
      for (const id of added) sourcesById.set(id, [call.source]);
      sourceRuns.push({
        ...call,
        status: resultError(result) ? 'error' : 'ok',
        returned: trackCount(result),
        accepted: added.length,
        elapsedMs: Math.round(performance.now() - callStarted),
        ...(resultError(result) ? { error: resultError(result) } : {}),
      });
    } catch (err) {
      sourceRuns.push({
        ...call,
        status: 'error',
        returned: 0,
        accepted: 0,
        elapsedMs: Math.round(performance.now() - callStarted),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const candidates = [...seen.entries()].map(([id, candidate]) => ({
    ...candidate,
    shortlistSources: sourcesById.get(id) || [],
  }));
  return {
    candidates,
    sourceRuns,
    uniqueCandidates: candidates.length,
    elapsedMs: Math.round(performance.now() - started),
  };
}

// Replay entry point. Keeping it separate from executeShortlistPlan makes
// recorded vanilla runs transport-neutral and lets planner changes be measured
// without duplicating source execution semantics.
export async function replayShortlistPlan(scope: PickerScope, plan: ShortlistSourceCall[]): Promise<ShortlistResult> {
  const { tools, seen } = buildPickerTools(scope);
  return executeShortlistPlan(tools as PickerToolSet, seen, plan);
}

// Native entry point: build the same source-owned registry the agent used,
// plan only from sources it actually exposed, then reuse the shared filtered
// accumulator for execution. No LLM calls, choice, or queue writes occur here.
export async function buildShortlist(context: ShortlistPlanningContext): Promise<ShortlistResult> {
  const { tools, seen } = buildPickerTools(context.scope);
  const plan = planShortlistSources(context, new Set(Object.keys(tools)));
  return executeShortlistPlan(tools as PickerToolSet, seen, plan);
}
