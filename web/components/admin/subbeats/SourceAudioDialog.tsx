'use client';

import { useEffect, useRef, useState } from 'react';
import { adminResponse, type AdminFetch } from '../../../lib/admin-query';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../ui/dialog';

function SourceAudioPlayer({ trackId, title, artist, adminFetch, onPlay }: {
  trackId: string;
  title: string;
  artist: string;
  adminFetch: AdminFetch;
  onPlay: () => void;
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
      player?.pause();
      player?.removeAttribute('src');
      player?.load();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  const listen = async () => {
    if (loading) {
      request.current?.abort();
      request.current = null;
      setLoading(false);
      return;
    }
    onPlay();
    const abort = new AbortController();
    request.current = abort;
    setLoading(true);
    setMessage(null);
    try {
      // admin-query-imperative: subbeats-source-audition
      const response = await adminResponse(adminFetch, `/library/subbeats/source-audio/${encodeURIComponent(trackId)}`, { signal: abort.signal });
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

  return <>
    <p className="text-sm leading-relaxed text-muted">Listen at the original speed and scrub through the full track to check the intro, outro, or where the beat begins.</p>
    {!src && <Button className="min-h-11 w-fit" onClick={() => void listen()}>{loading ? 'Cancel loading' : 'Listen to original recording'}</Button>}
    <audio ref={audio} src={src} controls preload="metadata" className={`w-full ${src ? '' : 'hidden'}`} aria-label={`Original recording: ${artist} — ${title}`}
      onLoadedMetadata={() => { void audio.current?.play().then(() => setMessage(null)).catch(() => setMessage('Recording ready. Use the audio controls to listen.')); }}
      onPlay={onPlay} onError={() => setMessage('Your browser could not play this recording. Try another track.')} />
    {loading && <p role="status" className="text-sm text-muted">Loading the original recording…</p>}
    {message && <p role="status" className="text-sm text-muted">{message}</p>}
  </>;
}

export function SourceAudioDialog({ open, trackId, title, artist, position, total, cueSummary, adminFetch, onOpenChange, onPrevious, onNext, onPlay }: {
  open: boolean;
  trackId: string;
  title: string;
  artist: string;
  position: number;
  total: number;
  cueSummary: string;
  adminFetch: AdminFetch;
  onOpenChange: (open: boolean) => void;
  onPrevious: () => void;
  onNext: () => void;
  onPlay: () => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[calc(100%-2rem)] max-w-xl gap-5">
      <div className="space-y-2 pr-6">
        <DialogTitle className="break-words">{title}</DialogTitle>
        <p className="text-sm text-muted">{artist}</p>
        <DialogDescription>Original recording · {position} of {total} matching tracks · {cueSummary}</DialogDescription>
      </div>
      <SourceAudioPlayer key={trackId} trackId={trackId} title={title} artist={artist} adminFetch={adminFetch} onPlay={onPlay} />
      <div className="flex flex-wrap justify-between gap-2 border-t border-ink/20 pt-4">
        <Button className="min-h-11" disabled={position <= 1} onClick={onPrevious}>Previous track</Button>
        <Button className="min-h-11" disabled={position >= total} onClick={onNext}>Next track</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
