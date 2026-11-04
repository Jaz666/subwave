'use client';

import { SubbeatsCache, useSubbeatsCache } from './subbeats/SubbeatsCache';
import { CueAudition } from './subbeats/CueAudition';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useDebounceValue } from 'usehooks-ts';
import { z } from 'zod';
import { ArrowLeft, Pause, Play, Plus, RefreshCw, Square, Loader2, Search, ListMusic, Music, HardDrive } from 'lucide-react';
import { useAdminAuth } from '../../lib/adminAuth';
import { AdminResponseError, adminJson, useAdminMutation, useAdminQuery } from '../../lib/admin-query';
import { SUBBEATS_BATCH_LIMIT, SUBBEATS_PAGE_SIZE, SUBBEATS_QUEUE_LIMIT, subbeatsCandidatePageSchema, subbeatsViewSchema, type subbeatsStatusSchema } from '../../lib/schemas.generated';
import { V3AlertDialog } from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { libraryKeys } from './library/queries';
import type { PlaylistSummary } from './library/types';
import { useJoinPreview } from './library/useJoinPreview';
import { Checkbox } from '../ui/checkbox';
import { selectPreparationIds, selectSubbeatsRows, subbeatsCanSelect, subbeatsOutgoingCues, subbeatsIncomingCues, type SubbeatsCandidate } from './library/subbeats-selection';
import { MIX_LABEL, SuitabilityDetails } from './library/subbeats-suitability';
import { subbeatsInitialBrowse, useSubbeatsWorkspace, type SubbeatsBrowseState, type SubbeatsPage } from './subbeats/SubbeatsWorkspace';

const subbeatsKeys = {
  state: ['library', 'subbeats', 'state'] as const,
  duration: (id: string) => ['library', 'subbeats', 'duration', id] as const,
  candidates: (q: string, offset: number, scope: string, genre: string, status: string, sort: string, mixing: string, playlistId:string) => ['library', 'subbeats', 'candidates', q, scope, genre, status, sort, mixing, playlistId, offset] as const,
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
  const { preparationMethod, setPreparationMethod, outCueIndex, setOutCueIndex, inCueIndex, setInCueIndex, browseRestored, jobSelected, setJobSelected, selected, setSelected, browse, setBrowse, jobQuery, setJobQuery, jobStatus, setJobStatus,
    jobSort, setJobSort, jobPage, setJobPage, previewSearch, setPreviewSearch, outgoing, setOutgoing, incoming, setIncoming } = useSubbeatsWorkspace();
  const browsePage = page === 'prepared' ? 'prepared' : 'explore';
  const { query, offset, scope, genre, status, sort, mixing, playlistId } = browse[browsePage];
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
  const preview = useJoinPreview(JSON.stringify([outgoing, incoming, ready, outCueIndex, inCueIndex, state.data?.jobs.filter(job => job.id === outgoing || job.id === incoming).map(job => [job.cuePoints?.artifactKey,job.cueCoverage?.artifactKey])]), adminFetch, '/library/subbeats/join-preview');
  const candidates = useAdminQuery({
    key: subbeatsKeys.candidates(q, offset, scope, genre, status, sort, mixing,playlistId), adminFetch, enabled: ready && browsing && browseRestored,
    request: async (fetcher, signal) => subbeatsCandidatePageSchema.parse(await adminJson(fetcher,
      `/library/subbeats/candidates?${new URLSearchParams({ q, offset: String(offset), scope, genre, status, sort, mixing, playlistId })}`, undefined, signal)),
  });
  const playlists = useAdminQuery({
    key:libraryKeys.playlists(),adminFetch,enabled:ready && page === 'explore' && scope === 'playlist',
    request:async (fetcher,signal) => (await adminJson<{playlists?:PlaylistSummary[]}>(fetcher,'/playlists',undefined,signal)).playlists ?? [],
  });
  const enqueue = useAdminMutation({
    adminFetch,
    request: async (ids: string[], fetcher) => subbeatsViewSchema.parse(await adminJson(fetcher, '/library/subbeats/queue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, method:preparationMethod }),
    })),
    onDone: async (view, ids, client) => { await client.cancelQueries({ queryKey: subbeatsKeys.state, exact: true }); client.setQueryData(subbeatsKeys.state, view); setSelected(current => current.filter(row => !ids.includes(row.id))); setJobSelected(current => current.filter(id => !ids.includes(id))); },
  });
  const assess = useAdminMutation({
    adminFetch,
    request: async (ids: string[], fetcher) => subbeatsViewSchema.parse(await adminJson(fetcher, '/library/subbeats/assess', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
    })),
    onDone: async (view, _ids, client) => {
      await client.cancelQueries({ queryKey: subbeatsKeys.state, exact: true });
      client.setQueryData(subbeatsKeys.state, view);
      setJobSelected(current => current.filter(id => !_ids.includes(id)));
      await client.invalidateQueries({ queryKey: ['library', 'subbeats', 'candidates'] });
    },
  });
  const upgradeCoverage = useAdminMutation({
    adminFetch,
    request:async (ids:string[],fetcher) => subbeatsViewSchema.parse(await adminJson(fetcher,'/library/subbeats/coverage',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids}),
    })),
    onDone:async (view,ids,client) => {
      await client.cancelQueries({queryKey:subbeatsKeys.state,exact:true});client.setQueryData(subbeatsKeys.state,view);
      setJobSelected(current => current.filter(id => !ids.includes(id)));
      await client.invalidateQueries({queryKey:['library','subbeats','candidates']});
    },
  });
  const pause = useAdminMutation({
    adminFetch,
    request: async (paused: boolean, fetcher) => subbeatsViewSchema.parse(await adminJson(fetcher, '/library/subbeats/pause', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused }),
    })),
    onDone: async (view, _paused, client) => { await client.cancelQueries({ queryKey: subbeatsKeys.state, exact: true }); client.setQueryData(subbeatsKeys.state, view); },
  });
  const [removing, setRemoving] = useState<{id:string; title:string; artist:string} | null>(null);
  const remove = useAdminMutation({adminFetch,
    request:async (id:string, fetcher) => subbeatsViewSchema.parse(await adminJson(fetcher, `/library/subbeats/entries/${encodeURIComponent(id)}`, {method:'DELETE'})),
    onDone:async (view, id, client) => {
      await client.cancelQueries({queryKey:subbeatsKeys.state,exact:true});
      client.setQueryData(subbeatsKeys.state,view);
      setSelected(current => current.filter(row => row.id !== id));
      await Promise.all([
        client.invalidateQueries({queryKey:['library','subbeats','candidates']}),
        client.invalidateQueries({queryKey:['library','subbeats','cache']}),
        client.invalidateQueries({queryKey:['library','subbeats','cleanup']}),
      ]);
    },
  });
  const [bulkRemoving, setBulkRemoving] = useState<string[] | null>(null);
  const [removeProgress, setRemoveProgress] = useState('');
  const batchRemove = useAdminMutation({
    adminFetch,
    request: async (ids: string[], fetcher) => {
      const removed: string[] = [];
      let view: z.infer<typeof subbeatsViewSchema> | null = null;
      let error = '';
      for (const id of ids) {
        setRemoveProgress(`Removing ${removed.length + 1} of ${ids.length} entries…`);
        try {
          view = subbeatsViewSchema.parse(await adminJson(fetcher, `/library/subbeats/entries/${encodeURIComponent(id)}`, { method: 'DELETE' }));
          removed.push(id);
        } catch (failure) { error = failure instanceof Error ? failure.message : 'Removal failed'; break; }
      }
      return { removed, view, error, total: ids.length };
    },
    onDone: async (result, _ids, client) => {
      await client.cancelQueries({ queryKey: subbeatsKeys.state, exact: true });
      if (result.view) client.setQueryData(subbeatsKeys.state, result.view);
      setJobSelected(current => current.filter(id => !result.removed.includes(id)));
      setSelected(current => current.filter(row => !result.removed.includes(row.id)));
      await Promise.all([
        client.invalidateQueries({ queryKey: subbeatsKeys.state, exact: true }),
        client.invalidateQueries({ queryKey: ['library', 'subbeats', 'candidates'] }),
        client.invalidateQueries({ queryKey: ['library', 'subbeats', 'cache'] }),
        client.invalidateQueries({ queryKey: ['library', 'subbeats', 'cleanup'] }),
      ]);
    },
  });
  const actionBusy = upgradeCoverage.isPending || enqueue.isPending || assess.isPending || remove.isPending || batchRemove.isPending;
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
  const unassessed = jobs.filter(job => job.bundleKey && !job.suitability && (job.status === 'prepared' || job.status === 'unmeasurable' || job.status === 'failed'));
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
  const selectedJobs = selectPreparationIds(jobSelected, [], jobs);
  const selectedJobSet = new Set(selectedJobs);
  const assessJobs = selectedJobs.filter(id => byId.get(id)?.bundleKey);
  const coverageJobs = selectedJobs.filter(id => byId.get(id)?.bundleKey && byId.get(id)?.cuePoints?.algorithmVersion === 5);
  const needsCoverage = jobs.filter(job => job.bundleKey && job.cuePoints?.algorithmVersion === 5 && !job.cueCoverage && !['queued','running'].includes(job.status));
  const pageJobs = ranked.slice(activeJobPage * 20, (activeJobPage + 1) * 20);
  const selectableJobs = pageJobs.filter(job => !['queued', 'running'].includes(job.status));
  const selectJobs = (ids: string[]) => setJobSelected(current => selectPreparationIds(current, ids, jobs));
  const previewJobs = jobs.filter(job => job.status === 'prepared' && (job.id === outgoing || job.id === incoming
    || `${job.artist} ${job.title} ${job.album}`.toLowerCase().includes(previewSearch.trim().toLowerCase()))).sort((a,b) => a.artist.localeCompare(b.artist,undefined,{sensitivity:'base'}) || a.title.localeCompare(b.title,undefined,{sensitivity:'base'}) || a.id.localeCompare(b.id));
  const currentStage = preview.timeline?.events.reduce((label, event) => event.at <= preview.position ? event.label : label, '');
  const changePage = (next: number) => { setOffset(next); };
  const jobVersion = state.data ? jobs.map(job => `${job.id}:${job.status}:${job.bundleKey ?? ''}:${job.suitability?.assessedAt ?? ''}:${job.cuePoints?.artifactKey ?? ''}:${job.cueCoverage?.artifactKey ?? ''}`).join('|') : null;
  useEffect(() => {
    if (jobVersion === null) { previousJobs.current = null; return; }
    if (previousJobs.current !== null && previousJobs.current !== jobVersion) {
      void client.invalidateQueries({ queryKey: ['library', 'subbeats', 'candidates'] });
    }
    previousJobs.current = jobVersion;
  }, [client, jobVersion]);
  useEffect(() => {
    if (!state.data) return;
    const currentJobs = state.data.jobs;
    setJobSelected(current => {
      const valid = selectPreparationIds(current, [], currentJobs);
      return valid.length === current.length ? current : valid;
    });
    const valid = new Set(state.data.jobs.filter(job => job.status === 'prepared').map(job => job.id));
    if (outgoing && !valid.has(outgoing)) { setOutgoing(''); }
    if (incoming && !valid.has(incoming)) { setIncoming(''); }
  },[state.data,outgoing,incoming,setOutgoing,setIncoming,setJobSelected]);
  const [soloRole,setSoloRole] = useState<'incoming'|'outgoing'|null>(null);
  const outgoingPoints = byId.get(outgoing)?.cuePoints?.algorithmVersion === 5 ? byId.get(outgoing)?.cuePoints : undefined;
  const outgoingTrack = useAdminQuery({
    key: subbeatsKeys.duration(outgoing), adminFetch, enabled: ready && page === 'preview' && !!outgoing,
    request: async (fetcher, signal) => z.object({ track: z.object({ durationSec: z.number().finite().positive().nullish() }) }).parse(
      await adminJson(fetcher, `/library/observatory/track/${encodeURIComponent(outgoing)}`, undefined, signal)),
  });
  const outgoingDuration = outgoingPoints?.durationSeconds ?? outgoingTrack.data?.track.durationSec;
  const outgoingCues = subbeatsOutgoingCues(outgoingPoints?.outgoing ?? [],outgoingDuration);
  const outgoingCue = outgoingCues.find(item => item.index === outCueIndex)?.cue;

  useEffect(() => {
    if (outgoingCues.length && !outgoingCues.some(item => item.index === outCueIndex)) setOutCueIndex(outgoingCues[0]!.index);
  }, [outgoingCues,outCueIndex,setOutCueIndex]);
  const cueIncoming = previewJobs.filter(job => job.id !== outgoing && job.bundleKey);
  const incomingCues = subbeatsIncomingCues(byId.get(incoming)?.cuePoints?.algorithmVersion === 5 ? byId.get(incoming)!.cuePoints!.incoming : [],outgoingCue);
  const incomingChoice = incomingCues.find(item => item.index === inCueIndex);
  const incomingCue = incomingChoice?.cue;
  const timelineTransitionType = preview.timeline
    ? preview.timeline.kind === 'regular-fallback'
      ? 'Regular Subwave crossfade'
      : preview.timeline.events.some(event => event.label.startsWith('Incoming drums loop ·'))
        ? 'Sub/Beat stem mix · incoming drums looped'
        : 'Sub/Beat stem mix'
    : null;
  useEffect(() => {
    if (incomingCues.length && !incomingChoice) setInCueIndex(incomingCues[0]!.index);
  }, [incomingCues,incomingChoice,setInCueIndex]);
  const incomingReady = !!incomingCue && !!outgoingCue;
  const preparationControl = <div className="max-w-md"><label htmlFor="subbeats-preparation-method" className="mb-1 block text-sm font-medium">Preparation method</label>
    <select id="subbeats-preparation-method" className={SELECT_CLASS} value={preparationMethod} disabled={enqueue.isPending} onChange={event => setPreparationMethod(event.target.value as typeof preparationMethod)}>
      <option value="small0">Beat This! small · cue points</option><option value="final0">Beat This! full · cue points</option>
    </select><p className="mt-2 text-xs leading-relaxed text-muted">Cue-point preparation saves musical cues, reusable opening/ending coverage and vocal measurements. Sufficient saved stems are reused. The full model takes longer and may choose different points.</p></div>;
  const outgoingControl = <div className="min-w-0">
          <label htmlFor="subbeats-outgoing" className="mb-1 block text-sm font-medium">Outgoing track</label>
          <select id="subbeats-outgoing" className={SELECT_CLASS} value={outgoing} onChange={event => { setOutgoing(event.target.value); setOutCueIndex(0); setInCueIndex(0); }}>
            <option value="">Choose an outgoing Sub/Beat track</option>
            {previewJobs.filter(job => !!job.bundleKey && job.id !== incoming).map(job => <option key={job.id} value={job.id}>{job.artist} — {job.title}</option>)}
          </select>
        </div>;

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
          : page === 'preparation' ? 'Monitor preparation, pause queued work and manage tracks in batches. Work continues when you leave this page.'
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

    {(page === 'prepared' || page === 'preparation') && state.data?.maintenanceRunning && <p className="text-sm text-muted">Removal is available when the current library analysis or preparation run has finished.</p>}
    {remove.isPending && <p role="status" className="text-sm">Removing the entry and its extended Sub/Beats files…</p>}
    {remove.isSuccess && <p role="status" className="text-sm">Sub/Beats entry removed. You can prepare the track again from Explore.</p>}
    {remove.isError && <p role="alert" className="text-sm">{remove.error instanceof AdminResponseError && typeof remove.error.body.error === 'string' ? remove.error.body.error : 'Could not remove the entry. Retry shortly.'}</p>}
    <V3AlertDialog open={!!removing} onOpenChange={open => { if (!open) setRemoving(null); }}
      title="Remove Sub/Beats entry?" confirmLabel="Remove entry and files" danger
      description={removing ? `Remove “${removing.title}” by ${removing.artist} and delete its extended Sub/Beats files? Files needed by another entry are kept. The library track, regular stems and manual regular-cache inclusion stay unchanged. You will need to prepare it again to preview it.` : ''}
      onConfirm={() => { if (removing) remove.mutate(removing.id); }} />
    <V3AlertDialog open={!!bulkRemoving} onOpenChange={open => { if (!open) setBulkRemoving(null); }}
      title={`Remove ${bulkRemoving?.length ?? 0} Sub/Beats entries?`} confirmLabel="Remove selected entries and files" danger
      description={bulkRemoving ? `Delete the extended Sub/Beats files for ${bulkRemoving.length} selected tracks? Library tracks and regular stems stay unchanged. Files needed by another entry are kept. The batch stops if an entry cannot be removed; remaining entries stay selected.` : ''}
      onConfirm={() => { if (bulkRemoving) batchRemove.mutate(bulkRemoving); }} />
    {page === 'cache' && <SubbeatsCache cache={cache} />}

    {page === 'preview' && <section className="min-w-0 border border-ink p-4" aria-labelledby="subbeats-preview">
      <h2 id="subbeats-preview" className="font-display text-xl font-bold">Preview a transition</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">Choose any two prepared tracks. Find Suitable Transition compares their saved cue plans and prepares the best Sub/Beat preview; if none fits, it previews the regular Subwave crossfade.</p>
      <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted">A Sub/Beat plan may use an 8- or 16-bar mix and can loop incoming drums when that clears a detected vocal clash. Cue markers remain available below for manual listening.</p>
      {prepared >= 2 && <div className="mt-4 max-w-sm"><label htmlFor="subbeats-preview-search" className="mb-1 block text-sm font-medium">Find prepared tracks</label><Input className="min-h-11" id="subbeats-preview-search" type="search" value={previewSearch} onChange={event => setPreviewSearch(event.target.value)} placeholder="Artist, track or album" /></div>}
      {prepared > 0 && <section className="mt-4 grid min-w-0 gap-4 border-t border-ink/20 pt-4 sm:grid-cols-2" aria-labelledby="subbeats-preview-pair">
        <h3 id="subbeats-preview-pair" className="font-display text-lg font-bold sm:col-span-2">Choose the tracks to mix</h3>
        {outgoingControl}
        <div className="min-w-0">
          <label htmlFor="subbeats-incoming" className="mb-1 block text-sm font-medium">Incoming track</label>
          <select id="subbeats-incoming" className={SELECT_CLASS} value={incoming} disabled={!cueIncoming.length} onChange={event => {setIncoming(event.target.value);setInCueIndex(subbeatsIncomingCues(byId.get(event.target.value)?.cuePoints?.incoming ?? [],outgoingCue)[0]?.index ?? 0);}}>
            <option value="">Choose a prepared incoming track</option>
            {cueIncoming.map(job => <option key={job.id} value={job.id}>{job.artist} — {job.title}</option>)}
          </select>
        </div>
        <p className="max-w-prose text-xs leading-relaxed text-muted sm:col-span-2">Choose or change either track, then use Find Suitable Transition for an automatic choice or Play selected mix for the cue markers chosen below.</p>
      </section>}
      {prepared > 0 && <section className="mt-5 border-t border-ink/20 pt-4" aria-labelledby="subbeats-outgoing-finish">
        <h3 id="subbeats-outgoing-finish" className="font-display text-lg font-bold">Choose the outgoing handover</h3>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">Choose an outgoing marker for a manual mix. Find Suitable Transition will select its own marker automatically. Zero is the end of the recording.</p>
        <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
          <div><label htmlFor="subbeats-out-cue" className="mb-1 block text-sm font-medium">Outgoing rhythm handover · time to track end</label><select id="subbeats-out-cue" className={SELECT_CLASS} value={outCueIndex} disabled={!outgoingCues.length} onChange={event => setOutCueIndex(Number(event.target.value))}>
          {!outgoingCues.length && <option value="">{outgoingDuration == null ? 'Waiting for track duration' : 'No outgoing cues · recheck preparation'}</option>}
          {outgoingCues.map(({cue,index}) => <option key={index} value={index}>{(cue.sourceSeconds - outgoingDuration!).toFixed(2)}s · {cue.bpm.toFixed(1)} BPM · {cue.phraseBars ? `${cue.phraseBars}-bar closing candidate` : cue.reason === 'fade' ? 'Fade candidate' : cue.reason === 'opening' ? 'Rhythmic entry' : cue.reason === 'repetition' ? 'Pattern change' : 'Arrangement change'}</option>)}
        </select></div>
        </div>
        {outgoing && outgoingDuration != null && !outgoingCues.length && <p role="status" className="mt-3 text-sm">No outgoing cue is saved for this track. Find Suitable Transition will use the regular Subwave crossfade.</p>}
        {outgoingCue?.phraseBars && outgoingCue.phraseEndSeconds != null && outgoingDuration != null && <p className="mt-3 text-sm text-muted">{outgoingCue.phraseBars} estimated bars to the musical ending at {(outgoingCue.phraseEndSeconds-outgoingDuration).toFixed(2)}s. The recording continues after that point. Phrase and vocal completion still need listening.</p>}
        {outgoingCue && <CueAudition role="outgoing" key={`${outgoing}:${byId.get(outgoing)?.cuePoints?.artifactKey}`} trackId={outgoing} cueSeconds={outgoingCue.sourceSeconds} adminFetch={adminFetch} onPlay={() => { setSoloRole('outgoing'); preview.stop(); }} pause={preview.loading || preview.playing || soloRole === 'incoming'} />}
      </section>}
      {prepared < 1 && <div className="mt-4 text-sm"><p className="text-muted">Prepare two Sub/Beat tracks to find a transition.</p><Link href="/admin/library/subbeats" className="inline-flex min-h-11 items-center underline underline-offset-4">Explore tracks</Link></div>}
      <section className="mt-5 border-t border-ink/20 pt-4" aria-labelledby="subbeats-incoming-opening">
        <h3 id="subbeats-incoming-opening" className="font-display text-lg font-bold">Choose the incoming opening</h3>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">Arrival times count from the original recording’s start. The complete opening plays, including any music before grid zero. Choose a musical entry or an estimated 8- or 16-bar passage on the fitted grid.</p>

        <div className="mt-4 max-w-xl"><label htmlFor="subbeats-in-cue" className="mb-1 block text-sm font-medium">Incoming musical arrival</label><select id="subbeats-in-cue" className={SELECT_CLASS} value={inCueIndex} disabled={!byId.get(incoming)?.cuePoints?.incoming.length} onChange={event => setInCueIndex(Number(event.target.value))}>
          {!incomingCues.length && <option value="">{incoming ? 'No incoming cues · automatic transition can use regular Subwave' : 'Choose a prepared incoming track'}</option>}
          {incomingCues.map(({cue,index}) => <option key={index} value={index}>{cue.sourceSeconds.toFixed(2)}s · {cue.bpm.toFixed(1)} BPM · {cue.phraseBars && cue.phraseStartSeconds != null ? `${cue.phraseBars}-bar opening candidate` : cue.reason === 'opening' ? 'Rhythmic entry' : cue.reason === 'repetition' ? 'Pattern change' : 'Arrangement change'}</option>)}
        </select></div>
        {incomingCue?.phraseBars && incomingCue.phraseStartSeconds != null && <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted">{incomingCue.phraseBars} estimated bars from {incomingCue.phraseStartSeconds.toFixed(2)}s to the arrival at {incomingCue.sourceSeconds.toFixed(2)}s. The opening before that passage is retained; vocals and background grooves need listening.</p>}
        {incomingChoice?.differenceSeconds != null && <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted">At the outgoing tempo, this complete opening lasts {incomingChoice.matchedSeconds.toFixed(2)}s: {Math.abs(incomingChoice.differenceSeconds).toFixed(2)}s {incomingChoice.differenceSeconds >= 0 ? 'longer' : 'shorter'} than the selected outgoing closing passage. {incomingChoice.tempoFits ? 'The preview aligns this arrival with the outgoing closing change.' : 'The tempo difference exceeds the pair preview’s 8% limit.'}</p>}
        {incomingChoice && incomingCues[0]?.index !== inCueIndex && incomingCues[0]?.tempoFits && outgoingCue?.phraseEndSeconds != null && <Button className="mt-3" onClick={() => setInCueIndex(incomingCues[0]!.index)}>Use closest opening length</Button>}
        {incomingCue && <CueAudition role="incoming" key={`incoming:${incoming}:${byId.get(incoming)?.cuePoints?.artifactKey}`} trackId={incoming} cueSeconds={incomingCue.sourceSeconds} tailSeconds={8*60/incomingCue.bpm} adminFetch={adminFetch} onPlay={() => { setSoloRole('incoming'); preview.stop(); }} pause={preview.loading || preview.playing || soloRole === 'outgoing'} />}
      </section>
      {prepared > 0 && <div className="mt-4 flex flex-wrap gap-3">
        <Button className="min-h-11" variant="solid" disabled={preview.active !== 0 && (!ready || !outgoing || !incoming || outgoing === incoming || byId.get(outgoing)?.status !== 'prepared' || byId.get(incoming)?.status !== 'prepared')} onClick={() => void preview.toggle(0, [outgoing, incoming], {method:'cue-points',autoPlan:true})}>
          {preview.active === 0 && preview.loading ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : preview.active === 0 && preview.playing ? <Square /> : <Play />}
          {preview.active === 0 && preview.loading ? 'Cancel preview' : preview.active === 0 && preview.playing ? 'Stop preview' : preview.active === 0 && preview.duration > 0 ? 'Play transition' : 'Find Suitable Transition'}
        </Button>
        <Button className="min-h-11" disabled={preview.active !== 1 && (!ready || !incomingReady || !outgoing || !incoming || outgoing === incoming)} onClick={() => void preview.toggle(1, [outgoing, incoming], {method:'cue-points',cueIndices:[outCueIndex,inCueIndex]})}>
          {preview.active === 1 && preview.loading ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : preview.active === 1 && preview.playing ? <Square /> : <Play />}
          {preview.active === 1 && preview.loading ? 'Cancel selected mix' : preview.active === 1 && preview.playing ? 'Stop selected mix' : 'Play selected mix'}
        </Button>
      </div>}
      {preview.loading && <p role="status" className="mt-3 text-sm text-muted">{preview.active === 0 ? 'Comparing this pair’s cue plans and preparing the best preview… press again to cancel.' : 'Preparing the selected cue preview from saved passages… press again to cancel.'}</p>}
      {preview.message && <p role="status" className="mt-3 text-sm text-muted">{preview.message}</p>}
      {preview.timeline?.kind === 'regular-fallback' && <p role="status" className="mt-3 max-w-prose text-sm">No Sub/Beat transition fit this pair. The preview uses the regular Subwave crossfade.</p>}
      {preview.timeline?.kind === 'subbeats-transition' && <p role="status" className="mt-3 max-w-prose text-sm">Selected plan: {preview.timeline.events[0]?.label.replace('Outgoing track · ', '')}. Listen for vocal bleed and musical fit.</p>}
      {preview.duration > 0 && <div className="mt-5 border-t border-ink/20 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="subbeats-preview-position" className="text-sm font-medium">Preview timeline</label>
            {timelineTransitionType && <span className="border border-ink/30 bg-ink-soft px-2 py-1 text-xs font-medium text-ink">{timelineTransitionType}</span>}
          </div>
          <span className="shrink-0 font-mono text-xs text-muted tabular-nums">{clock(preview.position)} / {clock(preview.duration)}</span>
        </div>
        <input id="subbeats-preview-position" type="range" min={0} max={preview.duration} step={0.1} value={Math.min(preview.position, preview.duration)}
          className="mt-2 h-11 w-full cursor-pointer accent-ink" aria-valuetext={`${clock(preview.position)} of ${clock(preview.duration)}`}
          onChange={event => preview.seek(Number(event.target.value))} />
        {currentStage && <p role="status" className="mt-1 text-sm font-medium text-ink">{currentStage}</p>}
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted">Stages show the rendered transition and cue handover. Select a time to jump there.</p>
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
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted">{page === 'prepared' ? 'Prepared means the files are saved. Choose an outgoing and incoming track, then open Preview to find and listen to the best transition. Remove an entry to delete its extended files.' : 'Suggestions focus on dance-music genres, ranked using existing tempo and beat data. Deeper analysis checks the recording; genre alone does not confirm a driving beat.'}</p>
          <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted">Regular stem inclusion is separate from deeper Sub/Beats preparation. It bypasses selective cache criteria, with the normal priority and space budget.</p>
          {page === 'prepared' ? <>
            <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted">Readiness is counted per track using its strongest role. A track with Sub/Beat support may be ready only as an incoming or outgoing track; this does not guarantee a compatible pairing. The row shows both roles, and Find Suitable Transition checks the selected pair’s cue fit and vocal overlap, with a safe drum-loop option.</p>
            <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted">If no Sub/Beat plan fits, this preview uses the configured crossfade; Picker integration will delegate that case to Subwave’s regular transition selector. Listen for musical fit.</p>
          </> : <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted">Readiness is per track, based on its strongest incoming or outgoing role. It does not guarantee a compatible pairing; both role results are shown on each row.</p>}
          {page === 'prepared' && needsCoverage.length > 0 && <div className="mt-3">
            <Button className="min-h-11" disabled={actionBusy || !!state.data?.maintenanceRunning} onClick={() => upgradeCoverage.mutate(needsCoverage.slice(0,SUBBEATS_BATCH_LIMIT).map(job => job.id))}>Upgrade cue coverage ({Math.min(needsCoverage.length,SUBBEATS_BATCH_LIMIT)})</Button>
            <p className="mt-1 text-xs text-muted">Reuses saved cues and sufficient stems, prepares missing coverage and saves vocal measurements for matching.</p>
          </div>}
          {upgradeCoverage.isError && <p role="alert" className="mt-2 text-sm">{upgradeCoverage.error.message}</p>}
          {page === 'prepared' && unassessed.length > 0 && <div className="mt-3">
            <Button className="min-h-11" disabled={assess.isPending || !!state.data?.maintenanceRunning} onClick={() => assess.mutate(unassessed.slice(0, SUBBEATS_BATCH_LIMIT).map(job => job.id))}>
              {assess.isPending ? 'Queueing assessment…' : `Assess saved stems (${Math.min(unassessed.length, SUBBEATS_BATCH_LIMIT)})`}
            </Button>
            <p className="mt-1 text-xs text-muted">{unassessed.length} entries need assessment. Uses cached stems; no new separation. Up to {SUBBEATS_BATCH_LIMIT} per batch.</p>
          </div>}
          {assess.isError && <p role="alert" className="mt-2 text-sm">Could not queue assessment. {assess.error instanceof Error ? assess.error.message : 'Try again.'}</p>}
          {page === 'prepared' && (outgoing || incoming) && <div className="mt-3 flex flex-wrap items-center gap-3 text-sm" role="status">
            <span>Outgoing: {byId.get(outgoing)?.title || 'Choose a track'} · Incoming: {byId.get(incoming)?.title || 'Choose a track'}</span>
            <Link href="/admin/library/subbeats/preview" className="min-h-11 py-3 underline underline-offset-4">Open preview</Link>
          </div>}
          <div className={page === 'prepared' ? 'mt-4 grid min-w-0 gap-3 sm:grid-cols-2' : 'mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4'}>
            {page === 'explore' && <div><label htmlFor="subbeats-scope" className="mb-1 block text-sm font-medium">Collection</label>
              <select id="subbeats-scope" className={SELECT_CLASS} value={scope} onChange={event => {
                setScope(event.target.value as typeof scope); setGenre(''); setStatus('all'); setOffset(0);
              }}><option value="dance">Dance candidates</option><option value="library">Entire library</option><option value="playlist">Playlist</option></select>
            </div>}
            {page === 'explore' && scope === 'playlist' && <div><label htmlFor="subbeats-playlist" className="mb-1 block text-sm font-medium">Playlist</label>
              <select id="subbeats-playlist" className={SELECT_CLASS} value={playlistId} disabled={playlists.isLoading || playlists.isError} onChange={event => updateBrowse({playlistId:event.target.value,offset:0})}>
                <option value="">{playlists.isLoading ? 'Loading playlists…' : 'Choose a playlist'}</option>
                {playlistId && !playlists.data?.some(item => item.id === playlistId) && <option value={playlistId}>Selected playlist unavailable</option>}
                {[...(playlists.data ?? [])].sort((a,b) => a.name.localeCompare(b.name)).map(item => <option key={item.id} value={item.id}>{item.name} ({item.songCount})</option>)}
              </select>
              <p className="mt-2 text-xs text-muted">Shows playlist tracks already in the library.</p>
              {playlists.isError && <div role="alert" className="mt-2 text-sm">Playlists could not be loaded. <Button onClick={() => void playlists.refetch()}>Retry playlists</Button></div>}
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
            <div><label htmlFor="subbeats-mixing" className="mb-1 block text-sm font-medium">Per-track readiness</label>
              <select id="subbeats-mixing" className={SELECT_CLASS} value={mixing} onChange={event => updateBrowse({ mixing: event.target.value as SubbeatsBrowseState['mixing'], offset: 0 })}>
                <option value="all">All readiness levels</option>
                {Object.entries(MIX_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
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
          <Button className="mt-3 min-h-11" disabled={!query && !genre && mixing === 'all' && sort === 'recommended' && status === 'all' && scope === (page === 'prepared' ? 'prepared' : 'dance')} onClick={() => setBrowse(current => ({ ...current, [browsePage]: subbeatsInitialBrowse(page === 'prepared' ? 'prepared' : 'dance') }))}>Reset filters</Button>
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
          <p id="subbeats-selection-limit" className="mt-2 text-xs text-muted" role="status">{selection.length >= SUBBEATS_BATCH_LIMIT ? 'Batch limit reached. Remove selected tracks or queue this batch before selecting more.' : jobs.length + selection.filter(row => !byId.has(row.id)).length >= SUBBEATS_QUEUE_LIMIT ? 'Preparation list capacity reached. Remove completed entries or retry failed ones.' : ''}</p>
          <div className="mt-3 border-t border-ink/20 pt-3">
            <p className="text-sm tabular-nums" aria-live="polite">{selection.length} selected{selection.length > selectionOnPage ? ` · ${selection.length - selectionOnPage} on other pages or filters` : ''}</p>
            <div className="mb-3">{preparationControl}</div>
            <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted">Selections carry across pages and filters. Up to {SUBBEATS_BATCH_LIMIT} tracks per batch; {jobs.length} of {SUBBEATS_QUEUE_LIMIT} preparation entries used. Prepared audio shares the regular stem-cache budget.</p>
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
        {!candidates.isLoading && !candidates.isError && !rows.length && <p className="p-6 text-sm text-muted">{page === 'explore' && scope === 'playlist' && !playlistId ? 'Choose a playlist to see its tracks.' : page === 'prepared' ? 'No prepared tracks match. Clear the search or choose another genre.' : 'No tracks match these filters. Try another genre or status, clear the search, or choose Entire library.'}{page === 'prepared' && <Link href="/admin/library/subbeats" className="mt-2 flex min-h-11 items-center underline underline-offset-4">Explore tracks to prepare more</Link>}</p>}
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
                {job?.cuePoints && <p className="mt-1 text-xs text-muted lg:col-span-3">{job.cueCoverage ? 'Matching coverage and vocal measurements saved · check each pair for compatibility.' : 'Cues detected · upgrade cue coverage for saved vocal matching.'}</p>}
                <SuitabilityDetails value={job ? job.suitability : row.suitability} cueBased={job?.cuePoints?.algorithmVersion === 5} />
                <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-xs lg:col-span-3">
                  <Checkbox aria-label={`Include ${row.title} by ${row.artist} in regular stem caching`} checked={regularIds.has(row.id)}
                    disabled={!cache.query.data || cache.query.isError || cache.update.isPending}
                    onCheckedChange={checked => cache.update.mutate({ track: { id: row.id, include: checked === true } })} />
                  Include in regular stem caching
                </label>
                {page === 'prepared' && <div className="mt-3 flex flex-wrap gap-2 lg:col-span-3">
                  <Button className="min-h-11" aria-pressed={outgoing === row.id} disabled={incoming === row.id} onClick={() => { setOutgoing(row.id); }}>{outgoing === row.id ? 'Outgoing selected' : 'Use as outgoing'}</Button>
                  <Button className="min-h-11" aria-pressed={incoming === row.id} disabled={outgoing === row.id} onClick={() => { setIncoming(row.id); }}>{incoming === row.id ? 'Incoming selected' : 'Use as incoming'}</Button>
                  <Button className="min-h-11" disabled={actionBusy || !!state.data?.maintenanceRunning} aria-label={`Remove Sub/Beats entry for ${row.title} by ${row.artist}`} onClick={() => { remove.reset(); setRemoving(row); }}>Remove</Button>
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
          {assess.isError && <p role="alert" className="mt-2 text-sm">Could not queue assessment. {assess.error instanceof Error ? assess.error.message : 'Try again.'}</p>}
          <p className="mt-3 text-sm tabular-nums" aria-live="polite">{state.isLoading ? 'Loading progress…' : `${prepared} prepared · ${pending} remaining`}</p>
          <p className="mt-2 text-sm leading-relaxed break-words text-muted">{state.data?.paused ? 'Paused. Any track already being prepared will finish first.' : state.data?.progress && pending ? state.data.progress : pending ? 'Queued tracks will run when library analysis is available.' : 'Choose tracks to prepare. Saved results are reused.'}</p>
          <p className="mt-3 text-xs text-muted">Preparation respects your analysis quiet-time setting. Saved results share the regular stem-cache budget; the list holds up to 500 entries.</p>
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
        <div className="border-b border-ink p-4">
          <div className="mb-4">{preparationControl}</div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><Checkbox aria-label="Select preparation page"
              checked={selectableJobs.length > 0 && selectableJobs.every(job => selectedJobSet.has(job.id)) ? true : selectableJobs.some(job => selectedJobSet.has(job.id)) ? 'indeterminate' : false}
              disabled={!selectableJobs.length || actionBusy || !state.data || (selectedJobs.length >= SUBBEATS_BATCH_LIMIT && !selectableJobs.some(job => selectedJobSet.has(job.id)))}
              onCheckedChange={checked => checked === true ? selectJobs(selectableJobs.map(job => job.id)) : setJobSelected(current => current.filter(id => !selectableJobs.some(job => job.id === id)))} />Select page</label>
            <Button className="min-h-11" disabled={actionBusy || !ranked.length || !state.data || selectPreparationIds(selectedJobs, ranked.map(job => job.id), jobs).length === selectedJobs.length}
              onClick={() => selectJobs(ranked.map(job => job.id))}>Select matching · up to {SUBBEATS_BATCH_LIMIT}</Button>
            <Button className="min-h-11" disabled={actionBusy || !jobSelected.length} onClick={() => setJobSelected([])}>Clear selection</Button>
          </div>
          <p className="mt-2 text-sm tabular-nums" role="status">{selectedJobs.length} selected{selectedJobs.some(id => !pageJobs.some(job => job.id === id)) ? ' · includes entries on other pages or filters' : ''}</p>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted">Select up to {SUBBEATS_BATCH_LIMIT} completed or failed entries across pages. Queued and running entries cannot be selected. Recheck/retry prepares resources; suitability assessment uses saved stems only.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="min-h-11" disabled={actionBusy || !selectedJobs.length || !state.data} onClick={() => enqueue.mutate(selectedJobs)}>Recheck/retry selected ({selectedJobs.length})</Button>
            <Button className="min-h-11" disabled={actionBusy || !coverageJobs.length || !!state.data?.maintenanceRunning} onClick={() => upgradeCoverage.mutate(coverageJobs)}>Upgrade cue coverage ({coverageJobs.length})</Button>
            <Button className="min-h-11" disabled={actionBusy || !assessJobs.length || !!state.data?.maintenanceRunning} onClick={() => assess.mutate(assessJobs)}>Assess suitability ({assessJobs.length})</Button>
            <Button className="min-h-11" disabled={actionBusy || !selectedJobs.length || !!state.data?.maintenanceRunning} onClick={() => { batchRemove.reset(); setBulkRemoving([...selectedJobs]); }}>Remove selected ({selectedJobs.length})</Button>
          </div>
          {upgradeCoverage.isError && <p role="alert" className="mt-2 text-sm">{upgradeCoverage.error.message}</p>}
          {enqueue.isError && <p role="alert" className="mt-2 text-sm">Could not queue the selected entries. {enqueue.error.message}</p>}
          {batchRemove.isPending && <p role="status" className="mt-2 text-sm">{removeProgress}</p>}
          {batchRemove.data && <p role={batchRemove.data.error ? 'alert' : 'status'} className="mt-2 text-sm">Removed {batchRemove.data.removed.length} of {batchRemove.data.total} entries.{batchRemove.data.error && ` ${batchRemove.data.error} Remaining entries stay selected; retry when the problem is resolved.`}</p>}
        </div>
        {jobs.length > 0 && !ranked.length && <p className="p-4 text-sm text-muted">No preparation entries match. Clear the search or choose another status.</p>}
        {!jobs.length && <div className="p-6 text-sm"><p className="text-muted">Your preparation list is empty. Choose tracks on Explore, then select Queue analysis.</p><Link href="/admin/library/subbeats" className="inline-flex min-h-11 items-center underline underline-offset-4">Explore tracks</Link></div>}
        <ul className="divide-y divide-ink/20">
          {pageJobs.map(job => <li key={job.id} className="p-4">
            <div className="flex flex-wrap items-start gap-3">
              <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center"><Checkbox aria-label={`Select preparation entry ${job.title} by ${job.artist}`}
                checked={selectedJobSet.has(job.id)} disabled={actionBusy || ['queued', 'running'].includes(job.status) || (!selectedJobSet.has(job.id) && selectedJobs.length >= SUBBEATS_BATCH_LIMIT)}
                onCheckedChange={checked => checked === true ? selectJobs([job.id]) : setJobSelected(current => current.filter(id => id !== job.id))} /></label>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold break-words">{job.title}</p><p className="text-sm break-words text-muted">{job.artist}</p></div>
              {(job.status !== 'queued' && job.status !== 'running') && <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto"><Button className="min-h-11" size="sm" disabled={actionBusy} onClick={() => enqueue.mutate([job.id])}>{job.status === 'prepared' || job.status === 'unmeasurable' ? 'Recheck' : 'Retry'}</Button>
                {job.bundleKey && job.cuePoints?.algorithmVersion === 5 && <Button className="min-h-11" size="sm" disabled={actionBusy || !!state.data?.maintenanceRunning} onClick={() => upgradeCoverage.mutate([job.id])}>Upgrade cue coverage</Button>}
                {job.bundleKey && <Button className="min-h-11" size="sm" disabled={actionBusy || !!state.data?.maintenanceRunning} onClick={() => assess.mutate([job.id])}>Assess suitability</Button>}
                <Button className="min-h-11" size="sm" aria-label={`Remove Sub/Beats entry for ${job.title} by ${job.artist}`} disabled={actionBusy || !!state.data?.maintenanceRunning} onClick={() => { remove.reset(); setRemoving(job); }}>Remove</Button></div>}
            </div>
            <p className="mt-2 text-xs font-medium" role={job.status === 'running' ? 'status' : undefined}>{LABEL[job.status]}{job.cuePoints ? ` · ${job.cuePoints.model} cues: ${job.cuePoints.incoming.length} incoming / ${job.cuePoints.outgoing.length} outgoing` : job.preparationMethod ? ` · ${job.preparationMethod}` : ''}</p>
            {job.cuePoints && <p className="mt-1 text-xs text-muted">{job.cueCoverage ? `Matching coverage saved: ${[job.cueCoverage.incoming ? 'incoming' : '',job.cueCoverage.outgoing ? 'outgoing' : ''].filter(Boolean).join(' and ') || 'no cue roles detected'}. Pair compatibility still needs checking.` : 'Cues detected · upgrade coverage for saved vocal matching.'}</p>}
            <SuitabilityDetails value={job.suitability} cueBased={job.cuePoints?.algorithmVersion === 5} />
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
