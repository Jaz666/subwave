import { genreRuns } from '../music/genre-fold.js';

// Relative catalogue rarity, measured with the same hierarchical genre counts
// as selection. No fixed library size or station-specific genre list.
export function discoveryPalette(counts: Record<string, number>, repertoireEstimate = 1, anchorGenres: readonly string[] = []) {
  const all = Object.entries(counts).filter(([name, tracks]) => name.trim() && tracks > 0)
    .map(([name, tracks]) => ({ name, tracks })).sort((a, b) => a.tracks - b.tracks || a.name.localeCompare(b.name));
  // The long tail includes many singleton tags. Its upper quartile retains
  // workable niche styles; the half-maximum cap rejects nearly uniform libraries.
  const ceiling = all.length ? Math.min(all[Math.floor((all.length - 1) * 0.75)].tracks, all.at(-1)!.tracks / 2) : 0;
  const core = all.filter(genre => genre.tracks <= ceiling);
  const viable = core.filter(genre => genre.tracks >= repertoireEstimate);
  // Shared genre terms are a ranking hint, not a claim of musical equivalence.
  // The model still chooses the connection; rarity classification is unchanged.
  const anchors = new Set(anchorGenres.flatMap(genreRuns));
  const affinity = new Map(all.map(genre => [genre.name, genreRuns(genre.name).filter(run => anchors.has(run)).length]));
  const rank = (a: typeof all[number], b: typeof all[number]) => affinity.get(b.name)! - affinity.get(a.name)!
    || (viable.length ? a.tracks - b.tracks : b.tracks - a.tracks) || a.name.localeCompare(b.name);
  const coreChoices = [...(viable.length ? viable : core)].sort(rank).slice(0, 60);
  // Bound neighbours by size BEFORE applying affinity: familiar large genres
  // must not re-enter the prompt simply because they match the host's tastes.
  const neighbours = all.filter(genre => genre.tracks > ceiling).slice(0, 20).sort(rank);
  return {
    ceiling, core,
    choices: core.length ? [...coreChoices, ...neighbours] : [],
  };
}
export function discoveryCoreGenres(genres: string[], counts: Record<string, number>): string[] {
  const core = new Set(discoveryPalette(counts).core.map(genre => genre.name));
  return genres.filter(genre => core.has(genre));
}
export function discoveryPoolProblem(core: string[], coreCount: number, totalCount: number): string | null {
  if (!core.length) return 'Deep Discovery requires an underrepresented genre core; the chosen palette contains only larger genre pools.';
  if (coreCount * 2 < totalCount) return `Deep Discovery core (${core.join(', ')}) covers only ${coreCount} of ${totalCount} eligible tracks. At least half must match the underrepresented core; broader neighbours must not dominate.`;
  return null;
}
