'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import { useStationFeed } from '../../../hooks/useStationFeed';
import { adminResponse } from '../../../lib/admin-query';
import { useAdminAuth } from '../../../lib/adminAuth';
import { watchTheme } from '../../../lib/theme-rgb';

type VisualStyle = 'waveform' | 'bars' | 'stereo';
type JingleMarker = { airedAt: string; durationMs: number };
type TimedMarker = { kind: 'speech' | 'jingle'; airedAt: number; durationMs: number; label: string };

function clock(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function visualOptions(style: VisualStyle) {
  return {
    waveColor: 'var(--accent)',
    progressColor: 'var(--accent-2)',
    cursorColor: 'var(--ink)',
    barWidth: style === 'bars' ? 3 : undefined,
    barGap: style === 'bars' ? 2 : undefined,
    barRadius: style === 'bars' ? 2 : undefined,
    splitChannels: style === 'stereo'
      ? [
        { waveColor: 'var(--accent)', progressColor: 'var(--accent-2)' },
        { waveColor: 'var(--accent-2)', progressColor: 'var(--accent)' },
      ]
      : [],
  };
}

function markerStyle(marker: TimedMarker, startedAt: number, durationMs: number) {
  const start = Math.max(startedAt, marker.airedAt);
  const end = Math.min(startedAt + durationMs, marker.airedAt + marker.durationMs);
  if (end <= start) return null;
  return {
    left: `${((start - startedAt) / durationMs) * 100}%`,
    width: `${((end - start) / durationMs) * 100}%`,
  };
}

export default function NowPlayingWaveform() {
  const { nowPlaying, trackStartedAt, leadMs, session } = useStationFeed();
  const { adminFetch, hydrated, needsAuth } = useAdminAuth();
  const host = useRef<HTMLDivElement>(null);
  const waveform = useRef<WaveSurfer | null>(null);
  const styleRef = useRef<VisualStyle>('waveform');
  const [style, setStyle] = useState<VisualStyle>('waveform');
  const [duration, setDuration] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [jingle, setJingle] = useState<JingleMarker | null>(null);
  const [message, setMessage] = useState('Waiting for a library track…');
  const id = nowPlaying?.subsonic_id;
  const trackStartedAtMs = trackStartedAt ?? 0;
  const durationMs = duration * 1000;

  useEffect(() => { styleRef.current = style; }, [style]);

  useEffect(() => {
    setDuration(0);
    setElapsed(0);
    setJingle(null);
    setMessage(!id ? 'No library track is on air.' : needsAuth ? 'Sign in to load the on-air waveform.' : 'Loading the on-air recording…');
    if (!id || !hydrated || needsAuth || !host.current) return;

    const abort = new AbortController();
    let player: WaveSurfer | null = null;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const response = await adminResponse(adminFetch, `/now-playing/audio?id=${encodeURIComponent(id)}`, { signal: abort.signal });
        const blob = await response.blob();
        if (abort.signal.aborted || !host.current) return;
        objectUrl = URL.createObjectURL(blob);
        const { default: WaveSurfer } = await import('wavesurfer.js');
        if (abort.signal.aborted || !host.current) return;
        player = WaveSurfer.create({
          container: host.current,
          height: 88,
          ...visualOptions(styleRef.current),
          cursorWidth: 2,
          interact: false,
          hideScrollbar: true,
          url: objectUrl,
        });
        waveform.current = player;
        player.on('ready', () => {
          setDuration(player?.getDuration() ?? 0);
          setMessage('Waveform follows station playback.');
        });
      } catch {
        if (!abort.signal.aborted) setMessage('Could not load the on-air recording.');
      }
    })();

    return () => {
      abort.abort();
      if (waveform.current === player) waveform.current = null;
      player?.destroy();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [adminFetch, hydrated, id, needsAuth]);

  useEffect(() => {
    const updateStyle = () => waveform.current?.setOptions(visualOptions(style));
    updateStyle();
    const unwatch = watchTheme(updateStyle);
    return unwatch;
  }, [style]);

  useEffect(() => {
    if (!duration) return;
    const update = () => {
      const seconds = trackStartedAt == null ? 0 : Math.max(0, (Date.now() - trackStartedAt) / 1000);
      const position = Math.min(seconds, duration);
      setElapsed(position);
      waveform.current?.setTime(position);
    };
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [duration, trackStartedAt]);

  useEffect(() => {
    if (!id || !hydrated || needsAuth) return;
    let stopped = false;
    const abort = new AbortController();
    const poll = async () => {
      try {
        const response = await adminResponse(adminFetch, `/now-playing/visual-events?id=${encodeURIComponent(id)}`, { signal: abort.signal });
        const data = await response.json() as { jingle?: JingleMarker | null };
        if (!stopped) setJingle(data.jingle ?? null);
      } catch {
        if (!stopped) setJingle(null);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => { stopped = true; abort.abort(); window.clearInterval(timer); };
  }, [adminFetch, hydrated, id, needsAuth]);

  const markers = useMemo(() => {
    if (!trackStartedAtMs || !durationMs) return [];
    const speech: TimedMarker[] = (session.messages || []).flatMap(turn => {
      if (turn.role !== 'segment' || turn.kind === 'jingle') return [];
      const airedAt = typeof turn.meta?.airedAt === 'string' ? Date.parse(turn.meta.airedAt) + leadMs : NaN;
      const length = Number(turn.meta?.durationMs);
      return Number.isFinite(airedAt) && Number.isFinite(length) && length > 0
        ? [{ kind: 'speech', airedAt, durationMs: length, label: turn.text || 'Speech' }]
        : [];
    });
    const jingles: TimedMarker[] = jingle
      ? [{ kind: 'jingle', airedAt: Date.parse(jingle.airedAt) + leadMs, durationMs: jingle.durationMs, label: 'Jingle' }]
      : [];
    return [...speech, ...jingles];
  }, [durationMs, jingle, leadMs, session.messages, trackStartedAtMs]);

  return <section className="space-y-3 border border-ink/30 p-4" aria-label="Currently playing waveform">
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-[10px] font-bold tracking-[0.2em] text-muted uppercase">On air</span>
      <h2 className="min-w-0 break-words text-sm font-semibold">{nowPlaying?.title ?? 'Nothing playing'}</h2>
      {nowPlaying?.artist && <span className="text-sm text-muted">— {nowPlaying.artist}</span>}
      <label className="ml-auto flex items-center gap-2 text-xs text-muted">
        <span>Style</span>
        <select className="min-h-8 border border-ink/30 bg-bg px-2 text-ink" value={style}
          onChange={event => setStyle(event.currentTarget.value as VisualStyle)} aria-label="Waveform style">
          <option value="waveform">Waveform</option>
          <option value="bars">Bars</option>
          <option value="stereo">Split stereo</option>
        </select>
      </label>
      <span className="w-full text-right text-xs tabular-nums text-muted">{clock(elapsed)}{duration ? ` / ${clock(duration)}` : ''}</span>
    </div>
    <div ref={host} className="min-h-[5.5rem] overflow-hidden" />
    {duration > 0 && <div className="space-y-1" aria-label="Speech and jingle timeline">
      {(['speech', 'jingle'] as const).map(kind => <div key={kind} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2">
        <span className="text-[10px] text-muted">{kind === 'speech' ? 'Speech' : 'Jingles'}</span>
        <div className="relative h-2 overflow-hidden rounded-sm bg-ink/10" role="img" aria-label={`${kind} markers`}>
          {markers.filter(marker => marker.kind === kind).map((marker, index) => {
            const position = markerStyle(marker, trackStartedAtMs, durationMs);
            return position ? <span key={`${marker.airedAt}-${index}`} title={marker.label}
              className={`absolute inset-y-0 rounded-sm ${kind === 'speech' ? 'bg-[var(--accent)]' : 'bg-[var(--accent-2)]'}`}
              style={position} /> : null;
          })}
        </div>
      </div>)}
    </div>}
    <p className="text-xs text-muted" role="status">{message}</p>
  </section>;
}
