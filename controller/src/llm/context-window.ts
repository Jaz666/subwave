// Context measurements retain counts, sums and peaks without retaining prompts.

const SHORTLIST_PICK_KINDS = new Set(['djShortlistPick', 'djShortlistRepick', 'djShortlistLeaningsReview']);
const AGENTIC_PICK_KINDS = new Set(['djAgentPick']);
export const CONTEXT_WINDOW_STEP = 1024;
export const CONTEXT_WINDOW_MIN = 8192;
export const CONTEXT_WINDOW_HEADROOM = 0.25;
export const CONTEXT_WINDOW_RESPONSE_RESERVE = 1024;

function wholePositive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : null;
}

type ContextCall = {
  kind?: unknown;
  ok?: unknown;
  via?: unknown;
  contextPeakInput?: unknown;
  usage?: { input?: unknown; output?: unknown; total?: unknown } | null;
};

function sampledInput(call: ContextCall | null | undefined): number | null {
  if (call?.ok !== true) return null;
  // Agent tool loops log billable usage across their steps. Prefer the
  // separately-recorded largest single request when present, because that is
  // what a server's context window needs to hold. Old agent records without
  // this field are left unsampled rather than using their misleading total.
  const measuredPeak = wholePositive(call.contextPeakInput);
  if (measuredPeak != null) return measuredPeak;
  if (typeof call?.via === 'string' && call.via.startsWith('ai-sdk:agent')) return null;
  return wholePositive(call.usage?.input);
}

type ContextGroup = {
  kind: string;
  calls: number;
  samples: number;
  totalInputTokens: number;
  peakInputTokens: number | null;
};

function contextWindowRecommendation(
  groups: Iterable<ContextGroup>,
  kinds: ReadonlySet<string>,
  waitingMessage: string,
  successMessage: string,
) {
  let samples = 0;
  let peakInputTokens = 0;
  for (const group of groups) {
    if (!kinds.has(group.kind)) continue;
    samples += group.samples;
    peakInputTokens = Math.max(peakInputTokens, group.peakInputTokens ?? 0);
  }

  if (!samples) {
    return {
      samples: 0,
      peakInputTokens: null,
      suggestedTokens: null,
      message: waitingMessage,
    };
  }

  const requiredTokens = peakInputTokens * (1 + CONTEXT_WINDOW_HEADROOM)
    + CONTEXT_WINDOW_RESPONSE_RESERVE;
  return {
    samples,
    peakInputTokens,
    suggestedTokens: Math.max(
      CONTEXT_WINDOW_MIN,
      Math.ceil(requiredTokens / CONTEXT_WINDOW_STEP) * CONTEXT_WINDOW_STEP,
    ),
    headroomPct: CONTEXT_WINDOW_HEADROOM * 100,
    responseReserveTokens: CONTEXT_WINDOW_RESPONSE_RESERVE,
    message: successMessage,
  };
}

export function shortlistContextWindow(calls: ContextCall[]) {
  return measurementsOf(calls).snapshot().shortlist;
}

export function agenticPickerContextWindow(calls: ContextCall[]) {
  return measurementsOf(calls).snapshot().agenticPicker;
}

export function contextWindowByKind(calls: ContextCall[]) {
  return measurementsOf(calls).snapshot().byKind;
}

export class ContextMeasurements {
  private readonly groups = new Map<string, ContextGroup>();

  record(call: ContextCall | null | undefined) {
    const kind = typeof call?.kind === 'string' && call.kind ? call.kind : 'unknown';
    let group = this.groups.get(kind);
    if (!group) {
      group = { kind, calls: 0, samples: 0, totalInputTokens: 0, peakInputTokens: null };
      this.groups.set(kind, group);
    }
    group.calls++;
    const inputTokens = sampledInput(call);
    if (inputTokens != null) {
      group.samples++;
      group.totalInputTokens += inputTokens;
      group.peakInputTokens = Math.max(group.peakInputTokens ?? 0, inputTokens);
    }
  }

  snapshot() {
    return {
      shortlist: this.shortlist(),
      agenticPicker: this.agenticPicker(),
      byKind: [...this.groups.values()].map(group => ({
        kind: group.kind,
        calls: group.calls,
        samples: group.samples,
        averageInputTokens: group.samples ? Math.round(group.totalInputTokens / group.samples) : null,
        peakInputTokens: group.peakInputTokens,
      })).sort((a, b) => b.calls - a.calls || a.kind.localeCompare(b.kind)),
    };
  }

  private shortlist() {
    return contextWindowRecommendation(
      this.groups.values(),
      SHORTLIST_PICK_KINDS,
      'Waiting for successful shortlist picker calls that report input-token usage.',
      'Based on the largest successful final-picker prompt since this controller started.',
    );
  }

  private agenticPicker() {
    return contextWindowRecommendation(
      this.groups.values(),
      AGENTIC_PICK_KINDS,
      'Waiting for successful Agentic Picker calls with per-step input-token usage.',
      'Based on the largest individual model step from a successful Agentic Picker run since this controller started.',
    );
  }
}

function measurementsOf(calls: ContextCall[]): ContextMeasurements {
  const measurements = new ContextMeasurements();
  for (const call of Array.isArray(calls) ? calls : []) measurements.record(call);
  return measurements;
}
