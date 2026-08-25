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

// Extra facts are always derived from the controller context, never model knowledge.
export function contextSleeveNotesFor(track: any, context: any, playCount: number | null = null): string[] {
  const notes = sleeveNotesFor(track, playCount);
  const season = String(context?.date?.season || "").trim();
  if (season) notes.push("Season: " + season + ".");
  const weather = context?.weather;
  const condition = String(weather?.condition || "").trim();
  if (condition && condition !== "unknown") {
    const place = String(weather?.location || "").trim();
    notes.push("Weather" + (place ? " in " + place : "") + ": " + condition + ".");
  }
  const show = context?.activeShow;
  if (show?.topic) notes.push("Show theme: " + String(show.topic).trim());
  if (show?.episodeAngle) notes.push("Episode angle: " + String(show.episodeAngle).trim());
  const festival = String(context?.festival?.name || "").trim();
  if (festival) notes.push("Festival: " + festival + ".");
  return notes;
}

// A link needs a little colour, not a metadata checklist. Keep the complete
// verified set available to future context builders, but give the Persona one
// one or two varied facts per line. The caller supplies no Producer reasoning here.
export function selectSleeveNotes(notes: readonly string[], random: () => number = Math.random): string[] {
  if (notes.length < 2) return [...notes];
  const count = random() < 0.5 ? 1 : 2;
  const remaining = [...notes];
  const selected: string[] = [];
  while (selected.length < count && remaining.length) {
    const index = Math.min(remaining.length - 1, Math.floor(random() * remaining.length));
    selected.push(remaining.splice(index, 1)[0]!);
  }
  return selected;
}
