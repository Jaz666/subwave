// Display clocks follow broadcast/subbeats-clock.ts. These are source-detail
// waveforms with predicted faders, not live output meters. Summing and limiting
// still happen in the renderer/mixer, not in this display.
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

/** Predict the renderer's stem faders, then apply the saved station gains. */
export function stemVolumes(transition: StemTransition, stem: StemName, seconds: number) {
  const clamp = (value: number) => Math.max(0,Math.min(1,value));
  let outgoing = 0, incoming = 0;
  if (seconds >= 0 && seconds < transition.durationSec) {
    const timing = transition.timing;
    if (timing) {
      const sr = timing.sampleRate;
      const arrival = timing.handoverFrame/sr;
      // The handoff has an eight-beat release, or (at native tempo) a final
      // four-beat bar. Saved cues are 60–190 BPM, so its one-second minimum
      // never clips that native bar. This recovers the renderer's beat period
      // to sample-rounding precision without inventing a generic crossfade.
      const release = timing.releaseEndFrame-timing.releaseStartFrame;
      const period = release > 0 ? release/sr/8 : (timing.clipFrames-timing.releaseEndFrame)/sr/4;
      let rhythmStart = Math.max(transition.incomingAtSec,arrival-(transition.mixStyle === 'drums-first' ? 32 : 4)*period);
      if (timing.loop) rhythmStart = Math.min(rhythmStart,
        transition.incomingAtSec+timing.loop.startSample/sr/timing.incomingRate);
      const rhythm = clamp((seconds-rhythmStart)/Math.max(1/sr,arrival-rhythmStart));
      const exchangeHalf = (transition.mixStyle === 'bass-swap' ? .5 : 2)*period;
      const exchange = clamp((seconds-arrival+exchangeHalf)/Math.max(1/sr,exchangeHalf*2));
      outgoing = seconds < transition.outgoingUntilSec ? 1 : 0;
      if (stem === 'vocals' || stem === 'other') outgoing *= clamp((transition.outgoingUntilSec-seconds)/.03);
      incoming = seconds < transition.incomingAtSec ? 0 : stem === 'drums' || stem === 'bass' ? rhythm : 1;
      if ((['short-exchange','drums-first'].includes(transition.mixStyle ?? '') && (stem === 'bass' || stem === 'other'))
        || (transition.mixStyle === 'bass-swap' && stem === 'bass')) {
        outgoing *= 1-exchange;
        incoming = seconds < transition.incomingAtSec ? 0 : exchange;
      }
    } else {
      // Regular Stem Blend carries outgoing DRUMS under incoming bass/melody/
      // vocals, then drops in incoming drums. Its internal bar timing is not
      // published, so retain an explicitly estimated drum handover only.
      const drop = transition.incomingAtSec;
      outgoing = stem === 'drums' ? clamp((drop-seconds)/Math.max(.03,drop/4)) : 0;
      incoming = stem === 'drums' ? Number(seconds >= drop) : 1;
      outgoing *= 10 ** (-3/20); // borrowed groove sits below the incoming track
    }
  }
  return {
    outgoing:outgoing*10**((transition.gainsDb?.[0] ?? transition.outgoingGainDb ?? 0)/20),
    incoming:incoming*10**((transition.gainsDb?.[1] ?? transition.incomingGainDb ?? 0)/20),
  };
}

/** Keep an active mix through its native-tempo return, then expire its history. */
export function stemDetailVisible(transition: StemTransition, currentId: string | undefined,
  history: readonly {id: string; startedAt: number; playedSeconds?: number; duration: number}[],
  nowMs: number, historySeconds: number, window?: {startAt: number; endAt: number} | null): boolean {
  if (transition.outgoingId === currentId) return true;
  if (transition.incomingId !== currentId) return false;
  if (window && nowMs >= window.startAt && nowMs < window.endAt) return true;
  return history.some(track => track.id === transition.outgoingId
    && track.startedAt + (track.playedSeconds ?? track.duration) * 1000 > nowMs - historySeconds * 1000);
}

/** Source sample corresponding to a position in the rendered clip, loops included. */
export function stemSourceSeconds(transition: StemTransition, side: 'outgoing' | 'incoming', seconds: number, stem: StemName = 'drums'): number | null {
  if (seconds < 0 || seconds >= transition.durationSec) return null;
  if (side === 'outgoing' && seconds >= transition.outgoingUntilSec) return null;
  if (side === 'incoming' && transition.timing && seconds < transition.incomingAtSec) return null;
  const timing = transition.timing;
  const region = transition.sources?.[side];
  if (!timing) {
    const start = side === 'outgoing' ? (region?.endSec ?? transition.durationSec) - transition.durationSec : 0;
    return start + seconds;
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
