// Deterministic, listener-safe facts assembled after a track is selected.
// This deliberately knows nothing about picker reasoning, tool transcripts, or
// the model prompt: it is a small trusted packet for the main DJ link path.

import { trackEraYear } from '../../../music/show-filter.js';

function text(value: unknown, max = 180): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Facts derived from controller/library state, safe to hand to the DJ as facts. */
export function sleeveNotesFor(track: any, playCount: number | null = null): string[] {
  const notes: string[] = [];
  const album = text(track?.album);
  const title = text(track?.title);
  if (album && album.toLocaleLowerCase() !== title.toLocaleLowerCase()) {
    notes.push(`Album: ${album}.`);
  }
  const year = trackEraYear(track);
  if (year != null && Number.isInteger(year) && year >= 1880 && year <= new Date().getFullYear()) {
    notes.push(`Release year: ${year}.`);
  }
  if (Number.isInteger(playCount) && playCount! > 0) {
    notes.push(`Station plays before today: ${playCount}.`);
  }
  return notes;
}

/**
 * A link needs a little colour, not a metadata checklist. Keep a single
 * supplemental fact varied per link while retaining a deterministic seam for
 * tests. The identity fact is added separately and is never random.
 */
export function selectSleeveNotes(notes: readonly string[], random: () => number = Math.random): string[] {
  if (notes.length < 2) return [...notes];
  const index = Math.min(notes.length - 1, Math.floor(random() * notes.length));
  return [notes[index]!];
}

/**
 * The complete prompt packet. The track identity is always present when it is
 * known; at most one supplemental sleeve note follows it. A malformed/raw
 * track degrades to no packet rather than creating an assertion from guesswork.
 */
export function verifiedFactsForLink(
  track: any,
  playCount: number | null = null,
  random: () => number = Math.random,
): string[] {
  const title = text(track?.title);
  if (!title) return [];
  const artist = text(track?.artist) || 'unknown artist';
  return [
    `Track: "${title}" by ${artist}.`,
    ...selectSleeveNotes(sleeveNotesFor(track, playCount), random),
  ];
}

export function verifiedFactsSection(facts: readonly string[]): string {
  if (!facts.length) return '';
  return `Verified facts:\n${facts.map((fact) => `- ${fact}`).join('\n')}`;
}
