// Broad discovery hints, not proof of a driving beat or a usable transition.
// Read the ingested multi-value genres; never infer eligibility from an artist,
// a track title or beat data alone. Search remains an explicit manual override.
import { genreRuns, normGenre } from './genre-fold.js';

const DANCE_GENRES = new Set([
  'dance', 'electronic', 'electronica', 'edm', 'house', 'techno', 'trance',
  'disco', 'eurodance', 'electro house', 'electroclash', 'electro swing', 'electro funk',
  'breakbeat', 'breakbeats', 'breaks', 'big beat',
  'uk garage', 'speed garage', 'future garage', 'garage house', 'bassline',
  '2 step', '2step', 'dubstep', 'drum and bass', 'drum & bass',
  'drum n bass', 'dnb', 'd&b', 'jungle', 'liquid funk', 'neurofunk',
  'hardstyle', 'hard dance', 'hardcore techno', 'happy hardcore', 'gabber',
  'uk hardcore', 'hardcore dance', 'rave', 'acid house', 'acid techno', 'acid trance',
  'nu disco', 'nudisco',
  'dancehall', 'moombahton', 'baile funk', 'jersey club', 'footwork', 'juke',
].map(normGenre));

export function subbeatsDanceGenresFromJson(value: unknown): number {
  if (typeof value !== 'string') return 0;
  try {
    const genres: unknown = JSON.parse(value);
    return Number(Array.isArray(genres) && genres.some(genre => typeof genre === 'string'
      && (['garage', 'electro', 'acid'].includes(normGenre(genre))
        || genreRuns(genre).some(run => DANCE_GENRES.has(run)))));
  } catch { return 0; }
}
