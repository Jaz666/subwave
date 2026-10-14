export interface ResearchRunPolicyInput {
  playbackCriticalBusy: boolean;
  agentWorkActive: boolean;
  djCallsAllowed: boolean;
  pauseWhenEmpty: boolean;
  maintenanceWhenEmpty: boolean;
  listenerCount: number | null;
}

/**
 * Sleeve Notes research is normally subject to the DJ's listener-aware LLM
 * gate. An operator may explicitly permit this non-airing maintenance work
 * while Icecast has confirmed that the station is empty; unknown counts stay
 * on the normal fail-open DJ path and never activate the maintenance exception.
 */
export function researchRunAllowed(input: ResearchRunPolicyInput): boolean {
  if (input.playbackCriticalBusy || input.agentWorkActive) return false;
  if (input.djCallsAllowed) return true;
  return input.pauseWhenEmpty && input.maintenanceWhenEmpty && input.listenerCount === 0;
}
