'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import { useStationFeed } from '../../../hooks/useStationFeed';
import { adminJson, adminResponse, useAdminQuery } from '../../../lib/admin-query';
import { useAdminAuth } from '../../../lib/adminAuth';
import { createColorProbe, mix, readThemeRgb, watchTheme } from '../../../lib/theme-rgb';
import styles from './NowPlayingWaveform.module.css';
import { queuedTransition, stemTransitionWindow } from './waveform-timeline';

const HISTORY_SECONDS = 30;
const PLAYHEAD_START_SECONDS = 15;
const SNAP_INTERVAL_SECONDS = 30;
const WAVEFORM_HEIGHT = 44;
const DEFAULT_COLORS = { current: '#d94b2a', next: '#d94b2a' };
type TimedMarker = { kind: 'speech' | 'jingle' | 'bed'; airedAt: number; durationMs: number; label: string };
type VisualEvents = {
  preparedSpeech?: boolean;
  jingle?: { airedAt: string; durationMs: number } | null;
  bed?: { airedAt: string; durationMs?: number } | null;
  stemTransition?: {
    kind: 'stem-blend' | 'subbeats';
    durationSec: number;
    incomingAtSec: number;
    incomingAiredAt?: string;
    outgoingUntilSec: number;
    outgoingId?: string;
    incomingId?: string;
    mixStyle?: 'long-blend' | 'short-exchange' | 'bass-swap' | 'drums-first';
    gainsDb?: [number, number];
    outgoingGainDb?: number;
    incomingGainDb?: number;
    timing?: {
      sampleRate: number; outgoingStartSample: number; incomingEntryFrame: number; handoverFrame: number;
      outgoingEndFrame: number; clipFrames: number; incomingRate: number; releaseStartFrame: number;
      releaseEndFrame: number; loop?: { startSample: number; lengthSamples: number; repeats: number };
    };
    sources?: {
      outgoing?: { startSec: number; endSec: number | null; storageGain: number };
      incoming?: { startSec: number; endSec: number | null; storageGain: number };
    };
  } | null;
};
type DeckTrack = { id: string; duration: number; startedAt: number; colorRole: 'accent' | 'accent2'; playedSeconds?: number };
type TransitionMarker = { airedAt: number; label: string };

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function trackSpan(track: DeckTrack): number {
  return track.playedSeconds ?? track.duration;
}

function finishTrack(track: DeckTrack, endedAt: number): DeckTrack {
  const playedSeconds = endedAt > track.startedAt && track.startedAt > 0
    ? Math.min(track.duration, (endedAt - track.startedAt) / 1000)
    : track.duration;
  return { ...track, playedSeconds };
}

function cssRgb([r, g, b]: readonly number[]): string {
  return `rgb(${r} ${g} ${b})`;
}

const STEM_NAMES = ['vocals', 'drums', 'bass', 'other'] as const;
type StemName = typeof STEM_NAMES[number];
type StemLaneData = { outgoing: number[]; incoming: number[] };

function peaksFromBuffer(buffer: AudioBuffer, bins: number, gain: number): number[] {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  return Array.from({ length: bins }, (_, bin) => {
    const start = Math.floor(bin * buffer.length / bins);
    const end = Math.max(start + 1, Math.floor((bin + 1) * buffer.length / bins));
    let square = 0;
    let count = 0;
    for (const channel of channels) {
      for (let sample = start; sample < end; sample += 1) { square += (channel[sample] ?? 0) ** 2; count += 1; }
    }
    return Math.min(1, Math.sqrt(square / Math.max(1, count)) * gain);
  });
}

function envelopePath(values: number[], width: number, height: number): string {
  return values.map((value, index) => `${index ? 'L' : 'M'}${(index / Math.max(1, values.length - 1)) * width},${height - Math.max(0, Math.min(1, value)) * height}`).join(' ');
}

function ExpandedStemLanes({ transition, adminFetch, colors }: {
  transition: NonNullable<VisualEvents['stemTransition']>;
  adminFetch: (path: string, init?: RequestInit) => Promise<Response>;
  colors: { current: string; next: string };
}) {
  const [lanes, setLanes] = useState<Partial<Record<StemName, StemLaneData>>>({});
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [plotWidth, setPlotWidth] = useState(640);
  const plot = useRef<HTMLDivElement>(null);
  const bins = 160;
  const outgoingStorageGain = transition.sources?.outgoing?.storageGain ?? 1;
  const incomingStorageGain = transition.sources?.incoming?.storageGain ?? 1;

  useEffect(() => {
    if (!transition.outgoingId || !transition.incomingId) { setStatus('unavailable'); return; }
    const abort = new AbortController();
    let context: AudioContext | null = null;
    void (async () => {
      try {
        context = new AudioContext();
        const decoded: Array<readonly [StemName, StemLaneData]> = [];
        for (const stem of STEM_NAMES) {
          const pair = await Promise.all((['outgoing', 'incoming'] as const).map(async side => {
            // admin-query-imperative: now-playing-stem-audio
            const response = await adminResponse(adminFetch,
              `/now-playing/stem-audio?side=${side}&stem=${stem}&outgoingId=${encodeURIComponent(transition.outgoingId!)}`, { signal: abort.signal });
            const buffer = await context!.decodeAudioData(await response.arrayBuffer());
            const storageGain = side === 'outgoing' ? outgoingStorageGain : incomingStorageGain;
            return peaksFromBuffer(buffer, bins, storageGain);
          }));
          decoded.push([stem, { outgoing: pair[0]!, incoming: pair[1]! }]);
        }
        if (!abort.signal.aborted) { setLanes(Object.fromEntries(decoded)); setStatus('ready'); }
      } catch {
        if (!abort.signal.aborted) setStatus('unavailable');
      } finally {
        await context?.close();
      }
    })();
    return () => { abort.abort(); void context?.close(); };
  }, [adminFetch, transition.kind, transition.incomingId, transition.outgoingId,
    incomingStorageGain, outgoingStorageGain]);

  useEffect(() => {
    const element = plot.current;
    if (!element) return;
    const resize = () => setPlotWidth(Math.max(320, element.clientWidth));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const duration = Math.max(1, transition.durationSec);
  const incomingAt = Math.max(0, Math.min(duration, transition.incomingAtSec));
  const outgoingUntil = Math.max(incomingAt, Math.min(duration, transition.outgoingUntilSec));
  const arrival = transition.timing
    ? Math.max(incomingAt, Math.min(duration, transition.timing.handoverFrame / transition.timing.sampleRate))
    : (incomingAt + outgoingUntil) / 2;
  const outgoingGain = 10 ** ((transition.gainsDb?.[0] ?? transition.outgoingGainDb ?? 0) / 20);
  const incomingGain = 10 ** ((transition.gainsDb?.[1] ?? transition.incomingGainDb ?? 0) / 20);
  const gainCurves = (stem: StemName) => {
    const outgoing = Array.from({ length: bins }, (_, i) => {
      const t = i / (bins - 1) * duration;
      let value = t <= outgoingUntil ? 1 : Math.max(0, 1 - (t - outgoingUntil) / Math.max(0.03, duration - outgoingUntil));
      if ((stem === 'vocals' || stem === 'other') && t > outgoingUntil - 0.03) value *= Math.max(0, (outgoingUntil - t) / 0.03);
      if (transition.kind === 'subbeats' && ['short-exchange', 'drums-first'].includes(transition.mixStyle ?? '')
        && (stem === 'bass' || stem === 'other')) value *= Math.max(0, 1 - Math.max(0, t - arrival) / Math.max(0.03, duration * 0.08));
      if (transition.kind === 'subbeats' && transition.mixStyle === 'bass-swap' && stem === 'bass')
        value *= Math.max(0, 1 - Math.max(0, t - arrival) / Math.max(0.03, duration * 0.02));
      return value * outgoingGain;
    });
    const incoming = Array.from({ length: bins }, (_, i) => {
      const t = i / (bins - 1) * duration;
      let value = t < incomingAt ? 0 : 1;
      if ((stem === 'drums' || stem === 'bass') && t < arrival) value = Math.max(0, (t - incomingAt) / Math.max(0.03, arrival - incomingAt));
      if (transition.kind === 'subbeats' && ['short-exchange', 'drums-first'].includes(transition.mixStyle ?? '')
        && (stem === 'bass' || stem === 'other')) value = Math.max(value, Math.min(1, Math.max(0, (t - arrival) / Math.max(0.03, duration * 0.08))));
      if (transition.kind === 'subbeats' && transition.mixStyle === 'bass-swap' && stem === 'bass')
        value = Math.max(value, Math.min(1, Math.max(0, (t - arrival) / Math.max(0.03, duration * 0.02))));
      return value * incomingGain;
    });
    return { outgoing, incoming };
  };

  return <div className={styles.expandedLanes}>
    <div className={styles.expandedLegend}>
      <span ref={element => { if (element) element.style.color = colors.current; }}>Outgoing stems</span>
      <span ref={element => { if (element) element.style.color = colors.next; }}>Incoming stems</span>
      <span>Gain · {transition.kind === 'subbeats' ? 'approx.' : 'est.'} (solid / dashed)</span>
      <span className={styles.expandedDuration}>Transition {duration.toFixed(1)}s</span>
    </div>
    {status === 'loading' && <p className={styles.expandedStatus}>Loading transition stems…</p>}
    {status === 'unavailable' && <p className={styles.expandedStatus}>Prepared stem audio is unavailable for this transition.</p>}
    {status === 'ready' && <div ref={plot} className={styles.expandedPlot}>
      {STEM_NAMES.map(stem => {
        const data = lanes[stem];
        if (!data) return null;
        const curves = gainCurves(stem);
        const waveform = (values: number[], color: string, from: number, until: number) => {
          const path = values.map((value, index) => {
            const x = from + index / (values.length - 1) * (until - from);
            const amp = value * 14;
            return `M${x},${14 - amp} L${x},${14 + amp}`;
          }).join(' ');
          return <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".78" />;
        };
        return <div className={styles.stemDetailRow} key={stem}>
          <div className={styles.stemDetailName}>{stem}</div>
          <div className={styles.stemDetailChart}>
            <svg width={plotWidth} height="74" viewBox={`0 0 ${plotWidth} 74`} role="img" aria-label={`${stem} outgoing and incoming waveforms and estimated gain envelopes`}>
              <line x1="0" x2={plotWidth} y1="14" y2="14" className={styles.chartRule} />
              <line x1="0" x2={plotWidth} y1="45" y2="45" className={styles.chartRule} />
              {waveform(data.outgoing, colors.current, 0, outgoingUntil / duration * plotWidth)}
              {waveform(data.incoming, colors.next, incomingAt / duration * plotWidth, plotWidth)}
              <path d={envelopePath(curves.outgoing, plotWidth, 16)} transform="translate(0 29)" fill="none" stroke={colors.current} strokeWidth="2" />
              <path d={envelopePath(curves.incoming, plotWidth, 16)} transform="translate(0 29)" fill="none" stroke={colors.next} strokeWidth="2" strokeDasharray="4 2" />
              <line x1={incomingAt / duration * plotWidth} x2={incomingAt / duration * plotWidth} y1="0" y2="55" className={styles.chartMarker} />
              <line x1={arrival / duration * plotWidth} x2={arrival / duration * plotWidth} y1="0" y2="55" className={styles.chartArrival} />
              <text x="2" y="70" className={styles.chartLabel}>Transition starts</text>
              <text x={incomingAt / duration * plotWidth + 3} y="70" className={styles.chartLabel}>Incoming entry</text>
              <text x={arrival / duration * plotWidth + 3} y="70" className={styles.chartLabel}>Handover</text>
              <text x={plotWidth - 2} y="70" textAnchor="end" className={styles.chartLabel}>Transition ends</text>
            </svg>
          </div>
        </div>;
      })}
    </div>}
  </div>;
}

function DeckSegment({ id, adminFetch, color, pxPerSec, expectedDuration, playedSeconds, onDuration, onError }: {
  id: string;
  adminFetch: (path: string, init?: RequestInit) => Promise<Response>;
  color: string;
  pxPerSec: number;
  expectedDuration: number;
  playedSeconds?: number;
  onDuration: (id: string, seconds: number) => void;
  onError: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const segment = useRef<HTMLDivElement>(null);
  const player = useRef<WaveSurfer | null>(null);
  const [decodedDuration, setDecodedDuration] = useState<number | null>(null);
  const duration = decodedDuration ?? expectedDuration;
  const width = Math.max(1, duration * pxPerSec);
  const visibleWidth = Math.max(1, (playedSeconds ?? duration) * pxPerSec);
  const renderOptions = useRef({ width, pxPerSec, color });

  useLayoutEffect(() => {
    segment.current?.style.setProperty('width', `${visibleWidth}px`);
    host.current?.style.setProperty('width', `${width}px`);
  }, [width, visibleWidth]);

  useLayoutEffect(() => {
    renderOptions.current = { width, pxPerSec, color };
    player.current?.setOptions({ width, minPxPerSec: pxPerSec, waveColor: color, progressColor: color });
  }, [width, pxPerSec, color]);

  useEffect(() => {
    if (!host.current) return;
    const abort = new AbortController();
    let instance: WaveSurfer | null = null;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        // admin-query-imperative: now-playing-waveform-audio
        const response = await adminResponse(adminFetch, `/now-playing/audio?id=${encodeURIComponent(id)}`, { signal: abort.signal });
        const blob = await response.blob();
        if (abort.signal.aborted || !host.current) return;
        objectUrl = URL.createObjectURL(blob);
        const { default: WaveSurfer } = await import('wavesurfer.js');
        if (abort.signal.aborted || !host.current) return;
        const options = renderOptions.current;
        instance = WaveSurfer.create({
          container: host.current,
          height: WAVEFORM_HEIGHT,
          width: options.width,
          minPxPerSec: options.pxPerSec,
          fillParent: false,
          waveColor: options.color,
          progressColor: options.color,
          cursorWidth: 0,
          barWidth: 3,
          barGap: 2,
          barRadius: 2,
          interact: false,
          hideScrollbar: true,
          url: objectUrl,
        });
        player.current = instance;
        instance.on('redrawcomplete', () => {
          // Keep normal canvas sampling; the timeline moves in physical pixels.
          instance?.getWrapper().querySelectorAll('canvas').forEach(canvas => { canvas.style.imageRendering = 'auto'; });
        });
        instance.on('ready', () => {
          const actual = instance?.getDuration() ?? 0;
          if (actual > 0) {
            setDecodedDuration(actual);
            onDuration(id, actual);
          }
        });
      } catch {
        if (!abort.signal.aborted) onError();
      }
    })();
    return () => {
      abort.abort();
      if (player.current === instance) player.current = null;
      instance?.destroy();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [adminFetch, id, onDuration, onError]);

  return <div ref={segment} className={styles.segment} data-track-id={id}><div ref={host} className="h-full" /></div>;
}

export default function NowPlayingWaveform() {
  const { nowPlaying, trackStartedAt, leadMs, session, state } = useStationFeed();
  const { adminFetch, hydrated, needsAuth } = useAdminAuth();
  const viewport = useRef<HTMLDivElement>(null);
  const waveformTimeline = useRef<HTMLDivElement>(null);
  const eventTimeline = useRef<HTMLDivElement>(null);
  const stemsTimeline = useRef<HTMLDivElement>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const leadingPadding = useRef<HTMLDivElement>(null);
  const trailingPadding = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [currentDuration, setCurrentDuration] = useState(nowPlaying?.duration ?? 0);
  const [nextDuration, setNextDuration] = useState(0);
  const [bufferedDuration, setBufferedDuration] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [observedTransitions, setObservedTransitions] = useState<TransitionMarker[]>([]);
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [colorPhase, setColorPhase] = useState(false);
  const [historyTracks, setHistoryTracks] = useState<DeckTrack[]>([]);
  const [trimmedHistorySeconds, setTrimmedHistorySeconds] = useState(0);
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState(false);
  const currentId = nowPlaying?.subsonic_id;
  const visualEvents = useAdminQuery<VisualEvents>({
    key: ['now-playing', 'visual-events', currentId],
    adminFetch,
    enabled: !!currentId && hydrated && !needsAuth,
    staleTime: 0,
    refetchInterval: 5000,
    placeholderData: previous => previous,
    request: (fetcher, signal) => adminJson<VisualEvents>(fetcher,
      `/now-playing/visual-events?id=${encodeURIComponent(currentId!)}`, undefined, signal),
  });
  const events = visualEvents.data;
  const jingle = events?.jingle ?? null;
  const bed = events?.bed ?? null;
  const stemTransition = events?.stemTransition ?? null;
  const preparedSpeech = events?.preparedSpeech === true;
  const next = state.upcoming[0];
  const nextId = next?.subsonic_id && next.subsonic_id !== currentId ? next.subsonic_id : undefined;
  // /state leads this listener by its stream buffer. Keep the live queue's
  // current deck mounted between it leaving upcoming and becoming audible.
  const queuedCurrent = currentId && state.current?.subsonic_id !== currentId ? state.current : null;
  const bufferedId = queuedCurrent?.subsonic_id;
  const currentStartedAt = trackStartedAt ?? 0;
  const transition = queuedTransition(state, currentId, leadMs);
  const previousPlayback = useRef({ currentId, nextId, transition });
  const sidePadding = viewportWidth / 2;
  const pxPerSec = viewportWidth / (HISTORY_SECONDS * 2);
  const timelineOrigin = sidePadding + PLAYHEAD_START_SECONDS * pxPerSec;
  const activeTrack = useRef<DeckTrack | null>(currentId ? {
    id: currentId, duration: currentDuration, startedAt: currentStartedAt, colorRole: colorPhase ? 'accent2' : 'accent',
  } : null);
  const phaseRole = colorPhase ? 'accent2' : 'accent';
  const currentRole = activeTrack.current && activeTrack.current.id !== currentId
    ? (activeTrack.current.colorRole === 'accent' ? 'accent2' : 'accent')
    : phaseRole;
  const nextRole = currentRole === 'accent' ? 'accent2' : 'accent';
  const outgoingTrack = activeTrack.current && activeTrack.current.id !== currentId
    ? finishTrack(activeTrack.current, currentStartedAt)
    : null;
  const visibleHistoryTracks = outgoingTrack
    ? [...historyTracks.filter(track => track.id !== outgoingTrack.id), outgoingTrack]
    : historyTracks;
  const historyRef = useRef(historyTracks);
  const currentIdRef = useRef(currentId);
  const nextIdRef = useRef(nextId);
  const bufferedIdRef = useRef(bufferedId);
  currentIdRef.current = currentId;
  nextIdRef.current = nextId;
  bufferedIdRef.current = bufferedId;

  const updateTrackDuration = useMemo(() => (id: string, duration: number) => {
    if (currentIdRef.current === id) {
      if (activeTrack.current?.id === id) activeTrack.current.duration = duration;
      setCurrentDuration(duration);
    } else if (nextIdRef.current === id) {
      setNextDuration(duration);
    } else if (bufferedIdRef.current === id) {
      setBufferedDuration(duration);
    } else {
      const updated = historyRef.current.map(track => track.id === id ? { ...track, duration } : track);
      historyRef.current = updated;
      setHistoryTracks(updated);
    }
  }, []);

  useEffect(() => {
    const previous = previousPlayback.current;
    if (currentId && previous.currentId && currentId !== previous.currentId
      && previous.nextId === currentId && previous.transition && currentStartedAt > 0) {
      const label = previous.transition.armed ? previous.transition.label : 'Track change';
      setObservedTransitions(markers => [...markers, { airedAt: currentStartedAt, label }]
        .filter(marker => marker.airedAt >= Date.now() - HISTORY_SECONDS * 1000));
    }
    previousPlayback.current = { currentId, nextId, transition };
  }, [currentId, currentStartedAt, nextId, transition]);

  useEffect(() => {
    if (!currentId || activeTrack.current?.id === currentId) return;
    const previous = activeTrack.current ? finishTrack(activeTrack.current, currentStartedAt) : null;
    if (previous) {
      const cutoff = currentStartedAt - HISTORY_SECONDS * 1000;
      const candidates = [...historyRef.current, previous];
      const retained = candidates.filter(track => track.startedAt + trackSpan(track) * 1000 > cutoff);
      const trimmed = candidates.filter(track => track.startedAt + trackSpan(track) * 1000 <= cutoff);
      const trimmedSeconds = trimmed.reduce((total, track) => total + trackSpan(track), 0);
      historyRef.current = retained;
      setHistoryTracks(retained);
      if (trimmedSeconds) setTrimmedHistorySeconds(value => value + trimmedSeconds);
      setColorPhase(value => !value);
    }
    activeTrack.current = {
      id: currentId,
      duration: nowPlaying?.duration ?? 0,
      startedAt: currentStartedAt,
      colorRole: previous ? (previous.colorRole === 'accent' ? 'accent2' : 'accent') : currentRole,
    };
  }, [currentId, currentRole, currentStartedAt, nowPlaying?.duration]);

  useEffect(() => {
    const cutoff = Date.now() - HISTORY_SECONDS * 1000;
    setObservedTransitions(previous => {
      const retained = previous.filter(marker => marker.airedAt > cutoff);
      return retained.length === previous.length ? previous : retained;
    });
    const expired = historyRef.current.filter(track => track.startedAt + trackSpan(track) * 1000 <= cutoff);
    if (!expired.length) return;
    const retained = historyRef.current.filter(track => track.startedAt + trackSpan(track) * 1000 > cutoff);
    historyRef.current = retained;
    setHistoryTracks(retained);
    setTrimmedHistorySeconds(value => value + expired.reduce((total, track) => total + trackSpan(track), 0));
  }, [elapsed]);

  const historySeconds = visibleHistoryTracks.reduce((total, track) => total + trackSpan(track), 0);
  const totalTimelineSec = trimmedHistorySeconds + historySeconds + currentDuration + bufferedDuration + nextDuration;
  const timelineWidth = Math.max(viewportWidth, sidePadding * 2 + (PLAYHEAD_START_SECONDS + totalTimelineSec) * pxPerSec);
  // One list keeps a preloaded WaveSurfer instance mounted as its role changes.
  const deckTracks = [...visibleHistoryTracks];
  if (currentId && hydrated && !needsAuth) deckTracks.push({ id: currentId, duration: currentDuration, startedAt: currentStartedAt, colorRole: currentRole });
  if (bufferedId && bufferedId !== currentId && bufferedId !== nextId && hydrated && !needsAuth)
    deckTracks.push({ id: bufferedId, duration: bufferedDuration, startedAt: 0, colorRole: nextRole });
  if (nextId && hydrated && !needsAuth) deckTracks.push({ id: nextId, duration: nextDuration, startedAt: 0, colorRole: bufferedId ? currentRole : nextRole });

  useLayoutEffect(() => {
    waveformTimeline.current?.style.setProperty('width', `${timelineWidth}px`);
    eventTimeline.current?.style.setProperty('width', `${timelineWidth}px`);
    stemsTimeline.current?.style.setProperty('width', `${timelineWidth}px`);
    leadingPadding.current?.style.setProperty('width', `${timelineOrigin + trimmedHistorySeconds * pxPerSec}px`);
    trailingPadding.current?.style.setProperty('width', `${sidePadding}px`);
  }, [timelineWidth, timelineOrigin, sidePadding, trimmedHistorySeconds, pxPerSec]);

  useEffect(() => {
    const probe = createColorProbe();
    if (!probe) return;
    const update = () => {
      const theme = readThemeRgb(document.documentElement, probe);
      const current = cssRgb(theme.accent);
      const secondary = theme.accent.every((channel, index) => channel === theme.accent2[index])
        ? mix(theme.accent, theme.ink, 0.35)
        : theme.accent2;
      const next = cssRgb(secondary);
      setColors(previous => previous.current === current && previous.next === next ? previous : { current, next });
    };
    update();
    return watchTheme(update);
  }, []);

  useEffect(() => {
    if (!viewport.current) return;
    const element = viewport.current;
    const resize = () => setViewportWidth(element.clientWidth);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setCurrentDuration(nowPlaying?.duration ?? 0);
    setNextDuration(next?.duration ?? 0);
    setBufferedDuration(queuedCurrent?.duration ?? 0);
    setElapsed(0);
    setMessage('');
  }, [currentId, next?.subsonic_id, needsAuth, nowPlaying?.duration, next?.duration,
    queuedCurrent?.subsonic_id, queuedCurrent?.duration]);

  useEffect(() => setExpanded(false), [currentId, nextId]);


  useEffect(() => {
    if (!currentDuration) return;
    const update = () => setElapsed(currentStartedAt ? Math.max(0, (Date.now() - currentStartedAt) / 1000) : 0);
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [currentDuration, currentStartedAt]);

  useEffect(() => {
    const element = viewport.current;
    if (!element || !viewportWidth) return;
    let frame = 0;
    const maxScroll = Math.max(0, timelineWidth - viewportWidth);
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let lastTransform = '';
    const tick = () => {
      const liveElapsed = currentStartedAt ? Math.max(0, (Date.now() - currentStartedAt) / 1000) : 0;
      const snappedSeconds = Math.floor(liveElapsed / SNAP_INTERVAL_SECONDS) * SNAP_INTERVAL_SECONDS;
      const phase = liveElapsed - snappedSeconds;
      const scrollLeft = Math.min(sidePadding + (trimmedHistorySeconds + historySeconds + snappedSeconds) * pxPerSec, maxScroll);
      const transform = `translate3d(${-scrollLeft}px, 0, 0)`;
      if (lastTransform !== transform) {
        waveformTimeline.current?.style.setProperty('transform', transform);
        eventTimeline.current?.style.setProperty('transform', transform);
        stemsTimeline.current?.style.setProperty('transform', transform);
        lastTransform = transform;
      }
      playhead.current?.style.setProperty('left', `${motionPreference.matches ? 25 : 25 + phase / SNAP_INTERVAL_SECONDS * 50}%`);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [currentStartedAt, viewportWidth, timelineWidth, pxPerSec, sidePadding, trimmedHistorySeconds, historySeconds]);

  const markers = useMemo(() => {
    if (!currentStartedAt || !currentDuration) return [];
    const speech: TimedMarker[] = (session.messages || []).flatMap(turn => {
      if (turn.role !== 'segment' || turn.kind === 'jingle') return [];
      const airedAt = typeof turn.meta?.airedAt === 'string' ? Date.parse(turn.meta.airedAt) + leadMs : NaN;
      const durationMs = Number(turn.meta?.durationMs);
      return Number.isFinite(airedAt) && Number.isFinite(durationMs) && durationMs > 0
        ? [{ kind: 'speech', airedAt, durationMs, label: turn.text || 'Speech' }]
        : [];
    });
    const jingles: TimedMarker[] = jingle
      ? [{ kind: 'jingle', airedAt: Date.parse(jingle.airedAt) + leadMs, durationMs: jingle.durationMs, label: 'Jingle' }]
      : [];
    const beds: TimedMarker[] = bed
      ? [{ kind: 'bed', airedAt: Date.parse(bed.airedAt) + leadMs, durationMs: bed.durationMs ?? 0, label: 'Bed' }]
      : [];
    return [...speech, ...jingles, ...beds].filter(marker => Number.isFinite(marker.airedAt) && (marker.kind === 'bed' || marker.durationMs > 0));
  }, [bed, currentDuration, currentStartedAt, jingle, leadMs, session.messages]);

  const eventMarkers = markers.map((marker, index) => {
    const timelineStart = currentStartedAt - (trimmedHistorySeconds + historySeconds) * 1000;
    const timelineEnd = currentStartedAt + (currentDuration + bufferedDuration + nextDuration) * 1000;
    if (marker.airedAt < timelineStart || marker.airedAt > timelineEnd) return null;
    const start = Math.max(timelineStart, marker.airedAt);
    const end = marker.airedAt + marker.durationMs;
    if (marker.kind !== 'bed' && end <= start) return null;
    const left = timelineOrigin + (trimmedHistorySeconds + historySeconds + (start - currentStartedAt) / 1000) * pxPerSec;
    const width = marker.kind === 'bed' && marker.durationMs <= 0
      ? 2
      : Math.max(2, ((end - start) / 1000) * pxPerSec);
    const label = marker.kind === 'speech' ? 'Speech' : marker.kind === 'jingle' ? 'Jingle' : 'Bed';
    return <span key={`${marker.kind}-${marker.airedAt}-${index}`} title={`${label}: ${marker.label}`}
      className={styles.eventMarker} data-event-kind={marker.kind}
      ref={element => {
        if (!element) return;
        element.style.left = `${left}px`;
        element.style.width = `${width}px`;
        element.style.backgroundColor = marker.kind === 'speech' ? colors.current : marker.kind === 'jingle' ? colors.next : 'var(--ink)';
      }} />;
  });

  const stemWindow = stemTransition ? stemTransitionWindow(stemTransition, transition?.airedAt, leadMs) : null;
  const stemBar = stemWindow && stemTransition && currentStartedAt > 0
    && (currentId === stemTransition.outgoingId || currentId === stemTransition.incomingId)
    ? (() => {
      const duration = stemTransition.durationSec;
      const startAt = stemWindow.startAt;
      const left = timelineOrigin + (trimmedHistorySeconds + historySeconds + (startAt - currentStartedAt) / 1000) * pxPerSec;
      const width = duration * pxPerSec;
      const incomingAt = Math.max(0, Math.min(duration, stemTransition.incomingAtSec));
      const outgoingUntil = Math.max(incomingAt, Math.min(duration, stemTransition.outgoingUntilSec));
      return <div className={styles.stemMarker} role="img"
        aria-label={`Estimated ${stemTransition.kind === 'subbeats' ? 'Sub/Beats' : 'Stem Blend'} stem transition`}
        title={`Estimated ${stemTransition.kind === 'subbeats' ? 'Sub/Beats' : 'Stem Blend'} stem transition · ${duration.toFixed(1)} seconds`}
        ref={element => {
          if (!element) return;
          element.style.left = `${left}px`;
          element.style.width = `${width}px`;
          element.style.setProperty('--out-width', `${incomingAt / duration * 100}%`);
          element.style.setProperty('--overlap-width', `${(outgoingUntil - incomingAt) / duration * 100}%`);
          element.style.setProperty('--outgoing-color', colors.current);
          element.style.setProperty('--incoming-color', colors.next);
        }}><span>{stemTransition.kind === 'subbeats' ? 'Sub/Beats' : 'Stem Blend'}</span></div>;
    })()
    : null;

  const onError = useMemo(() => () => setMessage('Could not load one of the current queue recordings.'), []);

  return <section className="space-y-2" aria-label="Station waveform">
    <div aria-label="Speech, jingle and bed timeline">
      <div className={styles.eventLegend}>
        <span ref={element => { if (element) element.style.color = colors.current; }}>Speech</span>
        <span ref={element => { if (element) element.style.color = colors.next; }}>Jingles</span>
        <span className="text-ink">Beds</span>
        {preparedSpeech && <span className={styles.preparedSpeech} title="Prepared speech can still be dropped before it airs." role="status">Speech ready</span>}
        <span className={styles.trackTime} aria-label="Current track time">{formatTime(elapsed)} / {formatTime(currentDuration)}</span>
      </div>
      <div className={styles.eventsViewport} role="img" aria-label="Speech, jingle and bed events">
        <div ref={eventTimeline} className={styles.eventsTimeline}>
          <div className={styles.eventLane}>{eventMarkers}</div>
        </div>
      </div>
    </div>
    <div className={styles.deck}>
      <div ref={viewport} className={styles.viewport} aria-label="Scrolling current and next track waveforms">
        <div ref={waveformTimeline} className={styles.timeline}>
          <div ref={leadingPadding} className="shrink-0" aria-hidden="true" />
          {deckTracks.map(track => <DeckSegment key={track.id} id={track.id} adminFetch={adminFetch}
            color={colors[track.colorRole === 'accent' ? 'current' : 'next']} pxPerSec={pxPerSec}
            expectedDuration={track.duration} playedSeconds={track.playedSeconds} onDuration={updateTrackDuration} onError={onError} />)}
          <div ref={trailingPadding} className="shrink-0" aria-hidden="true" />
          {observedTransitions.map(marker => <div key={marker.airedAt} className={`${styles.transitionMarker} ${styles.observedTransitionMarker}`} role="img"
            aria-label={`Observed incoming entry: ${marker.label}`} title={`Observed incoming entry: ${marker.label}`} data-observed="true"
            ref={element => {
              if (!element) return;
              element.style.left = `${timelineOrigin + (trimmedHistorySeconds + historySeconds + (marker.airedAt - currentStartedAt) / 1000) * pxPerSec}px`;
            }}>
            <span className={styles.transitionLabel}>{marker.label}</span>
          </div>)}
          {transition && currentStartedAt > 0 && <div className={styles.transitionMarker} role="img"
            aria-label={`Estimated incoming entry: ${transition.label}`} title={`Estimated incoming entry: ${transition.label}. Timing may change before it airs.`}
            data-transition-armed={transition.armed}
            ref={element => {
              if (!element) return;
              element.style.left = `${timelineOrigin + (trimmedHistorySeconds + historySeconds + (transition.airedAt - currentStartedAt) / 1000) * pxPerSec}px`;
            }}>
            <span className={styles.transitionLabel}>{transition.label} · est.</span>
          </div>}
        </div>
      </div>
      <div ref={playhead} className={styles.playhead} aria-hidden="true" />
    </div>
    <div aria-label="Stem transition timeline">
      <div className={styles.eventsViewport} role="img" aria-label="Stem transition">
        <div ref={stemsTimeline} className={styles.eventsTimeline}>
          <div className={`${styles.eventLane} ${styles.stemLane}`}>{stemBar}</div>
        </div>
      </div>
      <div className={styles.stemFooter}>
        <div className={styles.laneLabel}>Stems</div>
        {stemTransition?.outgoingId && stemTransition.incomingId && <button type="button" className={styles.expandButton}
          aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Collapse' : 'Expand'}</button>}
      </div>
      {expanded && stemTransition && <ExpandedStemLanes key={`${stemTransition.outgoingId}-${stemTransition.incomingId}`}
        transition={stemTransition} adminFetch={adminFetch} colors={colors} />}
    </div>
    {message && <p className="text-xs text-muted" role="status">{message}</p>}
  </section>;
}
