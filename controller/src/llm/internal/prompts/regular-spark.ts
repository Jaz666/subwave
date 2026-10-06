// The Regular setting needs a clear claim at the start of the generated link:
// the intro-runway backstop may keep only the first complete sentence.
import { extendedSleeveNoteHasClearTextSignal } from '../../../sleeve-notes/link-selection.js';

type Spark = { wording: string };
type Track = { artist?: unknown; title?: unknown } | null | undefined;
const UNSPOKEN_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export function regularSparkAppearsFirst(text: string, spark: Spark, track: Track): boolean {
  const spoken = String(text || '').trim();
  if (!spoken) return false;
  const end = /[.!?](?=\s|$)/u.exec(spoken);
  const firstSentence = end ? spoken.slice(0, end.index + 1) : spoken;
  return extendedSleeveNoteHasClearTextSignal(firstSentence, spark.wording, track?.artist, track?.title);
}

/** Last resort after a failed model revision: use only the approved claim and trusted track identity. */
export function regularSparkFallback(spark: Spark, track: Track): string {
  const claim = String(spark.wording || '').replace(/\s+/gu, ' ').trim().replace(/[,;:]\s*$/u, '');
  if (!claim || UNSPOKEN_SCRIPT.test(claim)) return '';
  const sentence = /[.!?]["”']?$/u.test(claim) ? claim : `${claim}.`;
  const artist = typeof track?.artist === 'string' ? track.artist.trim() : '';
  const title = typeof track?.title === 'string' ? track.title.trim() : '';
  if (UNSPOKEN_SCRIPT.test(artist) || UNSPOKEN_SCRIPT.test(title)) return sentence;
  const identity = artist && title
    ? `That's ${artist} with ${title}.`
    : artist ? `That's ${artist}.` : title ? `That's ${title}.` : '';
  return identity ? `${sentence} ${identity}` : sentence;
}
