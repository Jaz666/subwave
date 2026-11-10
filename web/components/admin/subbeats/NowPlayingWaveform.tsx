'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import { useStationFeed } from '../../../hooks/useStationFeed';
import { adminResponse } from '../../../lib/admin-query';
import { useAdminAuth } from '../../../lib/adminAuth';
import { createColorProbe, readThemeRgb, watchTheme } from '../../../lib/theme-rgb';

const HISTORY_SECONDS = 30;
const DEFAULT_COLORS = { current: '#d94b2a', next: '#d94b2a' };
type TimedMarker = { kind: 'speech' | 'jingle'; airedAt: number; durationMs: number; label: string };
type JingleMarker = { airedAt: string; durationMs: number };
type DeckTrack = { id: string; duration: number; startedAt: number; colorRole: 'accent' | 'accent2' };

function cssRgb([r, g, b]: readonly number[]): string {
  return `rgb(${r} ${g} ${b})`;
}

function clock(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function DeckSegment({ id, adminFetch, color, pxPerSec, expectedDuration, onDuration, onReady, onError }: {
  id: string;
  adminFetch: (path: string, init?: RequestInit) => Promise<Response>;
  color: string;
  pxPerSec: number;
  expectedDuration: number;
  onDuration: (id: string, seconds: number) => void;
  onReady: () => void;
  onError: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<WaveSurfer | null>(null);
  const [duration, setDuration] = useState(expectedDuration);
  const width = Math.max(160, duration * pxPerSec);

  useEffect(() => {
    setDuration(expectedDuration);
  }, [expectedDuration, id]);

  useEffect(() => {
    if (!host.current) return;
    const abort = new AbortController();
    let instance: WaveSurfer | null = null;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const response = await adminResponse(adminFetch, `/now-playing/audio?id=${encodeURIComponent(id)}`, { signal: abort.signal });
        const blob = await response.blob();
        if (abort.signal.aborted || !host.current) return;
        objectUrl = URL.createObjectURL(blob);
        const { default: WaveSurfer } = await import('wavesurfer.js');
        if (abort.signal.aborted || !host.current) return;
        instance = WaveSurfer.create({
          container: host.current,
          height: 88,
          width,
          minPxPerSec: pxPerSec,
          fillParent: false,
          waveColor: color,
          progressColor: color,
          cursorWidth: 0,
          barWidth: 3,
          barGap: 2,
          barRadius: 2,
          interact: false,
          hideScrollbar: true,
          url: objectUrl,
        });
        player.current = instance;
        instance.on('ready', () => {
          const actual = instance?.getDuration() ?? 0;
          if (actual > 0) {
            setDuration(actual);
            onDuration(id, actual);
          }
          onReady();
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
  // A change in the available width is applied below without fetching audio again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminFetch, id, onDuration, onError, onReady]);

  useEffect(() => { player.current?.setOptions({ width, minPxPerSec: pxPerSec }); }, [width, pxPerSec]);
  useEffect(() => { player.current?.setOptions({ waveColor: color, progressColor: color }); }, [color]);

  return <div className="h-[5.5rem] shrink-0 overflow-hidden" style={{ width }}><div ref={host} className="h-full" /></div>;
}

export default function NowPlayingWaveform() {
  const { nowPlaying, trackStartedAt, leadMs, session, state } = useStationFeed();
  const { adminFetch, hydrated, needsAuth } = useAdminAuth();
  const viewport = useRef<HTMLDivElement>(null);
  const markerViewport = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [currentDuration, setCurrentDuration] = useState(nowPlaying?.duration ?? 0);
  const [nextDuration, setNextDuration] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [jingle, setJingle] = useState<JingleMarker | null>(null);
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [colorPhase, setColorPhase] = useState(false);
  const [historyTracks, setHistoryTracks] = useState<DeckTrack[]>([]);
  const [trimmedHistorySeconds, setTrimmedHistorySeconds] = useState(0);
  const [message, setMessage] = useState('Waiting for a library track…');
  const currentId = nowPlaying?.subsonic_id;
  const next = state.upcoming[0];
  const nextId = next?.subsonic_id && next.subsonic_id !== currentId ? next.subsonic_id : undefined;
  const currentStartedAt = trackStartedAt ?? 0;
  const sidePadding = viewportWidth / 2;
  const pxPerSec = viewportWidth / (HISTORY_SECONDS * 2);
  const currentRole = colorPhase ? 'accent2' : 'accent';
  const nextRole = colorPhase ? 'accent' : 'accent2';
  const currentColor = colors[currentRole === 'accent' ? 'current' : 'next'];
  const nextColor = colors[nextRole === 'accent' ? 'current' : 'next'];
  const activeTrack = useRef<DeckTrack | null>(currentId ? {
    id: currentId, duration: currentDuration, startedAt: currentStartedAt, colorRole: currentRole,
  } : null);
  const historyRef = useRef(historyTracks);
  const currentIdRef = useRef(currentId);
  const nextIdRef = useRef(nextId);
  currentIdRef.current = currentId;
  nextIdRef.current = nextId;

  const updateTrackDuration = useMemo(() => (id: string, duration: number) => {
    if (currentIdRef.current === id) {
      if (activeTrack.current?.id === id) activeTrack.current.duration = duration;
      setCurrentDuration(duration);
    } else if (nextIdRef.current === id) {
      setNextDuration(duration);
    } else {
      const updated = historyRef.current.map(track => track.id === id ? { ...track, duration } : track);
      historyRef.current = updated;
      setHistoryTracks(updated);
    }
  }, []);

  useEffect(() => {
    if (!currentId || activeTrack.current?.id === currentId) return;
    const previous = activeTrack.current;
    if (previous) {
      const cutoff = currentStartedAt - HISTORY_SECONDS * 1000;
      const candidates = [...historyRef.current, previous];
      const retained = candidates.filter(track => track.startedAt + track.duration * 1000 > cutoff);
      const trimmed = candidates.filter(track => track.startedAt + track.duration * 1000 <= cutoff);
      const trimmedSeconds = trimmed.reduce((total, track) => total + track.duration, 0);
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
    const expired = historyRef.current.filter(track => track.startedAt + track.duration * 1000 <= cutoff);
    if (!expired.length) return;
    const retained = historyRef.current.filter(track => track.startedAt + track.duration * 1000 > cutoff);
    historyRef.current = retained;
    setHistoryTracks(retained);
    setTrimmedHistorySeconds(value => value + expired.reduce((total, track) => total + track.duration, 0));
  }, [elapsed]);

  const historySeconds = historyTracks.reduce((total, track) => total + track.duration, 0);
  const totalTimelineSec = trimmedHistorySeconds + historySeconds + currentDuration + nextDuration;

  useEffect(() => {
    const probe = createColorProbe();
    if (!probe) return;
    const update = () => {
      const theme = readThemeRgb(document.documentElement, probe);
      setColors({ current: cssRgb(theme.accent), next: cssRgb(theme.accent2) });
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
    setElapsed(0);
    setJingle(null);
    setMessage(!currentId ? 'No library track is on air.' : needsAuth ? 'Sign in to load the on-air waveform.' : 'Loading the on-air deck…');
  }, [currentId, next?.subsonic_id, needsAuth, nowPlaying?.duration, next?.duration]);

  useEffect(() => {
    if (!currentId || !hydrated || needsAuth) return;
    let stopped = false;
    const abort = new AbortController();
    const poll = async () => {
      try {
        const response = await adminResponse(adminFetch, `/now-playing/visual-events?id=${encodeURIComponent(currentId)}`, { signal: abort.signal });
        const data = await response.json() as { jingle?: JingleMarker | null };
        if (!stopped) setJingle(data.jingle ?? null);
      } catch {
        if (!stopped) setJingle(null);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => { stopped = true; abort.abort(); window.clearInterval(timer); };
  }, [adminFetch, currentId, hydrated, needsAuth]);

  useEffect(() => {
    if (!currentDuration) return;
    const update = () => setElapsed(currentStartedAt ? Math.max(0, (Date.now() - currentStartedAt) / 1000) : 0);
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [currentDuration, currentStartedAt]);

  useEffect(() => {
    const element = viewport.current;
    if (!element || !viewportWidth) return;
    const scrollLeft = Math.max(0, Math.min((trimmedHistorySeconds + historySeconds + elapsed) * pxPerSec, element.scrollWidth - element.clientWidth));
    element.scrollLeft = scrollLeft;
    if (markerViewport.current) markerViewport.current.scrollLeft = scrollLeft;
  }, [elapsed, viewportWidth, currentDuration, nextDuration, pxPerSec, trimmedHistorySeconds, historySeconds]);

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
    return [...speech, ...jingles];
  }, [currentDuration, currentStartedAt, jingle, leadMs, session.messages]);

  const markerRows = (kind: TimedMarker['kind']) => markers.filter(marker => marker.kind === kind).map((marker, index) => {
    const start = Math.max(currentStartedAt, marker.airedAt);
    const end = Math.min(currentStartedAt + currentDuration * 1000, marker.airedAt + marker.durationMs);
    if (end <= start) return null;
    const left = sidePadding + (trimmedHistorySeconds + historySeconds + (start - currentStartedAt) / 1000) * pxPerSec;
    const width = Math.max(2, ((end - start) / 1000) * pxPerSec);
    return <span key={`${marker.airedAt}-${index}`} title={marker.label}
      className={`absolute inset-y-0 rounded-sm ${kind === 'speech' ? 'bg-[var(--accent)]' : 'bg-[var(--accent-2)]'}`}
      style={{ left, width }} />;
  });

  const timelineWidth = Math.max(viewportWidth, sidePadding * 2 + totalTimelineSec * pxPerSec);
  const onError = useMemo(() => () => setMessage('Could not load one of the current queue recordings.'), []);
  const onReady = useMemo(() => () => setMessage('Live deck follows station playback.'), []);

  return <section className="space-y-3 border border-ink/30 p-4" aria-label="Currently playing waveform">
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-[10px] font-bold tracking-[0.2em] text-muted uppercase">On air</span>
      <h2 className="min-w-0 text-sm font-semibold break-words">{nowPlaying?.title ?? 'Nothing playing'}</h2>
      {nowPlaying?.artist && <span className="text-sm text-muted">— {nowPlaying.artist}</span>}
      <span className="ml-auto text-xs text-muted tabular-nums">{clock(elapsed)}{currentDuration ? ` / ${clock(currentDuration)}` : ''}</span>
    </div>
      <div ref={viewport} className="relative overflow-hidden" aria-label="Scrolling current and next track waveforms">
      <div className="flex h-[5.5rem] items-center" style={{ width: timelineWidth }}>
        <div className="shrink-0" aria-hidden="true" style={{ width: sidePadding }} />
        <div className="shrink-0" aria-hidden="true" style={{ width: trimmedHistorySeconds * pxPerSec }} />
        {historyTracks.map(track => <DeckSegment key={track.id} id={track.id} adminFetch={adminFetch}
          color={colors[track.colorRole === 'accent' ? 'current' : 'next']} pxPerSec={pxPerSec}
          expectedDuration={track.duration} onDuration={updateTrackDuration} onReady={onReady} onError={onError} />)}
        {currentId && hydrated && !needsAuth && <DeckSegment key={currentId} id={currentId} adminFetch={adminFetch}
          color={currentColor} pxPerSec={pxPerSec} expectedDuration={currentDuration} onDuration={updateTrackDuration} onReady={onReady} onError={onError} />}
        {nextId && hydrated && !needsAuth && <DeckSegment key={nextId} id={nextId} adminFetch={adminFetch}
          color={nextColor} pxPerSec={pxPerSec} expectedDuration={nextDuration} onDuration={updateTrackDuration} onReady={onReady} onError={onError} />}
        <div className="shrink-0" aria-hidden="true" style={{ width: sidePadding }} />
      </div>
      <span className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-[3px] -translate-x-1/2 bg-ink shadow-[0_0_0_1px_var(--bg)]" aria-hidden="true" />
    </div>
    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2" aria-label="Speech and jingle timeline">
      <div className="space-y-1 text-[10px] text-muted"><div>Speech</div><div>Jingles</div></div>
      <div ref={markerViewport} className="overflow-hidden" role="img" aria-label="Speech and jingle markers">
        <div className="space-y-1" style={{ width: timelineWidth }}>
          {(['speech', 'jingle'] as const).map(kind => <div key={kind} className="relative h-2 rounded-sm bg-ink/10">
            {markerRows(kind)}
          </div>)}
        </div>
      </div>
    </div>
    <p className="text-xs text-muted" role="status">{message}</p>
    {nextId && <p className="text-[10px] text-muted"><span className="text-[var(--accent-2)]">●</span> Next: {next?.title}{next?.artist ? ` — ${next.artist}` : ''}</p>}
  </section>;
}
