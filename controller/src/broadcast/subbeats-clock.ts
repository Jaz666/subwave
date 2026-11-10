// Source positions become elapsed playback time through the shared linear-rate
// tempo map. Lyrics and queue forecasts use the same inverse map, including
// inserted drum-only repetitions, without changing any listener client.
import type { subbeatsLiveTimingSchema, subbeatsPlaybackSchema } from '../schemas/subbeats.js';
import type { QueueItem } from './queue/types.js';

export type SubbeatsTiming = ReturnType<typeof subbeatsLiveTimingSchema.parse>;
export type SubbeatsPlayback = ReturnType<typeof subbeatsPlaybackSchema.parse>;

export function subbeatsPlaybackSeconds(timing: SubbeatsTiming, sourceSeconds: number): number {
  const sr = timing.sampleRate;
  let source = sourceSeconds * sr;
  const loop = timing.loop;
  if (loop && source >= loop.startSample + loop.lengthSamples) source += loop.lengthSamples * loop.repeats;
  const start = timing.releaseStartFrame - timing.incomingEntryFrame;
  const finish = timing.releaseEndFrame - timing.incomingEntryFrame;
  const rate = timing.incomingRate;
  if (source <= rate * start) return source / rate / sr;
  const rampFrames = finish - start;
  const rampSource = (rate + 1) * .5 * rampFrames;
  const afterStart = source - rate * start;
  if (!rampFrames || afterStart >= rampSource) return (finish + afterStart - rampSource) / sr;
  const acceleration = (1 - rate) / rampFrames;
  const ramp = 2 * afterStart / (rate + Math.sqrt(rate * rate + 2 * acceleration * afterStart));
  return (start + ramp) / sr;
}

export function subbeatsSourceSeconds(timing: SubbeatsTiming, playbackSeconds: number): number {
  const sr = timing.sampleRate, frame = playbackSeconds*sr;
  const start = timing.releaseStartFrame-timing.incomingEntryFrame;
  const finish = timing.releaseEndFrame-timing.incomingEntryFrame;
  const rampFrames = finish-start;
  const ramp = Math.max(0,Math.min(rampFrames,frame-start));
  let source = timing.incomingRate*Math.min(frame,start) + timing.incomingRate*ramp
    + (rampFrames ? (1-timing.incomingRate)*ramp*ramp/(2*rampFrames) : 0) + Math.max(0,frame-finish);
  const loop = timing.loop;
  if (loop) {
    const end = loop.startSample+loop.lengthSamples, inserted = loop.lengthSamples*loop.repeats;
    if (source >= end+inserted) source -= inserted;
    else if (source >= end) source = loop.startSample+(source-end)%loop.lengthSamples;
  }
  return source/sr;
}

// Recovery can first observe the outgoing lead or the resumed original. Its
// metadata timestamp belongs to that request, not to the logical song entry.
export function subbeatsEntryMs(item: Pick<QueueItem,'stemBlend'|'subbeatsHandoff'|'cueInSec'|'stemCueInSec'>,
  markerMs: number, filename: unknown): number {
  if (item.stemBlend?.subbeats && filename === item.stemBlend.leadPath) {
    const source = item.stemBlend.subbeats.timing.outgoingStartSample/44100;
    return markerMs-(item.subbeatsHandoff ? subbeatsPlaybackSeconds(item.subbeatsHandoff.timing,source)
      : source-(item.cueInSec ?? 0))*1000;
  }
  if (item.subbeatsHandoff && filename !== item.subbeatsHandoff.clipPath) {
    return markerMs-subbeatsPlaybackSeconds(item.subbeatsHandoff.timing,item.cueInSec ?? item.stemCueInSec ?? 0)*1000;
  }
  return markerMs;
}
