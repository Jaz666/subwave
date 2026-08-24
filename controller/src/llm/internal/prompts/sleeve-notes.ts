// Deterministic, listener-safe facts assembled after a track is selected.
// This deliberately knows nothing about Producer reasoning or LLM prompts.

import { trackEraYear } from '../../../music/show-filter.js';

export function sleeveNotesFor(track: any, playCount: number | null = null): string[] {
  const notes: string[] = [];
  const album = String(track?.album || '').trim();
  if (album && album.toLowerCase() !== String(track?.title || '').trim().toLowerCase()) {
    notes.push('Album: ' + album + '.');
  }
  const year = trackEraYear(track);
  if (year != null && Number.isInteger(year) && year >= 1880 && year <= new Date().getFullYear()) {
    notes.push('Release year: ' + year + '.');
  }
  if (Number.isInteger(playCount) && playCount! > 0) {
    notes.push('Station plays before today: ' + playCount + '.');
  }
  return notes;
}

// A link needs a little colour, not a metadata checklist. Keep the complete
// verified set available to future context builders, but give the Persona one
// varied fact per link. The caller supplies no Producer reasoning here.
export function selectSleeveNotes(notes: readonly string[], random: () => number = Math.random): string[] {
  if (notes.length < 2) return [...notes];
  const index = Math.min(notes.length - 1, Math.floor(random() * notes.length));
  return [notes[index]!];
}
