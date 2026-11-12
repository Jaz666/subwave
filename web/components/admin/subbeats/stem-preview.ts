// Display clocks follow broadcast/subbeats-clock.ts. These are source-detail
// waveforms, not output meters: separation, fades and summing happen elsewhere.
export const STEM_NAMES = ['vocals', 'drums', 'bass', 'other'] as const;
export type StemName = typeof STEM_NAMES[number];
export type StemLanes = Record<StemName, { outgoing: number[]; incoming: number[] }>;
export type StemTransition = {
  kind: 'stem-blend' | 'subbeats'; durationSec: number; incomingAtSec: number;
  incomingAiredAt?: string; outgoingUntilSec: number; outgoingId?: string; incomingId?: string;
  mixStyle?: 'long-blend' | 'short-exchange' | 'bass-swap' | 'drums-first';
  gainsDb?: [number, number]; outgoingGainDb?: number; incomingGainDb?: number;
  timing?: {
    sampleRate: number; outgoingStartSample: number; incomingEntryFrame: number; handoverFrame: number;
    outgoingEndFrame: number; clipFrames: number; incomingRate: number; releaseStartFrame: number;
    releaseEndFrame: number; loop?: { startSample: number; lengthSamples: number; repeats: number };
  };
  sources?: {
    outgoing?: { startSec: number; endSec: number | null; storageGain: number };
    incoming?: { startSec: number; endSec: number | null; storageGain: number };
  };
};

export const MIX_STYLE = {
  'long-blend': {label:'Long blend',description:'A longer musical overlap for compatible keys and spacious arrangements.'},
  'short-exchange': {label:'Short exchange',description:'Exchange bass and melody over four beats. A useful choice when keys may clash.'},
  'bass-swap': {label:'Bass swap',description:'Exchange bass over one beat while melodies blend longer. Try it with compatible keys.'},
  'drums-first': {label:'Drums first',description:'Build incoming drums gradually, then exchange bass and melody over four beats.'},
};

export const waveformKeys = {
  events: (id: string | undefined) => ['now-playing', 'visual-events', id] as const,
  stems: (transition: StemTransition) => ['now-playing', 'stem-detail', transition.outgoingId, transition.incomingId,
    transition.kind, transition.timing, transition.sources, transition.durationSec] as const,
};

export function stemPairKey(transition: StemTransition): string {
  return `${transition.outgoingId}/${transition.incomingId}/${transition.timing?.outgoingStartSample ?? transition.durationSec}`;
}

export function stemStyle(transition: StemTransition): string {
  return transition.kind === 'subbeats' ? MIX_STYLE[transition.mixStyle ?? 'short-exchange'].label : 'Stem Blend';
}

export function stemStages(transition: StemTransition) {
  const timing = transition.timing;
  const stages = [{at:0,label:'Outgoing lead'}, {at:transition.incomingAtSec,label:'Incoming opening enters'}];
  if (timing) {
    const sr = timing.sampleRate;
    if (timing.loop) stages.push({at:transition.incomingAtSec + timing.loop.startSample / sr / timing.incomingRate,
      label:'Incoming drum loop'});
    stages.push({at:timing.handoverFrame / sr, label:transition.mixStyle === 'bass-swap' ? 'Bass handover'
      : ['drums-first','short-exchange'].includes(transition.mixStyle ?? '') ? 'Bass and melody handover' : 'Rhythm handover'});
    stages.push({at:timing.outgoingEndFrame / sr,label:'Incoming track alone'});
    if (timing.incomingRate !== 1) stages.push({at:timing.releaseStartFrame / sr,label:'Returning to original tempo'},
      {at:timing.releaseEndFrame / sr,label:'Original tempo restored'});
  }
  stages.push({at:transition.durationSec,label:'Mix complete'});
  return stages.sort((a,b) => a.at-b.at);
}

export function stemPhase(transition: StemTransition, seconds: number | null): string {
  if (seconds == null) return 'Prepared · waiting for timing';
  if (seconds < 0) return `Prepared · starts in ${Math.ceil(-seconds)}s`;
  return stemStages(transition).reduce((label, stage) => seconds >= stage.at ? stage.label : label, 'Outgoing lead');
}

/** A cached pair may outlive its displayed outgoing recording. */
export function stemDetailVisible(transition: StemTransition, currentId: string | undefined,
  history: readonly {id: string; startedAt: number; playedSeconds?: number; duration: number}[],
  nowMs: number, historySeconds: number): boolean {
  if (transition.outgoingId === currentId) return true;
  if (transition.incomingId !== currentId) return false;
  return history.some(track => track.id === transition.outgoingId
    && track.startedAt + (track.playedSeconds ?? track.duration) * 1000 > nowMs - historySeconds * 1000);
}

/** Source sample corresponding to a position in the rendered clip, loops included. */
export function stemSourceSeconds(transition: StemTransition, side: 'outgoing' | 'incoming', seconds: number, stem: StemName = 'drums'): number | null {
  if (seconds < 0 || seconds >= transition.durationSec) return null;
  if (side === 'outgoing' && seconds >= transition.outgoingUntilSec) return null;
  if (side === 'incoming' && seconds < transition.incomingAtSec) return null;
  const timing = transition.timing;
  const region = transition.sources?.[side];
  if (!timing) {
    const start = side === 'outgoing' ? (region?.endSec ?? transition.durationSec) - transition.durationSec : 0;
    return start + seconds - (side === 'incoming' ? transition.incomingAtSec : 0);
  }
  if (side === 'outgoing') return timing.outgoingStartSample / timing.sampleRate + seconds;
  const frame = (seconds - transition.incomingAtSec) * timing.sampleRate;
  const start = timing.releaseStartFrame - timing.incomingEntryFrame;
  const finish = timing.releaseEndFrame - timing.incomingEntryFrame;
  const ramp = Math.max(0, Math.min(finish-start, frame-start));
  let source = timing.incomingRate * Math.min(frame,start) + timing.incomingRate * ramp
    + (finish > start ? (1-timing.incomingRate) * ramp*ramp / (2*(finish-start)) : 0) + Math.max(0,frame-finish);
  if (timing.loop) {
    const end = timing.loop.startSample+timing.loop.lengthSamples;
    const inserted = timing.loop.lengthSamples*timing.loop.repeats;
    if (source >= end+inserted) source -= inserted;
    else if (source >= end) {
      if (stem !== 'drums') return null;
      source = timing.loop.startSample+(source-end)%timing.loop.lengthSamples;
    }
  }
  return source/timing.sampleRate;
}

export function stemPeaks(buffer: Pick<AudioBuffer,'numberOfChannels'|'getChannelData'|'sampleRate'|'length'>,
  transition: StemTransition, side: 'outgoing' | 'incoming', bins = 240, stem: StemName = 'drums'): number[] {
  const channels = Array.from({length:buffer.numberOfChannels}, (_,i) => buffer.getChannelData(i));
  const region = transition.sources?.[side];
  return Array.from({length:bins}, (_,bin) => {
    let peak = 0;
    // Bound drawing work and sample through loop edges instead of stretching
    // the entire cached region to fit the clip. No audio is retained in cache.
    for (let sample=0;sample<128;sample++) {
      const source = stemSourceSeconds(transition,side,(bin+(sample+.5)/128)/bins*transition.durationSec,stem);
      if (source == null) continue;
      const index = Math.floor((source-(region?.startSec ?? 0))*buffer.sampleRate);
      if (index < 0 || index >= buffer.length) continue;
      for (const channel of channels) peak = Math.max(peak,Math.abs(channel[index] ?? 0)/(region?.storageGain ?? 1));
    }
    return peak;
  });
}
