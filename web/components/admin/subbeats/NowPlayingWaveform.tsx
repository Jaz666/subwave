'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import { useStationFeed } from '../../../hooks/useStationFeed';
import { adminJson, adminResponse, useAdminQuery } from '../../../lib/admin-query';
import { useAdminAuth } from '../../../lib/adminAuth';
import { createColorProbe, mix, readThemeRgb, watchTheme } from '../../../lib/theme-rgb';
import styles from './NowPlayingWaveform.module.css';
import { queuedTransition, stemTransitionWindow } from './waveform-timeline';
import { LiveStemPreview } from './LiveStemPreview';
import { stemDetailVisible, stemPairKey, stemPhase, stemStyle, waveformKeys, type StemTransition } from './stem-preview';

const HISTORY_SECONDS = 30;
const PLAYHEAD_START_SECONDS = HISTORY_SECONDS;
const WAVEFORM_HEIGHT = 44;
const DEFAULT_COLORS = { current: '#d94b2a', next: '#d94b2a' };
type TimedMarker = { kind: 'speech' | 'jingle' | 'bed'; airedAt: number; durationMs: number; label: string };
type VisualEvents = {
  preparedSpeech?: boolean;
  jingle?: { airedAt: string; durationMs: number } | null;
  bed?: { airedAt: string; durationMs?: number } | null;
  stemTransition?: StemTransition | null;
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
  const sourceDurations = useRef(new Map<string,number>());
  const [nextDuration, setNextDuration] = useState(0);
  const [bufferedDuration, setBufferedDuration] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [observedTransitions, setObservedTransitions] = useState<TransitionMarker[]>([]);
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [colorPhase, setColorPhase] = useState(false);
  const [historyTracks, setHistoryTracks] = useState<DeckTrack[]>([]);
  const [trimmedHistorySeconds, setTrimmedHistorySeconds] = useState(0);
  const [message, setMessage] = useState('');
  const [expandedPair, setExpandedPair] = useState<string | null>(null);
  const currentId = nowPlaying?.subsonic_id;
  const visualEvents = useAdminQuery<VisualEvents>({
    key: waveformKeys.events(currentId),
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
  const stemWindow = stemTransition ? stemTransitionWindow(stemTransition, transition?.airedAt, leadMs) : null;
  const currentPlaybackSpan = currentStartedAt > 0 && stemTransition?.kind === 'subbeats' && stemTransition.outgoingId === currentId && stemWindow
    ? Math.max(0,(stemWindow.startAt+stemTransition.incomingAtSec*1000-currentStartedAt)/1000) : currentDuration;
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
    sourceDurations.current.set(id,duration);
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
  const totalTimelineSec = trimmedHistorySeconds + historySeconds + currentPlaybackSpan + bufferedDuration + nextDuration;
  const timelineWidth = Math.max(viewportWidth, sidePadding * 2 + (PLAYHEAD_START_SECONDS + totalTimelineSec) * pxPerSec);
  // One list keeps a preloaded WaveSurfer instance mounted as its role changes.
  const deckTracks = [...visibleHistoryTracks];
  if (currentId && hydrated && !needsAuth) deckTracks.push({ id: currentId, duration: currentDuration,
    playedSeconds:currentPlaybackSpan,startedAt: currentStartedAt, colorRole: currentRole });
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
    setCurrentDuration(sourceDurations.current.get(currentId ?? '') ?? nowPlaying?.duration ?? 0);
    setNextDuration(sourceDurations.current.get(next?.subsonic_id ?? '') ?? next?.duration ?? 0);
    setBufferedDuration(sourceDurations.current.get(queuedCurrent?.subsonic_id ?? '') ?? queuedCurrent?.duration ?? 0);
    setMessage('');
  }, [currentId, next?.subsonic_id, needsAuth, nowPlaying?.duration, next?.duration,
    queuedCurrent?.subsonic_id, queuedCurrent?.duration]);



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
      const displayElapsed = motionPreference.matches ? Math.floor(liveElapsed) : liveElapsed;
      const scrollLeft = Math.min(sidePadding + (trimmedHistorySeconds + historySeconds + displayElapsed) * pxPerSec, maxScroll);
      const transform = `translate3d(${-scrollLeft}px, 0, 0)`;
      if (lastTransform !== transform) {
        waveformTimeline.current?.style.setProperty('transform', transform);
        eventTimeline.current?.style.setProperty('transform', transform);
        stemsTimeline.current?.style.setProperty('transform', transform);
        lastTransform = transform;
      }
      playhead.current?.style.setProperty('left', '50%');
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

  const clockMs = currentStartedAt + elapsed * 1000;
  const detailVisible = !!stemTransition && stemDetailVisible(stemTransition,currentId,visibleHistoryTracks,clockMs,HISTORY_SECONDS);
  const pairKey = stemTransition ? stemPairKey(stemTransition) : null;
  const expanded = detailVisible && expandedPair === pairKey;
  const mixPosition = currentStartedAt > 0 && stemWindow ? (clockMs-stemWindow.startAt)/1000 : null;
  const mixActive = mixPosition != null && mixPosition >= 0 && mixPosition < (stemTransition?.durationSec ?? 0);
  const showMix = detailVisible || mixActive;
  const pairTracks = [state.current,...state.history,...state.upcoming];
  const trackLabel = (id: string | undefined) => {
    const track = pairTracks.find(track => track?.subsonic_id === id);
    return track ? [track.title,track.artist].filter(Boolean).join(' — ') : 'Track';
  };
  const outgoingRole = currentId === stemTransition?.incomingId ? nextRole : currentRole;
  const stemColors = outgoingRole === 'accent' ? colors : {current:colors.next,next:colors.current};
  const stemBar = stemWindow && stemTransition && currentStartedAt > 0
    && (currentId === stemTransition.outgoingId || currentId === stemTransition.incomingId)
    ? (() => {
      const duration = stemTransition.durationSec;
      const startAt = stemWindow.startAt;
      const left = timelineOrigin + (trimmedHistorySeconds + historySeconds + (startAt - currentStartedAt) / 1000) * pxPerSec;
      const width = duration * pxPerSec;
      const incomingAt = Math.max(0, Math.min(duration, stemTransition.incomingAtSec));
      const outgoingUntil = Math.max(incomingAt, Math.min(duration, stemTransition.outgoingUntilSec));
      const observed = currentId === stemTransition.incomingId;
      return <div className={styles.stemMarker} role="img"
        aria-label={`${observed ? 'Observed' : 'Planned'} ${stemStyle(stemTransition)} stem transition`}
        title={`${observed ? 'Observed' : 'Planned'} ${stemStyle(stemTransition)} stem transition · ${duration.toFixed(1)} seconds`}
        ref={element => {
          if (!element) return;
          element.style.left = `${left}px`;
          element.style.width = `${width}px`;
          element.style.setProperty('--out-width', `${incomingAt / duration * 100}%`);
          element.style.setProperty('--overlap-width', `${(outgoingUntil - incomingAt) / duration * 100}%`);
          element.style.setProperty('--outgoing-color', stemColors.current);
          element.style.setProperty('--incoming-color', stemColors.next);
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
        <span className={styles.trackTime} aria-label="Listener playback time"
          title="Playback includes the station’s listener buffer. The Queue shows station time.">
          Playback {formatTime(elapsed)}{sourceDurations.current.has(currentId ?? '') && ` · Source ${formatTime(currentDuration)}`}
        </span>
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
        {showMix && stemTransition && <div className={styles.stemDescription} role="status">
          <strong>{stemStyle(stemTransition)}</strong><span>{stemPhase(stemTransition,mixPosition)}</span>
        </div>}
        {detailVisible && stemTransition?.outgoingId && stemTransition.incomingId && <button type="button" className={styles.expandButton}
          aria-expanded={expanded} onClick={() => setExpandedPair(expanded ? null : pairKey)}>{expanded ? 'Collapse' : 'Expand'}</button>}
      </div>
      {expanded && stemTransition && <LiveStemPreview key={pairKey}
        transition={stemTransition} startAt={stemWindow?.startAt ?? null} nowMs={clockMs} adminFetch={adminFetch} colors={stemColors}
        outgoing={trackLabel(stemTransition.outgoingId)} incoming={trackLabel(stemTransition.incomingId)} />}
    </div>
    {message && <p className="text-xs text-muted" role="status">{message}</p>}
  </section>;
}
