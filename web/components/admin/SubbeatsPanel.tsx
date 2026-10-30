'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useDebounceValue } from 'usehooks-ts';
import { z } from 'zod';
import { ArrowLeft, Pause, Play, Plus, RefreshCw, Square, Loader2 } from 'lucide-react';
import { useAdminAuth } from '../../lib/adminAuth';
import { adminJson, useAdminMutation, useAdminQuery } from '../../lib/admin-query';
import { subbeatsCandidatePageSchema, subbeatsViewSchema, type subbeatsStatusSchema } from '../../lib/schemas.generated';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useJoinPreview } from './library/useJoinPreview';
import { Checkbox } from '../ui/checkbox';

const subbeatsKeys = {
  state: ['library', 'subbeats', 'state'] as const,
  candidates: (q: string, offset: number) => ['library', 'subbeats', 'candidates', q, offset] as const,
};
type Status = z.infer<typeof subbeatsStatusSchema>;
const LABEL: Record<Status, string> = {
  queued: 'Queued', running: 'Preparing', prepared: 'Prepared', unmeasurable: 'No reliable beat data',
  unavailable: 'Unavailable', failed: 'Needs retry',
};
const finished = (status: Status | undefined) => status != null && ['queued', 'running', 'prepared', 'unmeasurable'].includes(status);

export default function SubbeatsPanel() {
  const { adminFetch, hydrated, needsAuth } = useAdminAuth();
  const ready = hydrated && !needsAuth;
  const [query, setQuery] = useState('');
  const [q] = useDebounceValue(query.trim(), 300);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [outgoing, setOutgoing] = useState('');
  const [incoming, setIncoming] = useState('');
  const preview = useJoinPreview(JSON.stringify([outgoing, incoming, ready]), adminFetch, '/library/subbeats/join-preview');
  const state = useAdminQuery({
    key: subbeatsKeys.state, adminFetch, enabled: ready, refetchInterval: 3000,
    request: async (fetcher, signal) => subbeatsViewSchema.parse(await adminJson(fetcher, '/library/subbeats', undefined, signal)),
  });
  const candidates = useAdminQuery({
    key: subbeatsKeys.candidates(q, offset), adminFetch, enabled: ready,
    request: async (fetcher, signal) => subbeatsCandidatePageSchema.parse(await adminJson(fetcher,
      `/library/subbeats/candidates?q=${encodeURIComponent(q)}&offset=${offset}`, undefined, signal)),
  });
  const enqueue = useAdminMutation({
    adminFetch,
    request: async (ids: string[], fetcher) => subbeatsViewSchema.parse(await adminJson(fetcher, '/library/subbeats/queue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
    })),
    onDone: async (view, _ids, client) => { await client.cancelQueries({ queryKey: subbeatsKeys.state, exact: true }); client.setQueryData(subbeatsKeys.state, view); setSelected(new Set()); },
  });
  const pause = useAdminMutation({
    adminFetch,
    request: async (paused: boolean, fetcher) => subbeatsViewSchema.parse(await adminJson(fetcher, '/library/subbeats/pause', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused }),
    })),
    onDone: async (view, _paused, client) => { await client.cancelQueries({ queryKey: subbeatsKeys.state, exact: true }); client.setQueryData(subbeatsKeys.state, view); },
  });
  const jobs = state.data?.jobs ?? [];
  const byId = new Map(jobs.map(j => [j.id, j]));
  const rows = candidates.data?.rows ?? [];
  const selectable = rows.filter(row => !finished(byId.get(row.id)?.status));
  const pending = jobs.filter(j => j.status === 'queued' || j.status === 'running').length;
  const prepared = jobs.filter(j => j.status === 'prepared').length;
  const ranked = [...jobs].sort((a, b) => {
    const priority = (s: Status) => s === 'running' ? 0 : s === 'queued' ? 1 : s === 'failed' || s === 'unavailable' ? 2 : 3;
    return priority(a.status) - priority(b.status) || b.updatedAt.localeCompare(a.updatedAt);
  });
  const changePage = (next: number) => { setOffset(next); setSelected(new Set()); };

  return <div className="grid min-w-0 gap-6">
    <header>
      <Link href="/admin/library" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted underline-offset-4 hover:text-ink hover:underline"><ArrowLeft size={14} /> Library</Link>
      <h1 className="font-display text-3xl font-bold text-ink">Sub/Beats</h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">Find tracks with a driving beat and queue deeper analysis. Preparation continues in the background when you leave this page.</p>
      <p className="mt-2 max-w-prose text-sm text-muted">Previews are for listening only. Station playback continues using your existing transitions.</p>
    </header>

    {state.isError && <div role="alert" className="flex flex-wrap items-center gap-3 border border-ink p-4 text-sm">
      <span>Could not load preparation progress. Your saved list has been kept.</span>
      <Button onClick={() => void state.refetch()}><RefreshCw /> Retry</Button>
    </div>}

    <section className="min-w-0 border border-ink p-4" aria-labelledby="subbeats-preview">
      <h2 id="subbeats-preview" className="font-display text-xl font-bold">Preview a transition</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">Choose two prepared tracks to hear an experimental 16-bar stem mix in your browser. Station playback is unaffected.</p>
      <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted">This first preview checks sustained kicks and matches the tempo. Phrase alignment and vocal handling are experimental; the incoming tempo stays matched until the preview ends.</p>
      {prepared < 2 ? <p className="mt-4 text-sm text-muted">Prepare at least two tracks to try a transition.</p> : <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        {([{ id: 'subbeats-outgoing', label: 'Outgoing track', value: outgoing, change: setOutgoing, other: incoming },
          { id: 'subbeats-incoming', label: 'Incoming track', value: incoming, change: setIncoming, other: outgoing }]).map(field => <div key={field.id} className="min-w-0">
          <label htmlFor={field.id} className="mb-1 block text-sm font-medium">{field.label}</label>
          <select id={field.id} className="h-11 w-full min-w-0 rounded-none border border-ink bg-bg px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" value={field.value} onChange={e => field.change(e.target.value)}>
            <option value="">Choose a prepared track</option>
            {jobs.filter(j => j.status === 'prepared').map(j => <option key={j.id} value={j.id} disabled={j.id === field.other}>{j.artist} — {j.title}</option>)}
          </select>
        </div>)}
        <Button className="self-end" variant="solid" disabled={!preview.loading && !preview.playing && (!ready || !outgoing || !incoming || outgoing === incoming || byId.get(outgoing)?.status !== 'prepared' || byId.get(incoming)?.status !== 'prepared')} onClick={() => void preview.toggle(0, [outgoing, incoming])}>
          {preview.loading ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : preview.playing ? <Square /> : <Play />}
          {preview.loading ? 'Cancel preview' : preview.playing ? 'Stop preview' : 'Play preview'}
        </Button>
      </div>}
      {preview.loading && <p role="status" className="mt-3 text-sm text-muted">Preparing preview… press again to cancel.</p>}
      {preview.message && <p role="status" className="mt-3 text-sm text-muted">{preview.message}</p>}
    </section>

    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
      <section className="order-2 min-w-0 border border-ink lg:order-1" aria-labelledby="subbeats-candidates">
        <div className="border-b border-ink p-4">
          <h2 id="subbeats-candidates" className="font-display text-xl font-bold">Tracks to explore</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">Tempo and existing beat data suggest starting points. Deeper analysis checks the recording; these suggestions are not confirmed driving beats.</p>
          <label htmlFor="subbeats-search" className="mt-4 mb-1 block text-sm font-medium">Search your library</label>
          <Input id="subbeats-search" type="search" placeholder="Artist, track or album" value={query} onChange={e => {
            setQuery(e.target.value); setOffset(0); setSelected(new Set());
          }} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <Checkbox className="size-6" checked={selectable.length > 0 && selectable.every(r => selected.has(r.id))}
                disabled={!selectable.length || candidates.isFetching || !state.data}
                onCheckedChange={checked => setSelected(checked === true ? new Set(selectable.map(r => r.id)) : new Set())} />
              Select this page
            </label>
            <Button variant="solid" disabled={!selected.size || enqueue.isPending || !state.data} onClick={() => enqueue.mutate([...selected])}>
              <Plus /> {enqueue.isPending ? 'Adding…' : `Queue analysis${selected.size ? ` (${selected.size})` : ''}`}
            </Button>
          </div>
        </div>
        {candidates.isLoading && <p role="status" className="p-4 text-sm text-muted">Finding tracks…</p>}
        {candidates.isError && <div role="alert" className="flex flex-wrap items-center gap-3 p-4 text-sm">Could not load tracks.<Button onClick={() => void candidates.refetch()}>Retry</Button></div>}
        {!candidates.isLoading && !candidates.isError && !rows.length && <p className="p-6 text-sm text-muted">{q ? 'No matching tracks. Try another artist, title or album.' : 'No suggestions yet. Search for a track you would like to analyse.'}</p>}
        <ul className="divide-y divide-ink/20">
          {rows.map(row => {
            const job = byId.get(row.id);
            return <li key={row.id} className="flex items-start gap-3 p-4">
              <Checkbox className="mt-0.5 size-6 shrink-0" aria-label={`Select ${row.title} by ${row.artist}`}
                checked={selected.has(row.id)} disabled={finished(job?.status) || !state.data || enqueue.isPending}
                onCheckedChange={checked => setSelected(prev => { const next = new Set(prev); if (checked === true) next.add(row.id); else next.delete(row.id); return next; })} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold break-words text-ink">{row.title || 'Untitled track'}</p>
                <p className="text-sm break-words text-muted">{row.artist}</p>
                <p className="mt-1 text-xs break-words text-muted">{row.album}</p>
                <p className="mt-2 text-xs text-muted">{job ? LABEL[job.status] : row.hasBeatGrid ? 'Beat data available' : 'Tempo estimate only'}</p>
              </div>
              <span className="shrink-0 text-right text-sm text-ink tabular-nums">{row.bpm ? row.bpm.toFixed(1) : '—'}<span className="block text-xs text-muted">BPM</span></span>
            </li>;
          })}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t border-ink p-4">
          <Button disabled={offset === 0 || candidates.isFetching} onClick={() => changePage(Math.max(0, offset - 50))}>Previous</Button>
          <span className="text-xs text-muted tabular-nums">Page {offset / 50 + 1}</span>
          <Button disabled={!candidates.data?.hasMore || candidates.isFetching} onClick={() => changePage(offset + 50)}>Next</Button>
        </div>
      </section>

      <section className="order-1 min-w-0 self-start border border-ink lg:order-2" aria-labelledby="subbeats-preparation">
        <div className="border-b border-ink p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="subbeats-preparation" className="font-display text-xl font-bold">Preparation</h2>
            <Button disabled={!state.data || pause.isPending || (!pending && !state.data.paused)} onClick={() => pause.mutate(!state.data?.paused)}>
              {state.data?.paused ? <Play /> : <Pause />}{state.data?.paused ? 'Resume' : 'Pause'}
            </Button>
          </div>
          <p className="mt-3 text-sm tabular-nums" aria-live="polite">{state.isLoading ? 'Loading progress…' : `${prepared} prepared · ${pending} remaining`}</p>
          <p className="mt-2 text-sm leading-relaxed break-words text-muted">{state.data?.paused ? 'Paused. Any track already being prepared will finish first.' : state.data?.progress && pending ? state.data.progress : pending ? 'Queued tracks will run when library analysis is available.' : 'Choose tracks to prepare. Saved results are reused.'}</p>
          <p className="mt-3 text-xs text-muted">Preparation respects your analysis quiet-time setting. Separate cache: 5 GB limit.</p>
        </div>
        {!jobs.length && <p className="p-6 text-sm text-muted">Your preparation list is empty. Select tracks and choose Queue analysis.</p>}
        <ul className="divide-y divide-ink/20">
          {(showAll ? ranked : ranked.slice(0, 20)).map(job => <li key={job.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-sm font-semibold break-words">{job.title}</p><p className="text-sm break-words text-muted">{job.artist}</p></div>
              {(job.status !== 'queued' && job.status !== 'running') && <Button size="sm" disabled={enqueue.isPending} onClick={() => enqueue.mutate([job.id])}>{job.status === 'prepared' || job.status === 'unmeasurable' ? 'Recheck' : 'Retry'}</Button>}
            </div>
            <p className="mt-2 text-xs font-medium" role={job.status === 'running' ? 'status' : undefined}>{LABEL[job.status]}</p>
            {job.error && <p className="mt-1 text-xs leading-relaxed break-words text-muted">{job.error}</p>}
          </li>)}
        </ul>
        {ranked.length > 20 && <div className="border-t border-ink p-4"><Button onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${ranked.length} tracks`}</Button></div>}
      </section>
    </div>
  </div>;
}
