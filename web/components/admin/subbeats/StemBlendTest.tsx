'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useDebounceValue } from 'usehooks-ts';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAdminAuth } from '../../../lib/adminAuth';
import { adminJson, adminResponse, useAdminQuery } from '../../../lib/admin-query';
import { stemBlendPreviewReportSchema, stemBlendPreviewTracksSchema, type stemBlendPreviewModeSchema } from '../../../lib/schemas.generated';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';

type Track = ReturnType<typeof stemBlendPreviewTracksSchema.parse>['rows'][number];
type Report = ReturnType<typeof stemBlendPreviewReportSchema.parse>;
type Mode = ReturnType<typeof stemBlendPreviewModeSchema.parse>;
const keys = { tracks: (q: string, offset: number) => ['stems', 'blend-preview', 'tracks', q, offset] as const };
const MODES: Array<[Mode, string]> = [['mix', 'Play complete audition'], ['clip', 'Play transition clip'],
  ['outgoing', 'Solo outgoing drums'], ['incoming', 'Solo incoming contribution']];
const seconds = (value: number) => `${value.toFixed(2)}s`;
const db = (value: number | null) => value == null ? 'Silent' : `${value.toFixed(1)} dB`;
const level = (value: number | null) => value == null ? 'Silent' : `${value.toFixed(1)} dBFS`;

export default function StemBlendTest() {
  const { adminFetch, hydrated, needsAuth } = useAdminAuth();
  const ready = hydrated && !needsAuth;
  const [search, setSearch] = useState('');
  const [query] = useDebounceValue(search.trim(), 300);
  const [offset, setOffset] = useState(0);
  const [outgoing, setOutgoing] = useState<Track | null>(null);
  const [incoming, setIncoming] = useState<Track | null>(null);
  const [loading, setLoading] = useState<Mode | null>(null);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<{ src: string; report: Report } | null>(null);
  const [position, setPosition] = useState(0);
  const request = useRef<AbortController | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const objectUrl = useRef<string | null>(null);
  const tracks = useAdminQuery({ key: keys.tracks(query, offset), adminFetch, enabled: ready,
    request: async (fetcher, signal) => stemBlendPreviewTracksSchema.parse(await adminJson(fetcher,
      `/stems/blend-preview/tracks?${new URLSearchParams({ q: query, offset: String(offset) })}`, undefined, signal)),
  });
  useEffect(() => {
    const player = audio.current;
    return () => { request.current?.abort(); player?.pause(); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); };
  }, []);
  const clear = () => {
    request.current?.abort(); request.current = null; audio.current?.pause();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null; setPreview(null); setPosition(0); setLoading(null); setMessage('');
  };
  const select = (role: 'outgoing' | 'incoming', id: string) => {
    clear();
    const row = tracks.data?.rows.find(row => row.id === id) ?? null;
    if (role === 'outgoing') setOutgoing(row); else setIncoming(row);
  };
  const render = async (mode: Mode) => {
    clear();
    if (!outgoing || !incoming) return;
    const abort = new AbortController(); request.current = abort; setLoading(mode);
    try {
      // admin-query-imperative: stem-blend-audition
      const response = await adminResponse(adminFetch, '/stems/blend-preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
        body: JSON.stringify({ trackIds: [outgoing.id, incoming.id], mode }),
      });
      const report = stemBlendPreviewReportSchema.parse(JSON.parse(response.headers.get('x-stem-blend-report') ?? 'null'));
      if (report.mode !== mode) throw new Error('The analyzer returned a different audition. Update it and retry.');
      const blob = await response.blob();
      if (abort.signal.aborted) return;
      const src = URL.createObjectURL(blob); objectUrl.current = src;
      setPreview({ src, report });
    } catch (error) {
      if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : 'Could not prepare this audition. Try again.');
    } finally { if (request.current === abort) { request.current = null; setLoading(null); } }
  };
  const rows = tracks.data?.rows ?? [];
  const report = preview?.report;
  const clipPosition = report ? position - report.beforeSec : 0;
  const phase = !report ? '' : clipPosition < 0 ? 'Outgoing context'
    : clipPosition >= report.clipSec ? 'Incoming context'
      : clipPosition < report.carryStartSec ? 'Incoming opening before borrowed drums'
        : clipPosition < report.incomingDrumsSec ? 'Outgoing drums under incoming music' : 'Incoming full mix';

  return <div className="grid min-w-0 gap-6">
    <header>
      <Link href="/admin/library/subbeats/preview" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4"><ArrowLeft size={16} /> Sub/Beats Preview</Link>
      <h1 className="font-display text-3xl font-bold">Regular Stem Blend test</h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">Audition the upstream beat-carry renderer using cached regular stems. The complete audition adds up to six seconds of reconstructed music on either side, with simulated 0.3-second joining fades. Broadcast ducking, limiting and buffering are not simulated.</p>
    </header>
    <section className="min-w-0 border border-ink p-4" aria-labelledby="stem-test-pair">
      <h2 id="stem-test-pair" className="font-display text-xl font-bold">Choose a pair</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">This test runs the audio renderer directly, without the live picker’s tempo or show gates. It neither prepares missing stems nor changes the on-air queue. Sub/Beats files cannot substitute for regular stems in this baseline.</p>
      <label htmlFor="stem-test-search" className="mt-4 mb-1 block text-sm font-medium">Search cached tracks</label>
      <Input id="stem-test-search" type="search" className="min-h-11 max-w-xl" value={search} placeholder="Artist, track or track ID" onChange={event => { setSearch(event.target.value); setOffset(0); }} />
      {tracks.isLoading && <p role="status" className="mt-3 text-sm">Loading cached tracks…</p>}
      {tracks.isError && <div role="alert" className="mt-3 text-sm"><p>Cached tracks could not be loaded.</p><Button className="mt-2 min-h-11" onClick={() => void tracks.refetch()}>Retry</Button></div>}
      {!tracks.isLoading && !tracks.isError && !rows.length && <p role="status" className="mt-3 text-sm">No cached tracks match. Try another search or create regular stems through Library Analysis.</p>}
      <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
        {(['outgoing', 'incoming'] as const).map(role => {
          const selected = role === 'outgoing' ? outgoing : incoming;
          const other = role === 'outgoing' ? incoming : outgoing;
          const choices = selected && !rows.some(row => row.id === selected.id) ? [selected, ...rows] : rows;
          return <div key={role} className="min-w-0">
            <label htmlFor={`stem-test-${role}`} className="mb-1 block text-sm font-medium">{role === 'outgoing' ? 'Outgoing track' : 'Incoming track'}</label>
            <select id={`stem-test-${role}`} className="h-11 w-full min-w-0 border border-ink bg-bg px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" value={selected?.id ?? ''} onChange={event => select(role, event.target.value)}>
              <option value="">Choose a track</option>
              {choices.filter(row => row.id !== other?.id).map(row => {
                const cached = role === 'outgoing' ? row.tail : row.head;
                const grid = role === 'outgoing' ? row.tailGrid : row.headGrid;
                return <option key={row.id} value={row.id} disabled={!cached || !grid}>{row.artist} — {row.title}{!cached ? ' · missing regular stems' : !grid ? ' · missing bar grid' : ''}</option>;
              })}
            </select>
            {selected && <p className="mt-2 text-sm break-words text-muted">{selected.artist} — {selected.title}</p>}
          </div>;
        })}
      </div>
      <nav aria-label="Cached track pages" className="mt-4 flex flex-wrap items-center gap-3">
        <Button className="min-h-11" disabled={offset === 0 || tracks.isFetching} onClick={() => setOffset(Math.max(0, offset - 30))}>Previous</Button>
        <span className="text-sm tabular-nums">{tracks.data ? `${offset + (rows.length ? 1 : 0)}–${offset + rows.length} of ${tracks.data.total.toLocaleString()} cached entries` : 'Loading…'}</span>
        <Button className="min-h-11" disabled={!tracks.data || offset + 30 >= tracks.data.total || tracks.isFetching} onClick={() => setOffset(offset + 30)}>Next</Button>
      </nav>
    </section>
    <section className="min-w-0 border border-ink p-4" aria-labelledby="stem-test-audition">
      <h2 id="stem-test-audition" className="font-display text-xl font-bold">Listen and compare</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">Solo playback keeps the renderer’s actual gain. A nearly silent outgoing loop stays nearly silent. Context is reconstructed from cached stems, rather than fetched from the original recording.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {MODES.map(([mode, label]) => <Button key={mode} className="min-h-11 max-w-full whitespace-normal" disabled={!ready || !outgoing || !incoming || loading !== null} onClick={() => void render(mode)}>{loading === mode && <Loader2 className="animate-spin motion-reduce:animate-none" />}{label}</Button>)}
        {loading && <Button className="min-h-11" onClick={clear}>Cancel preparation</Button>}
      </div>
      {loading && <p role="status" className="mt-3 text-sm">Preparing the cached-stem audition…</p>}
      {message && <p role="alert" className="mt-3 text-sm break-words">{message}</p>}
      <audio ref={audio} src={preview?.src} controls preload="metadata" className={`mt-4 w-full ${preview ? '' : 'hidden'}`} aria-label="Regular Stem Blend audition"
        onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={event => { void event.currentTarget.play().catch(() => setMessage('Audition ready. Press Play to listen.')); }}
        onError={() => { if (preview) setMessage('The browser could not play this audition. Download the WAV to inspect it.'); }} />
      {preview && <div className="mt-4 space-y-3">
        <p className="text-sm font-medium">{MODES.find(([mode]) => mode === preview.report.mode)?.[1]}</p>
        <p className="text-sm tabular-nums">{seconds(position)} / {seconds(preview.report.durationSec)} · {phase}</p>
        <a href={preview.src} download={`stem-blend-${preview.report.mode}.wav`} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Download this audition WAV</a>
      </div>}
    </section>
    {report && <section className="min-w-0 border border-ink p-4" aria-labelledby="stem-test-report">
      <h2 id="stem-test-report" className="font-display text-xl font-bold">What the renderer produced</h2>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm tabular-nums sm:grid-cols-2">
        {[
          ['Transition clip', seconds(report.clipSec)], ['Outgoing loop source', `${seconds(report.loopStartSec)}–${seconds(report.loopEndSec)} in the outgoing recording`],
          ['Borrowed drums start', `${seconds(report.carryStartSec)} into the clip`], ['Incoming drums enter', `${seconds(report.incomingDrumsSec)} into the clip`],
          ['Source loop level (RMS)', level(report.loopSourceRmsDb)], ['Loop peak-safety adjustment', db(report.loopDuckDb)], ['Whole-clip peak adjustment', db(report.wholeGainDb)],
          ['Station gain: outgoing / incoming', `${db(report.gainsDb[0])} / ${db(report.gainsDb[1])}`],
        ].map(([label, value]) => <div key={label}><dt className="text-muted">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}
      </dl>
      {report.warnings.map(warning => <p key={warning} className="mt-4 max-w-prose text-sm leading-relaxed">{warning}</p>)}
      <p className="mt-5 max-w-prose text-sm leading-relaxed text-muted">Measured RMS levels per carry bar. Times are relative to the transition clip; negative differences mean the outgoing drums are quieter. The final carry bar includes the upstream fade-out.</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm tabular-nums">
        <caption className="sr-only">Contribution levels during the four carry bars</caption>
        <thead><tr className="border-b border-ink/20">{['Clip window', 'Outgoing drums', 'Incoming music', 'Difference'].map(label => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
        <tbody>{report.barLevels.map(row => <tr key={row.startSec} className="border-b border-ink/20"><th scope="row" className="p-2 font-normal whitespace-nowrap">{seconds(row.startSec)}–{seconds(row.endSec)}</th><td className="p-2 whitespace-nowrap">{level(row.outgoingDb)}</td><td className="p-2 whitespace-nowrap">{level(row.incomingDb)}</td><td className="p-2 whitespace-nowrap">{row.differenceDb == null ? 'Unavailable' : db(row.differenceDb)}</td></tr>)}</tbody>
      </table></div>
    </section>}
  </div>;
}
