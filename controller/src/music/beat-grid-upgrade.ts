// Upgrade legacy library beat grids when a stem-capable track enters the
// working queue. The refresh is deliberately narrow: only beat/bar columns and
// their per-window provenance are replaced.
import * as analyzer from './analyzer.js';
import * as db from './library-db.js';
import type { BeatGridProvenance } from '../schemas/beat-grid.js';
import { BoundedKeyMap } from '../util/bounded-key-map.js';

const inFlight = new Map<string, Promise<boolean>>();
const failuresUntil = new BoundedKeyMap<number>({ maxKeys: 2048, isLive: (until, now) => until > now });

function current(provenance: BeatGridProvenance | null | undefined): provenance is BeatGridProvenance {
  return provenance?.backend === 'beat-this-onnx'
    && provenance.model === 'small0'
    && provenance.preprocessingVersion === 1;
}

export function trackGridCurrent(id: string): boolean {
  const row = db.getTrack(id);
  if (!row || !row.beats?.length || !row.bars?.length || !current(row.gridProvenance)) return false;
  return !row.outro?.bars?.length || current(row.outro.gridProvenance);
}

export function upgradeDue(id: string): boolean {
  return inFlight.size === 0 && !trackGridCurrent(id) && (failuresUntil.get(id) ?? 0) <= Date.now();
}

export function ensureCurrent(id: string, log: (message: string) => void): Promise<boolean> {
  if (trackGridCurrent(id)) return Promise.resolve(true);
  const running = inFlight.get(id);
  if (running) return running;
  if ((failuresUntil.get(id) ?? 0) > Date.now()) return Promise.resolve(false);
  const work = (async () => {
    try {
      const before = db.getTrack(id);
      if (!before) throw new Error('track is no longer in the library');
      const sourceSize = db.trackFileSize(id);
      const result = await analyzer.analyzeFacets(id, {
        facets: ['head', 'tail'],
        tailWindow: analyzer.tailWindowFor(before),
      });
      const head = result.facets.head;
      const headGrid = head?.result.gridProvenance;
      if (head?.status !== 'ok' || !current(headGrid)
          || !head.result.beats?.length || !head.result.bars?.length) {
        throw new Error(head?.reason ?? 'shared head beat grid unavailable');
      }
      if (sourceSize != null && headGrid.source?.complete === true && headGrid.source.bytes !== sourceSize) {
        throw new Error('the audio source changed during grid refresh');
      }
      const tail = result.facets.tail;
      const outro = tail?.result.outro;
      const tailGrid = outro?.gridProvenance;
      const tailReady = tail?.status === 'ok' && !!outro?.beats?.length && !!outro.bars?.length && current(tailGrid);
      const wrote = db.writeBeatGridUpgrade(id, {
        beats: head.result.beats, bars: head.result.bars, gridProvenance: headGrid,
      }, tailReady ? {
        beats: outro!.beats!, bars: outro!.bars!, gridProvenance: tailGrid!,
      } : null, sourceSize);
      if (!wrote) throw new Error('track changed during grid refresh');
      const ready = trackGridCurrent(id);
      if (!ready) throw new Error(tail?.reason ?? 'shared tail beat grid unavailable');
      failuresUntil.delete(id);
      log(`Pick-time shared beat grid upgraded: ${before.title ?? id}`);
      return true;
    } catch (error) {
      failuresUntil.set(id, Date.now() + 5 * 60_000);
      log(`Pick-time shared beat grid unavailable for ${id}: ${String(error)}`);
      return false;
    }
  })().finally(() => inFlight.delete(id));
  inFlight.set(id, work);
  return work;
}
