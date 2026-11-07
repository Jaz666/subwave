// Owner annotations are preview fixtures only, never picker or broadcast rules.
import references from '../../scripts/subbeats-reference-tracks.json' with { type: 'json' };

export const subbeatsReferences = references.tracks.map(track => ({
  id: track.id, introResolve: track.intro_resolve_seconds,
  introBars: track.intro_lengths_bars, outroStart: track.outro_seconds,
}));
