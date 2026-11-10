'use client';

import { useEffect, useRef, useState } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import { useStationFeed } from '../../../hooks/useStationFeed';
import { adminResponse } from '../../../lib/admin-query';
import { useAdminAuth } from '../../../lib/adminAuth';

function clock(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export default function NowPlayingWaveform() {
  const { nowPlaying, trackStartedAt } = useStationFeed();
  const { adminFetch, hydrated, needsAuth } = useAdminAuth();
  const host = useRef<HTMLDivElement>(null);
  const waveform = useRef<WaveSurfer | null>(null);
  const [duration, setDuration] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState('Waiting for a prepared track…');
  const id = nowPlaying?.subsonic_id;

  useEffect(() => {
    setDuration(0);
    setElapsed(0);
    setMessage(!id ? 'No library track is on air.' : needsAuth ? 'Sign in to load the on-air waveform.' : 'Loading the on-air recording…');
    if (!id || !hydrated || needsAuth || !host.current) return;

    const abort = new AbortController();
    let player: WaveSurfer | null = null;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const response = await adminResponse(adminFetch, `/library/subbeats/source-audio/${encodeURIComponent(id)}`, { signal: abort.signal });
        const blob = await response.blob();
        if (abort.signal.aborted || !host.current) return;
        objectUrl = URL.createObjectURL(blob);
        const { default: WaveSurfer } = await import('wavesurfer.js');
        if (abort.signal.aborted || !host.current) return;
        player = WaveSurfer.create({
          container: host.current,
          height: 88,
          waveColor: '#d94b2a',
          progressColor: 'var(--color-ink)',
          cursorColor: 'var(--color-ink)',
          cursorWidth: 2,
          barWidth: 2,
          barGap: 1,
          barRadius: 1,
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
        if (!abort.signal.aborted) setMessage('This track has no prepared source audio yet.');
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

  return <section className="space-y-3 border border-ink/30 p-4" aria-label="Currently playing waveform">
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-[10px] font-bold tracking-[0.2em] text-muted uppercase">On air</span>
      <h2 className="min-w-0 break-words text-sm font-semibold">{nowPlaying?.title ?? 'Nothing playing'}</h2>
      {nowPlaying?.artist && <span className="text-sm text-muted">— {nowPlaying.artist}</span>}
      <span className="ml-auto text-xs tabular-nums text-muted">{clock(elapsed)}{duration ? ` / ${clock(duration)}` : ''}</span>
    </div>
    <div ref={host} className="min-h-[5.5rem] overflow-hidden" />
    <p className="text-xs text-muted" role="status">{message}</p>
  </section>;
}
