'use client';

import { useEffect, useRef, useState } from 'react';
import { adminResponse, type AdminFetch } from '../../../lib/admin-query';
import { Button } from '../../ui/button';

export function OutgoingCueAudition({ trackId, cueSeconds, adminFetch, onPlay, pause }: {
  trackId: string; cueSeconds: number; adminFetch: AdminFetch; onPlay: () => void; pause: boolean;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const request = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);
  const [src, setSrc] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const player = audio.current;
    return () => {
      request.current?.abort();
      player?.pause(); player?.removeAttribute('src'); player?.load();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);
  useEffect(() => {
    audio.current?.pause();
    if (audio.current?.readyState && cueSeconds < audio.current.duration) audio.current.currentTime = cueSeconds;
  }, [cueSeconds]);
  useEffect(() => {
    if (pause) {
      audio.current?.pause();
      request.current?.abort(); request.current = null; setLoading(false);
    }
  }, [pause]);

  const play = async () => {
    const player = audio.current;
    if (!player || !Number.isFinite(player.duration) || cueSeconds >= player.duration) {
      setMessage('This cue is beyond the playable recording. Choose another cue.');
      return;
    }
    player.currentTime = cueSeconds;
    try { await player.play(); setMessage(null); }
    catch { setMessage('Recording ready. Use the audio player to listen.'); }
  };
  const start = async () => {
    if (loading) { request.current?.abort(); request.current = null; setLoading(false); return; }
    if (src) { await play(); return; }
    const abort = new AbortController();
    request.current = abort;
    setLoading(true); setMessage(null);
    try {
      const response = await adminResponse(adminFetch, `/library/subbeats/outgoing-audio/${encodeURIComponent(trackId)}`, { signal: abort.signal });
      const blob = await response.blob();
      if (abort.signal.aborted) return;
      objectUrl.current = URL.createObjectURL(blob);
      setSrc(objectUrl.current);
    } catch {
      if (!abort.signal.aborted) setMessage('Could not load the recording. Try again.');
    } finally {
      if (request.current === abort) { request.current = null; setLoading(false); }
    }
  };
  return <div className="mt-3 space-y-3">
    <Button className="min-h-11" onClick={() => void start()}>{loading ? 'Cancel loading' : 'Listen from this cue to the end'}</Button>
    <p className="max-w-prose text-xs leading-relaxed text-muted">Hear the original recording at its original speed, without a fade. Listen for a complete closing passage and whether another major section arrives. Changing the cue pauses playback; press Listen to compare.</p>
    <audio ref={audio} src={src} controls preload="metadata" className={`w-full ${src ? '' : 'hidden'}`} aria-label="Outgoing track ending" onLoadedMetadata={() => { if (!pause) void play(); }} onPlay={onPlay}
      onError={() => setMessage('Your browser could not play this recording. Choose another track.')} />
    {message && <p role="status" className="text-sm">{message}</p>}
  </div>;
}
