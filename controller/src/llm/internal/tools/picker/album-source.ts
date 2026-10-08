import * as subsonic from '../../../../music/subsonic.js';
import { shuffle } from '../../../../util/shuffle.js';

// Sample across twelve albums, including later track positions. Cache this
// wide pool, then let collect() draw fresh eligible tracks on every invocation.
export async function albumSourcePool(albums: Array<{ id: string }>): Promise<any[]> {
  const out: any[] = [];
  for (const album of shuffle(albums).slice(0, 12)) {
    try { out.push(...shuffle(await subsonic.getAlbum(album.id)).slice(0, 3)); } catch { /* Other albums can still contribute. */ }
  }
  return out;
}
