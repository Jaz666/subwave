'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { subbeatsTimelineSchema } from '../../../lib/schemas.generated';
import { adminResponse, AdminResponseError, type AdminFetch } from '../../../lib/admin-query';

export function useJoinPreview(trackKey: string, adminFetch: AdminFetch, endpoint = '/library/sub-flow/join-preview') {
  const [active, setActive] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [timeline, setTimeline] = useState<ReturnType<typeof subbeatsTimelineSchema.parse> | null>(null);
  const request = useRef<AbortController | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const clear = useCallback(() => {
    request.current?.abort();
    request.current = null;
    if (audio.current) { audio.current.ontimeupdate = null; audio.current.onloadedmetadata = null; audio.current.onended = null; audio.current.onerror = null; audio.current.pause(); audio.current.removeAttribute('src'); audio.current.load(); audio.current = null; }
    if (url.current) { URL.revokeObjectURL(url.current); url.current = null; }
  }, []);
  useEffect(() => {
    setActive(null); setLoading(false); setPlaying(false); setMessage(null); setPosition(0); setDuration(0); setTimeline(null);
    return clear;
  }, [trackKey, clear]);

  const toggle = async (index: number, trackIds: string[], options?: { barShift?: number; referenceBars?: number }) => {
    // A second click cancels preparation or stops playback. Only one join plays.
    if (active === index && (loading || !audio.current?.paused)) {
      clear(); setActive(null); setLoading(false); setPlaying(false); setMessage(null); setPosition(0); setDuration(0); setTimeline(null); return;
    }
    if (active === index && audio.current) {
      try { await audio.current.play(); setPlaying(true); setMessage(null); }
      catch { setMessage('Could not play this preview. Try again.'); }
      return;
    }
    clear(); setActive(index); setLoading(true); setPlaying(false); setMessage(null); setPosition(0); setDuration(0); setTimeline(null);
    const ac = new AbortController();
    request.current = ac;
    try {
      const response = await adminResponse(adminFetch, endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds, ...options }), signal: ac.signal,
      });
      const rawTiming = response.headers.get('x-subbeats-timeline');
      const timing = rawTiming ? subbeatsTimelineSchema.parse(JSON.parse(rawTiming)) : null;
      const blob = await response.blob();
      if (ac.signal.aborted) return;
      url.current = URL.createObjectURL(blob);
      const player = new Audio(url.current);
      audio.current = player;
      setTimeline(timing); setDuration(timing?.duration ?? 0);
      if (timing) {
        player.ontimeupdate = () => setPosition(player.currentTime);
        player.onloadedmetadata = () => { if (Number.isFinite(player.duration)) setDuration(player.duration); };
      }
      player.onended = () => {
        setPlaying(false);
        if (timing) setPosition(player.duration);
        else { clear(); setActive(null); }
      };
      player.onerror = () => { setPosition(0); setDuration(0); setTimeline(null); clear(); setActive(null); setPlaying(false); setMessage('Could not play this preview. Try again.'); };
      setLoading(false);
      try { await player.play(); if (!ac.signal.aborted) setPlaying(true); }
      catch {
        if (!ac.signal.aborted) setMessage('Preview ready. Press Play to listen.');
      }
    } catch (error) {
      if (ac.signal.aborted) return;
      clear(); setActive(null); setLoading(false); setPlaying(false);
      setMessage(error instanceof AdminResponseError && typeof error.body.error === 'string'
        ? error.body.error : error instanceof Error ? error.message : 'Could not prepare the preview. Try again.');
    }
  };
  const seek = (seconds: number) => {
    if (!audio.current || !Number.isFinite(seconds)) return;
    audio.current.currentTime = Math.max(0, Math.min(duration, seconds));
    setPosition(audio.current.currentTime);
  };
  return { active, loading, playing, message, toggle, position, duration, timeline, seek };
}
