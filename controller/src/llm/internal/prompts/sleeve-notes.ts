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
