// Shared source availability policy. Soft show moods count as pinned too;
// strict locks are only one way an operator can own the mood direction.
export function allowsMoodWildcardDiscovery(scope: {
  hasPinnedMoods?: boolean;
  moodLock?: readonly unknown[] | null;
  episodeSource?: unknown;
  audioWaypoint?: readonly unknown[] | null;
  playlistLock?: unknown;
}): boolean {
  return !scope.hasPinnedMoods && !scope.moodLock?.length
    && !scope.episodeSource && !scope.audioWaypoint?.length && !scope.playlistLock;
}
