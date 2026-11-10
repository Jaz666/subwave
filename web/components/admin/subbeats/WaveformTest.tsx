'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '../../ui/button';
import NowPlayingWaveform from './NowPlayingWaveform';

const LANES = [
  { id: 'mix', label: 'Original mix', color: '#d94b2a' },
  { id: 'vocals', label: 'Vocals', color: '#8b5cf6' },
  { id: 'drums', label: 'Drums', color: '#e59b25' },
  { id: 'bass', label: 'Bass', color: '#278b79' },
  { id: 'other', label: 'Other', color: '#5776b7' },
] as const;

type LaneId = (typeof LANES)[number]['id'];
type MultiTrackInstance = {
  play(): void;
  pause(): void;
  isPlaying(): boolean;
  zoom(pxPerSec: number): void;
  setTrackVolume(index: number, volume: number): void;
  on(event: 'canplay', callback: () => void): void;
  destroy(): void;
};

export default function WaveformTest() {
  const [files, setFiles] = useState<Partial<Record<LaneId, File>>>({});
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(12);
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<MultiTrackInstance | null>(null);
  const zoomRef = useRef(zoom);
  const tracks = useMemo(() => LANES.flatMap(lane => files[lane.id] ? [lane] : []), [files]);

  useEffect(() => {
    setReady(false);
    setPlaying(false);
    if (!host.current || tracks.length === 0) return;
    let cancelled = false;
    let player: MultiTrackInstance | null = null;
    const urls = tracks.map(lane => URL.createObjectURL(files[lane.id]!));

    void import('wavesurfer-multitrack').then(({ default: MultiTrack }) => {
      if (cancelled || !host.current) return;
      player = MultiTrack.create(tracks.map((lane, index) => ({
        id: lane.id,
        url: urls[index],
        startPosition: 0,
        volume: 1,
        draggable: false,
        options: {
          height: 60,
          waveColor: lane.color,
          progressColor: 'var(--color-ink)',
          barWidth: 2,
          barGap: 1,
          barRadius: 1,
        },
      })), {
        container: host.current,
        minPxPerSec: zoomRef.current,
        cursorColor: 'var(--color-ink)',
        cursorWidth: 1,
        trackBackground: 'transparent',
        trackBorderColor: 'color-mix(in oklab, var(--color-ink) 22%, transparent)',
        timelineOptions: { height: 22, insertPosition: 'beforebegin' },
      });
      instance.current = player;
      player.on('canplay', () => setReady(true));
    }).catch(() => setReady(false));

    return () => {
      cancelled = true;
      if (instance.current === player) instance.current = null;
      player?.destroy();
      urls.forEach(URL.revokeObjectURL);
    };
  }, [files, tracks]);

  useEffect(() => { zoomRef.current = zoom; instance.current?.zoom(zoom); }, [zoom]);

  const onFile = (id: LaneId, file?: File) => setFiles(current => {
    const next = { ...current };
    if (file) next[id] = file;
    else delete next[id];
    return next;
  });

  return <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
    <header className="max-w-3xl">
      <p className="text-[10px] font-bold tracking-[0.2em] text-muted uppercase">Sub/Beats · experiment</p>
      <h1 className="mt-2 font-display text-3xl font-bold">WaveSurfer multitrack test</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">Load an original and any prepared stem files to see how they line up. Files stay in this browser and are not uploaded.</p>
    </header>

    <NowPlayingWaveform />

    <section className="grid gap-3 border-y border-ink/25 py-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Choose local audio files">
      {LANES.map(lane => <div key={lane.id} className="min-w-0 space-y-2">
        <label htmlFor={`waveform-file-${lane.id}`} className="block text-xs font-semibold" style={{ color: lane.color }}>{lane.label}</label>
        <input
          key={files[lane.id]?.name ?? lane.id}
          className="block w-full min-w-0 text-xs text-muted file:mr-2 file:border file:border-ink/40 file:bg-transparent file:px-2 file:py-1.5 file:text-[10px] file:font-semibold file:text-ink"
          type="file" accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a"
          id={`waveform-file-${lane.id}`}
          aria-label={`Choose ${lane.label} audio`}
          onChange={event => onFile(lane.id, event.currentTarget.files?.[0])}
        />
        {files[lane.id] && <span className="flex min-w-0 items-center gap-2 text-[10px] text-muted">
          <span className="min-w-0 flex-1 truncate" title={files[lane.id]!.name}>{files[lane.id]!.name}</span>
          <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => onFile(lane.id)} aria-label={`Remove ${lane.label} file`}>Remove</button>
        </span>}
      </div>)}
    </section>

    <section className="border border-ink/30" aria-label="Multitrack waveform preview">
      <div className="flex flex-wrap items-center gap-3 border-b border-ink/20 p-3">
        <Button className="min-h-10" variant="solid" disabled={!ready} onClick={() => {
          if (!instance.current) return;
          if (instance.current.isPlaying()) { instance.current.pause(); setPlaying(false); }
          else { instance.current.play(); setPlaying(true); }
        }}>
          {playing ? <Pause /> : <Play />}{playing ? 'Pause' : 'Play all'}
        </Button>
        <div className="flex items-center gap-2 text-xs text-muted">
          <ZoomOut className="size-3.5" aria-hidden="true" />
          <label className="sr-only" htmlFor="waveform-zoom">Waveform zoom</label>
          <input id="waveform-zoom" type="range" min="2" max="60" step="1" value={zoom}
            onChange={event => setZoom(Number(event.currentTarget.value))} />
          <ZoomIn className="size-3.5" aria-hidden="true" />
          <span className="w-14 tabular-nums">{zoom} px/s</span>
        </div>
        <span className="ml-auto text-[10px] text-muted" role="status">{tracks.length === 0 ? 'Choose audio files to begin' : ready ? 'Ready · drag the timeline to inspect' : 'Decoding waveforms…'}</span>
      </div>
      {tracks.length > 0 ? <>
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] border-b border-ink/15 bg-ink/[0.025] text-[10px] font-semibold text-muted">
          <div className="p-2">Lane</div><div className="p-2">Waveform · time aligned at 0:00</div>
        </div>
        <div ref={host} className="min-h-24 overflow-x-auto px-2" />
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-ink/15 p-3">
          {tracks.map((lane, index) => <label key={lane.id} className="flex items-center gap-2 text-xs">
            <span className="w-20 truncate font-medium" style={{ color: lane.color }}>{lane.label}</span>
            <input aria-label={`${lane.label} volume`} type="range" min="0" max="1" step="0.01" defaultValue="1"
              onChange={event => instance.current?.setTrackVolume(index, Number(event.currentTarget.value))} />
          </label>)}
        </div>
      </> : <p className="p-8 text-center text-sm text-muted">Choose the original or stem files you want to compare.</p>}
    </section>

    <p className="max-w-3xl text-xs leading-relaxed text-muted">For this first pass, lanes begin together at 0:00. Use the lane volume controls to compare the original with its stems. WaveSurfer decodes each selected file in browser memory, so shorter prepared passages are a better fit than full length uncompressed tracks.</p>
  </main>;
}
