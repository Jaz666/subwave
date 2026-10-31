'use client';

import { SubbeatsCache, useSubbeatsCache } from './subbeats/SubbeatsCache';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useDebounceValue } from 'usehooks-ts';
import { z } from 'zod';
import { ArrowLeft, Pause, Play, Plus, RefreshCw, Square, Loader2, Search, ListMusic, Music, HardDrive } from 'lucide-react';
import { useAdminAuth } from '../../lib/adminAuth';
import { adminJson, useAdminMutation, useAdminQuery } from '../../lib/admin-query';
import { SUBBEATS_BATCH_LIMIT, SUBBEATS_PAGE_SIZE, SUBBEATS_QUEUE_LIMIT, subbeatsCandidatePageSchema, subbeatsViewSchema, type subbeatsStatusSchema } from '../../lib/schemas.generated';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useJoinPreview } from './library/useJoinPreview';
import { Checkbox } from '../ui/checkbox';
import { selectSubbeatsRows, subbeatsCanSelect, type SubbeatsCandidate } from './library/subbeats-selection';
import { subbeatsInitialBrowse, useSubbeatsWorkspace, type SubbeatsBrowseState, type SubbeatsPage } from './subbeats/SubbeatsWorkspace';

const subbeatsKeys = {
  state: ['library', 'subbeats', 'state'] as const,
  candidates: (q: string, offset: number, scope: string, genre: string, status: string, sort: string) => ['library', 'subbeats', 'candidates', q, scope, genre, status, sort, offset] as const,
};
type Status = z.infer<typeof subbeatsStatusSchema>;
const LABEL: Record<Status, string> = {
  queued: 'Queued', running: 'Preparing', prepared: 'Prepared', unmeasurable: 'No reliable beat data',
  unavailable: 'Unavailable', failed: 'Needs retry',
};
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const SELECT_CLASS = 'h-11 w-full min-w-0 rounded-none border border-ink bg-bg px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
const BROWSE_LABEL = { 'not-started': 'Not started', ...LABEL };
const PAGES = [
  { id: 'explore', href: '/admin/library/subbeats', label: 'Explore', sub: 'find candidates', Icon: Search },
  { id: 'preparation', href: '/admin/library/subbeats/preparation', label: 'Preparation', sub: 'progress & retries', Icon: ListMusic },
  { id: 'prepared', href: '/admin/library/subbeats/prepared', label: 'Prepared tracks', sub: 'choose a pair', Icon: Music },
  { id: 'preview', href: '/admin/library/subbeats/preview', label: 'Preview', sub: 'listen & compare', Icon: Play },
  { id: 'cache', href: '/admin/library/subbeats/cache', label: 'Cache', sub: 'space & policy', Icon: HardDrive },
] as const;

export default function SubbeatsPanel({ page = 'explore' }: { page?: SubbeatsPage }) {
  const { adminFetch, hydrated, needsAuth } = useAdminAuth();
  const ready = hydrated && !needsAuth;
  const cache = useSubbeatsCache();
  const regularIds = new Set(cache.query.data?.policy.regularIds ?? []);
  const { browseRestored, selected, setSelected, browse, setBrowse, jobQuery, setJobQuery, jobStatus, setJobStatus,
    jobSort, setJobSort, jobPage, setJobPage, previewSearch, setPreviewSearch, outgoing, setOutgoing, incoming, setIncoming, barShift, setBarShift } = useSubbeatsWorkspace();
  const browsePage = page === 'prepared' ? 'prepared' : 'explore';
  const { query, offset, scope, genre, status, sort } = browse[browsePage];
  const updateBrowse = (patch: Partial<SubbeatsBrowseState>) => setBrowse(current => ({
    ...current, [browsePage]: { ...current[browsePage], ...patch },
  }));
  const setQuery = (query: string) => updateBrowse({ query });
  const setOffset = (offset: number) => updateBrowse({ offset });
  const setScope = (scope: SubbeatsBrowseState['scope']) => updateBrowse({ scope });
  const setGenre = (genre: string) => updateBrowse({ genre });
  const setStatus = (status: SubbeatsBrowseState['status']) => updateBrowse({ status });
  const [q] = useDebounceValue(query.trim(), 300);
  const browsing = page === 'explore' || page === 'prepared';
  const client = useQueryClient();
  const previousJobs = useRef<string | null>(null);
  const state = useAdminQuery({
    key: subbeatsKeys.state, adminFetch, enabled: ready, refetchInterval: 3000,
    request: async (fetcher, signal) => subbeatsViewSchema.parse(await adminJson(fetcher, '/library/subbeats', undefined, signal)),
  });
  const preview = useJoinPreview(JSON.stringify([outgoing, incoming, ready, barShift]), adminFetch, '/library/subbeats/join-preview');
  const candidates = useAdminQuery({
    key: subbeatsKeys.candidates(q, offset, scope, genre, status, sort), adminFetch, enabled: ready && browsing && browseRestored,
    request: async (fetcher, signal) => subbeatsCandidatePageSchema.parse(await adminJson(fetcher,
      `/library/subbeats/candidates?${new URLSearchParams({ q, offset: String(offset), scope, genre, status, sort })}`, undefined, signal)),
  });
  const enqueue = useAdminMutation({
    adminFetch,
    request: async (ids: string[], fetcher) => subbeatsViewSchema.parse(await adminJson(fetcher, '/library/subbeats/queue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
    })),
    onDone: async (view, ids, client) => { await client.cancelQueries({ queryKey: subbeatsKeys.state, exact: true }); client.setQueryData(subbeatsKeys.state, view); setSelected(current => current.filter(row => !ids.includes(row.id))); },
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
  const pageOffset = candidates.data?.offset ?? offset;
  const selection = selectSubbeatsRows(selected, [], jobs);
  const selectedIds = new Set(selection.map(row => row.id));
  const selectable = rows.filter(row => subbeatsCanSelect(byId.get(row.id)?.status ?? row.status));
  const selectionOnPage = rows.filter(row => selectedIds.has(row.id)).length;
  const pageSelection = selectSubbeatsRows(selection, selectable, jobs);
  const pageCanAdd = pageSelection.length > selection.length;
  const pageHasSelection = selectable.some(row => selectedIds.has(row.id));
  const matchingSelection = selectSubbeatsRows(selection, candidates.data?.selectableRows ?? [], jobs);
  const pending = jobs.filter(j => j.status === 'queued' || j.status === 'running').length;
  const prepared = jobs.filter(j => j.status === 'prepared').length;
  const ranked = jobs.filter(job => (jobStatus === 'all' || job.status === jobStatus)
    && `${job.artist} ${job.title} ${job.album}`.toLowerCase().includes(jobQuery.trim().toLowerCase())).sort((a, b) => {
    const priority = (s: Status) => s === 'running' ? 0 : s === 'queued' ? 1 : s === 'failed' || s === 'unavailable' ? 2 : 3;
    const names = a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' }) || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
    if (jobSort === 'artist') return names;
    if (jobSort === 'title') return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || names;
    if (jobSort === 'oldest') return a.updatedAt.localeCompare(b.updatedAt) || names;
    if (jobSort === 'newest') return b.updatedAt.localeCompare(a.updatedAt) || names;
    return priority(a.status) - priority(b.status) || b.updatedAt.localeCompare(a.updatedAt) || names;
  });
  const activeJobPage = Math.min(jobPage, Math.max(0, Math.ceil(ranked.length / 20) - 1));
  const previewJobs = jobs.filter(job => job.status === 'prepared' && (job.id === outgoing || job.id === incoming
    || `${job.artist} ${job.title} ${job.album}`.toLowerCase().includes(previewSearch.trim().toLowerCase())));
  const currentStage = preview.timeline?.events.reduce((label, event) => event.at <= preview.position ? event.label : label, '');
  const changePage = (next: number) => { setOffset(next); };
  const jobVersion = state.data ? jobs.map(job => `${job.id}:${job.status}`).join('|') : null;
  useEffect(() => {
    if (jobVersion === null) { previousJobs.current = null; return; }
    if (previousJobs.current !== null && previousJobs.current !== jobVersion) {
      void client.invalidateQueries({ queryKey: ['library', 'subbeats', 'candidates'] });
    }
    previousJobs.current = jobVersion;
  }, [client, jobVersion]);
  const addRows = (added: SubbeatsCandidate[]) => setSelected(current => selectSubbeatsRows(current, added, jobs));

  const pagination = <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-ink p-4" aria-label="Track pagination">
    <Button className="min-h-11" disabled={pageOffset === 0 || candidates.isFetching} onClick={() => changePage(Math.max(0, pageOffset - SUBBEATS_PAGE_SIZE))}>Previous</Button>
    <span className="text-xs text-muted tabular-nums">{candidates.data?.total ? `${pageOffset + 1}–${Math.min(pageOffset + rows.length, candidates.data.total)} of ${candidates.data.total.toLocaleString()}` : '0 tracks'}</span>
    <Button className="min-h-11" disabled={!candidates.data?.hasMore || candidates.isFetching} onClick={() => changePage(pageOffset + SUBBEATS_PAGE_SIZE)}>Next</Button>
  </nav>;

  return <div className="grid min-w-0 gap-6">
    <header>
      <Link href="/admin/library" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted underline-offset-4 hover:text-ink hover:underline"><ArrowLeft size={14} /> Library</Link>
      <h1 className="font-display text-3xl font-bold text-ink">Sub/Beats</h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">{
        page === 'explore' ? 'Find dance-music candidates and choose tracks for deeper analysis.'
          : page === 'preparation' ? 'Monitor preparation, pause queued work and retry individual tracks. Work continues when you leave this page.'
            : page === 'prepared' ? 'Find prepared recordings and choose an outgoing and incoming track to audition.'
              : page === 'cache' ? 'Manage regular stem caching and check the space available.'
              : 'Audition a prepared pair. Station playback continues using your existing transitions.'
      }</p>
    </header>

    <nav aria-label="Sub/Beats pages" className="lib-tabs !flex-wrap">
      {PAGES.map(({ id, href, label, sub, Icon }) => <Link key={id} href={href} aria-current={page === id ? 'page' : undefined}
        className={`lib-tab !min-h-11 !px-2.5 sm:!px-[18px] ${page === id ? 'on' : ''}`}>
        <Icon size={17} /><span className="min-w-0"><span className="lib-tab-name">{label}</span><span className="lib-tab-sub !hidden sm:!block">{sub}</span></span>
      </Link>)}
    </nav>

    {state.isError && <div role="alert" className="flex flex-wrap items-center gap-3 border border-ink p-4 text-sm">
      <span>Could not load preparation progress. Your saved list has been kept.</span>
      <Button className="min-h-11" onClick={() => void state.refetch()}><RefreshCw /> Retry</Button>
    </div>}

    {page === 'cache' && <SubbeatsCache cache={cache} />}

    {page === 'preview' && <section className="min-w-0 border border-ink p-4" aria-labelledby="subbeats-preview">
      <h2 id="subbeats-preview" className="font-display text-xl font-bold">Preview a transition</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">Choose two prepared tracks to audition a 16-bar, beat-matched stem exchange.</p>
      <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted">Incoming tempo stays matched until the preview ends. Use the bar shift below to compare alignments.</p>
      {prepared >= 2 && <div className="mt-4 max-w-sm"><label htmlFor="subbeats-preview-search" className="mb-1 block text-sm font-medium">Find prepared tracks</label><Input className="min-h-11" id="subbeats-preview-search" type="search" value={previewSearch} onChange={event => setPreviewSearch(event.target.value)} placeholder="Artist, track or album" /></div>}
      {prepared < 2 ? <div className="mt-4 text-sm"><p className="text-muted">Prepare at least two tracks to try a transition.</p><Link href="/admin/library/subbeats" className="inline-flex min-h-11 items-center underline underline-offset-4">Explore tracks</Link></div> : <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        {([{ id: 'subbeats-outgoing', label: 'Outgoing track', value: outgoing, change: setOutgoing, other: incoming },
          { id: 'subbeats-incoming', label: 'Incoming track', value: incoming, change: setIncoming, other: outgoing }]).map(field => <div key={field.id} className="min-w-0">
          <label htmlFor={field.id} className="mb-1 block text-sm font-medium">{field.label}</label>
          <select id={field.id} className="h-11 w-full min-w-0 rounded-none border border-ink bg-bg px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" value={field.value} onChange={e => { field.change(e.target.value); setBarShift(0); }}>
            <option value="">Choose a prepared track</option>
            {previewJobs.map(j => <option key={j.id} value={j.id} disabled={j.id === field.other}>{j.artist} — {j.title}</option>)}
          </select>
        </div>)}
        <Button className="min-h-11 self-end" variant="solid" disabled={!preview.loading && !preview.playing && (!ready || !outgoing || !incoming || outgoing === incoming || byId.get(outgoing)?.status !== 'prepared' || byId.get(incoming)?.status !== 'prepared')} onClick={() => void preview.toggle(0, [outgoing, incoming], { barShift })}>
          {preview.loading ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : preview.playing ? <Square /> : <Play />}
          {preview.loading ? 'Cancel preview' : preview.playing ? 'Stop preview' : 'Play preview'}
        </Button>
      </div>}
      {prepared >= 2 && <div className="mt-4 max-w-sm">
        <label htmlFor="subbeats-bar-shift" className="mb-1 block text-sm font-medium">Incoming bar shift · testing</label>
        <select id="subbeats-bar-shift" className="h-11 w-full rounded-none border border-ink bg-bg px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" value={barShift} onChange={event => setBarShift(Number(event.target.value))}>
          <option value={-2}>−2 bars · earlier</option>
          <option value={-1}>−1 bar · earlier</option>
          <option value={0}>0 · original alignment</option>
          <option value={1}>+1 bar · later</option>
          <option value={2}>+2 bars · later</option>
        </select>
        <p className="mt-2 text-xs leading-relaxed text-muted">Moves the incoming audio by whole bars, keeping the tempo matched. Press Play preview to compare. Resets when you change tracks.</p>
      </div>}
      {preview.loading && <p role="status" className="mt-3 text-sm text-muted">Preparing preview… press again to cancel.</p>}
      {preview.message && <p role="status" className="mt-3 text-sm text-muted">{preview.message}</p>}
      {preview.duration > 0 && <div className="mt-5 border-t border-ink/20 pt-4">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="subbeats-preview-position" className="text-sm font-medium">Preview timeline · testing</label>
          <span className="shrink-0 font-mono text-xs text-muted tabular-nums">{clock(preview.position)} / {clock(preview.duration)}</span>
        </div>
        <input id="subbeats-preview-position" type="range" min={0} max={preview.duration} step={0.1} value={Math.min(preview.position, preview.duration)}
          className="mt-2 h-11 w-full cursor-pointer accent-ink" aria-valuetext={`${clock(preview.position)} of ${clock(preview.duration)}`}
          onChange={event => preview.seek(Number(event.target.value))} />
        {currentStage && <p role="status" className="mt-1 text-sm font-medium text-ink">{currentStage}</p>}
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted">Stages show the rendered stem fades and vocal handover, not automatically detected phrases. Select a time to jump there.</p>
        {preview.timeline ? <ol className="mt-3 grid gap-1">
          {preview.timeline.events.map((event, index) => {
            const current = preview.position >= event.at && (index === preview.timeline!.events.length - 1 || preview.position < preview.timeline!.events[index + 1]!.at);
            return <li key={`${event.at}-${index}`} aria-current={current ? 'step' : undefined}>
              <button type="button" onClick={() => preview.seek(event.at)} className={`grid min-h-11 w-full grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-2 border-l-2 px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${current ? 'border-ink bg-ink-soft font-medium text-ink' : 'border-transparent text-muted hover:bg-ink-soft hover:text-ink'}`}>
                <span className="font-mono text-xs tabular-nums">{clock(event.at)}</span><span className="break-words">{event.label}</span>
              </button>
            </li>;
          })}
        </ol> : <p className="mt-3 text-sm text-muted">Stage timing is unavailable for this preview.</p>}
      </div>}

    </section>}

    <div className="grid min-w-0 gap-6">
      {browsing && <section className="min-w-0 border border-ink" aria-labelledby="subbeats-candidates" aria-busy={candidates.isFetching}>
        <div className="border-b border-ink p-4">
          <h2 id="subbeats-candidates" className="font-display text-xl font-bold">{page === 'prepared' ? 'Prepared tracks' : 'Tracks to explore'}</h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted">{page === 'prepared' ? 'Prepared resources are saved for reuse. Choose a pair here, then open Preview to listen.' : 'Suggestions focus on dance-music genres, ranked using existing tempo and beat data. Deeper analysis checks the recording; genre alone does not confirm a driving beat.'}</p>
          <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted">Regular stem inclusion is separate from deeper Sub/Beats preparation. It bypasses selective cache criteria, with the normal priority and space budget.</p>
          {page === 'prepared' && (outgoing || incoming) && <div className="mt-3 flex flex-wrap items-center gap-3 text-sm" role="status">
            <span>Outgoing: {byId.get(outgoing)?.title || 'Choose a track'} · Incoming: {byId.get(incoming)?.title || 'Choose a track'}</span>
            <Link href="/admin/library/subbeats/preview" className="min-h-11 py-3 underline underline-offset-4">Open preview</Link>
          </div>}
          <div className={page === 'prepared' ? 'mt-4 grid min-w-0 gap-3 sm:grid-cols-2' : 'mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4'}>
            {page === 'explore' && <div><label htmlFor="subbeats-scope" className="mb-1 block text-sm font-medium">Collection</label>
              <select id="subbeats-scope" className={SELECT_CLASS} value={scope} onChange={event => {
                setScope(event.target.value as typeof scope); setGenre(''); setStatus('all'); setOffset(0);
              }}><option value="dance">Dance candidates</option><option value="library">Entire library</option></select>
            </div>}
            <div><label htmlFor="subbeats-genre" className="mb-1 block text-sm font-medium">Genre</label>
              <select id="subbeats-genre" className={SELECT_CLASS} value={genre} onChange={event => { setGenre(event.target.value); setOffset(0); }}>
                <option value="">All genres</option>
                {genre && !candidates.data?.genres.some(item => item.value === genre) && <option value={genre}>{genre}</option>}
                {candidates.data?.genres.map(item => <option key={item.value} value={item.value}>{item.value} ({item.count.toLocaleString()})</option>)}
              </select>
            </div>
            {page === 'explore' && <div><label htmlFor="subbeats-status" className="mb-1 block text-sm font-medium">Analysis status</label>
              <select id="subbeats-status" className={SELECT_CLASS} value={status} onChange={event => { setStatus(event.target.value as SubbeatsBrowseState['status']); setOffset(0); }}>
                <option value="all">All statuses</option>
                {Object.entries(BROWSE_LABEL).map(([value, label]) => <option key={value} value={value}>{label} ({candidates.data?.statuses.find(item => item.value === value)?.count ?? 0})</option>)}
              </select>
            </div>}
            <div><label htmlFor="subbeats-sort" className="mb-1 block text-sm font-medium">Sort by</label>
              <select id="subbeats-sort" className={SELECT_CLASS} value={sort} onChange={event => updateBrowse({ sort: event.target.value as SubbeatsBrowseState['sort'], offset: 0 })}>
                <option value="recommended">Beat evidence first</option>
                <option value="artist-asc">Artist · A–Z</option><option value="artist-desc">Artist · Z–A</option>
                <option value="title-asc">Track title · A–Z</option><option value="title-desc">Track title · Z–A</option>
                <option value="album-asc">Album · A–Z</option>
                <option value="bpm-asc">BPM · low to high</option><option value="bpm-desc">BPM · high to low</option>
              </select>
            </div>
          </div>
          <label htmlFor="subbeats-search" className="mt-4 mb-1 block text-sm font-medium">Search this collection</label>
          <Input className="min-h-11" id="subbeats-search" type="search" maxLength={200} placeholder="Artist, track or album" value={query} onChange={e => {
            setQuery(e.target.value); setOffset(0);
          }} />
          <Button className="mt-3 min-h-11" disabled={!query && !genre && sort === 'recommended' && status === 'all' && scope === (page === 'prepared' ? 'prepared' : 'dance')} onClick={() => setBrowse(current => ({ ...current, [browsePage]: subbeatsInitialBrowse(page === 'prepared' ? 'prepared' : 'dance') }))}>Reset filters</Button>
          {page === 'explore' && <p className="mt-2 text-xs leading-relaxed text-muted">Choose Entire library to find tracks outside the dance suggestions or without tempo data.</p>}
          <p className="mt-3 text-sm tabular-nums" role="status">{candidates.data ? `${candidates.data.total.toLocaleString()} matching tracks${page === 'explore' ? ` · ${candidates.data.selectableCount.toLocaleString()} available to queue` : ''}` : 'Loading matching counts…'}</p>
          {page === 'explore' && <><div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-11 items-center gap-2 text-sm">
              <Checkbox className="size-6" checked={selectable.length > 0 && selectable.every(row => selectedIds.has(row.id)) ? true : selectable.some(row => selectedIds.has(row.id)) ? 'indeterminate' : false}
                aria-describedby="subbeats-selection-limit" disabled={!selectable.length || (!pageCanAdd && !pageHasSelection) || candidates.isFetching || query.trim() !== q || !state.data || enqueue.isPending}
                onCheckedChange={() => pageCanAdd ? addRows(selectable) : setSelected(current => current.filter(row => !selectable.some(item => item.id === row.id)))} />
              Select this page
            </label>
            <Button className="min-h-11" disabled={candidates.isFetching || query.trim() !== q || !state.data || enqueue.isPending || matchingSelection.length <= selection.length}
              onClick={() => addRows(candidates.data?.selectableRows ?? [])}>
              {candidates.data && candidates.data.selectableCount <= SUBBEATS_BATCH_LIMIT ? `Select matching · ${candidates.data.selectableCount} available` : `Select matching · up to ${SUBBEATS_BATCH_LIMIT}`}
            </Button>
          </div>
          <p id="subbeats-selection-limit" className="mt-2 text-xs text-muted" role="status">{selection.length >= SUBBEATS_BATCH_LIMIT ? 'Batch limit reached. Remove selected tracks or queue this batch before selecting more.' : jobs.length + selection.filter(row => !byId.has(row.id)).length >= SUBBEATS_QUEUE_LIMIT ? 'Preparation list capacity reached. Existing failed or unavailable entries can still be selected for retry.' : ''}</p>
          <div className="mt-3 border-t border-ink/20 pt-3">
            <p className="text-sm tabular-nums" aria-live="polite">{selection.length} selected{selection.length > selectionOnPage ? ` · ${selection.length - selectionOnPage} on other pages or filters` : ''}</p>
            <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted">Selections carry across pages and filters. Up to {SUBBEATS_BATCH_LIMIT} tracks per batch; {jobs.length} of {SUBBEATS_QUEUE_LIMIT} preparation entries used. Prepared audio has a separate 5 GB limit.</p>
            {jobs.length >= SUBBEATS_QUEUE_LIMIT && <p className="mt-2 text-sm">The preparation list is full. Existing failed or unavailable entries can still be retried.</p>}
            <div className="mt-3 flex flex-wrap gap-3">
              <Button className="min-h-11" variant="solid" disabled={!selection.length || enqueue.isPending || !state.data || query.trim() !== q} onClick={() => enqueue.mutate(selection.map(row => row.id))}>
                <Plus /> {enqueue.isPending ? 'Adding…' : `Queue analysis (${selection.length})`}
              </Button>
              <Button className="min-h-11" disabled={!selected.length || enqueue.isPending} onClick={() => setSelected([])}>Clear selection</Button>
            </div>
            {selection.length > 0 && <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm underline">Review selected tracks</summary>
              <ul className="max-h-64 divide-y divide-ink/20 overflow-y-auto">{selection.map(row => <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 break-words">{row.artist} — {row.title}</span><Button className="min-h-11 shrink-0" aria-label={`Remove ${row.title} from selection`} disabled={enqueue.isPending} onClick={() => setSelected(current => current.filter(item => item.id !== row.id))}>Remove</Button>
              </li>)}</ul>
            </details>}
          </div></>}
        </div>
        {candidates.isLoading && <p role="status" className="p-4 text-sm text-muted">Finding tracks…</p>}
        {candidates.isError && <div role="alert" className="flex flex-wrap items-center gap-3 p-4 text-sm">Could not load tracks.<Button className="min-h-11" onClick={() => void candidates.refetch()}>Retry</Button></div>}
        {!candidates.isLoading && !candidates.isError && !rows.length && <p className="p-6 text-sm text-muted">{page === 'prepared' ? 'No prepared tracks match. Clear the search or choose another genre.' : 'No tracks match these filters. Try another genre or status, clear the search, or choose Entire library.'}{page === 'prepared' && <Link href="/admin/library/subbeats" className="mt-2 flex min-h-11 items-center underline underline-offset-4">Explore tracks to prepare more</Link>}</p>}
        {cache.update.isError && <p role="alert" className="p-4 text-sm">Could not save regular stem inclusion. Your previous choice is still shown. Try again.</p>}
        {cache.query.isError && <p role="alert" className="p-4 text-sm">Regular stem choices are unavailable. <button className="min-h-11 underline underline-offset-4" onClick={() => void cache.query.refetch()}>Retry</button></p>}
        {pagination}
        <ul className="divide-y divide-ink/20">
          {rows.map(row => {
            const job = byId.get(row.id);
            return <li key={row.id} className="flex items-start gap-3 p-4 lg:items-center lg:py-2">
              {page === 'explore' && <label className="flex size-11 shrink-0 items-center justify-center lg:size-6 [@media(pointer:coarse)]:size-11"><Checkbox className="size-6" aria-label={`Select ${row.title} by ${row.artist}`}
                checked={selectedIds.has(row.id)} disabled={!subbeatsCanSelect(job?.status ?? row.status) || !state.data || enqueue.isPending || (!selectedIds.has(row.id) && selectSubbeatsRows(selection, [row], jobs).length === selection.length)}
                onCheckedChange={checked => checked === true ? addRows([row]) : setSelected(current => current.filter(item => item.id !== row.id))} /></label>}
              <div className="min-w-0 flex-1 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-x-4">
                <div className="min-w-0"><p className="text-sm font-semibold break-words text-ink">{row.title || 'Untitled track'}</p>
                <p className="text-sm break-words text-muted">{row.artist}</p>
                <p className="mt-1 text-xs break-words text-muted lg:mt-0">{row.album}</p></div>
                <p className="mt-1 text-xs break-words text-muted lg:mt-0">{row.genres.join(' · ')}</p>
                <p className="mt-2 text-xs text-muted lg:mt-0">{BROWSE_LABEL[job?.status ?? row.status]} · {row.hasBeatGrid ? 'Beat data available' : row.bpm ? 'Tempo estimate only' : 'No tempo data'}</p>
                <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-xs lg:col-span-3">
                  <Checkbox aria-label={`Include ${row.title} by ${row.artist} in regular stem caching`} checked={regularIds.has(row.id)}
                    disabled={!cache.query.data || cache.query.isError || cache.update.isPending}
                    onCheckedChange={checked => cache.update.mutate({ track: { id: row.id, include: checked === true } })} />
                  Include in regular stem caching
                </label>
                {page === 'prepared' && <div className="mt-3 flex flex-wrap gap-2 lg:col-span-3">
                  <Button className="min-h-11" aria-pressed={outgoing === row.id} disabled={incoming === row.id} onClick={() => { setOutgoing(row.id); setBarShift(0); }}>{outgoing === row.id ? 'Outgoing selected' : 'Use as outgoing'}</Button>
                  <Button className="min-h-11" aria-pressed={incoming === row.id} disabled={outgoing === row.id} onClick={() => { setIncoming(row.id); setBarShift(0); }}>{incoming === row.id ? 'Incoming selected' : 'Use as incoming'}</Button>
                </div>}
              </div>
              <span className="shrink-0 text-right text-sm text-ink tabular-nums">{row.bpm ? row.bpm.toFixed(1) : '—'}<span className="block text-xs text-muted">BPM</span></span>
            </li>;
          })}
        </ul>
        {pagination}
      </section>}

      {page === 'preparation' && <section className="order-2 min-w-0 self-start border border-ink" aria-labelledby="subbeats-preparation">
        <div className="border-b border-ink p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="subbeats-preparation" className="font-display text-xl font-bold">Preparation</h2>
            <Button className="min-h-11" disabled={!state.data || pause.isPending || (!pending && !state.data.paused)} onClick={() => pause.mutate(!state.data?.paused)}>
              {state.data?.paused ? <Play /> : <Pause />}{state.data?.paused ? 'Resume' : 'Pause'}
            </Button>
          </div>
          <p className="mt-3 text-sm tabular-nums" aria-live="polite">{state.isLoading ? 'Loading progress…' : `${prepared} prepared · ${pending} remaining`}</p>
          <p className="mt-2 text-sm leading-relaxed break-words text-muted">{state.data?.paused ? 'Paused. Any track already being prepared will finish first.' : state.data?.progress && pending ? state.data.progress : pending ? 'Queued tracks will run when library analysis is available.' : 'Choose tracks to prepare. Saved results are reused.'}</p>
          <p className="mt-3 text-xs text-muted">Preparation respects your analysis quiet-time setting. Saved results use the separate 5 GB cache; the list holds up to 500 entries.</p>
        </div>
        <div className="grid gap-3 border-b border-ink p-4">
          <div><label htmlFor="subbeats-job-search" className="mb-1 block text-sm font-medium">Find preparation entries</label><Input className="min-h-11" id="subbeats-job-search" type="search" value={jobQuery} placeholder="Artist, track or album" onChange={event => { setJobQuery(event.target.value); setJobPage(0); }} /></div>
          <div><label htmlFor="subbeats-job-status" className="mb-1 block text-sm font-medium">Preparation status</label><select id="subbeats-job-status" className={SELECT_CLASS} value={jobStatus} onChange={event => { setJobStatus(event.target.value); setJobPage(0); }}><option value="all">All entries ({jobs.length})</option>{Object.entries(LABEL).map(([value, label]) => <option key={value} value={value}>{label} ({jobs.filter(job => job.status === value).length})</option>)}</select></div>
          <div><label htmlFor="subbeats-job-sort" className="mb-1 block text-sm font-medium">Sort by</label>
            <select id="subbeats-job-sort" className={SELECT_CLASS} value={jobSort} onChange={event => { setJobSort(event.target.value); setJobPage(0); }}>
              <option value="priority">Active &amp; needs attention first</option><option value="newest">Recently updated</option>
              <option value="oldest">Oldest update first</option><option value="artist">Artist · A–Z</option><option value="title">Track title · A–Z</option>
            </select>
          </div>
        </div>
        {jobs.length > 0 && !ranked.length && <p className="p-4 text-sm text-muted">No preparation entries match. Clear the search or choose another status.</p>}
        {!jobs.length && <div className="p-6 text-sm"><p className="text-muted">Your preparation list is empty. Choose tracks on Explore, then select Queue analysis.</p><Link href="/admin/library/subbeats" className="inline-flex min-h-11 items-center underline underline-offset-4">Explore tracks</Link></div>}
        <ul className="divide-y divide-ink/20">
          {ranked.slice(activeJobPage * 20, (activeJobPage + 1) * 20).map(job => <li key={job.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-sm font-semibold break-words">{job.title}</p><p className="text-sm break-words text-muted">{job.artist}</p></div>
              {(job.status !== 'queued' && job.status !== 'running') && <Button className="min-h-11" size="sm" disabled={enqueue.isPending} onClick={() => enqueue.mutate([job.id])}>{job.status === 'prepared' || job.status === 'unmeasurable' ? 'Recheck' : 'Retry'}</Button>}
            </div>
            <p className="mt-2 text-xs font-medium" role={job.status === 'running' ? 'status' : undefined}>{LABEL[job.status]}</p>
            {job.error && <p className="mt-1 text-xs leading-relaxed break-words text-muted">{job.error}</p>}
          </li>)}
        </ul>
        {ranked.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink p-4">
          <Button className="min-h-11" disabled={activeJobPage === 0} onClick={() => setJobPage(activeJobPage - 1)}>Previous entries</Button>
          <span className="text-xs tabular-nums">{activeJobPage * 20 + 1}–{Math.min((activeJobPage + 1) * 20, ranked.length)} of {ranked.length}</span>
          <Button className="min-h-11" disabled={(activeJobPage + 1) * 20 >= ranked.length} onClick={() => setJobPage(activeJobPage + 1)}>Next entries</Button>
        </div>}
      </section>}
    </div>
  </div>;
}
