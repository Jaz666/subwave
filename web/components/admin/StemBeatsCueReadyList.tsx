'use client';

import { useMemo, useState } from 'react';
import { ArrowLeftToLine, ArrowRightToLine, ListPlus, RefreshCw } from 'lucide-react';
import { adminJson } from '../../lib/admin-query';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Thumb } from './library/bits';
import { MixingDeskStatusIcon } from './subbeats/MixingDeskStatusIcon';

const PAGE_SIZE = 50;
type CueFilter = 'all' | 'incoming' | 'outgoing' | 'both' | 'none';
export type StemBeatsCandidate = { id: string; title: string; artist: string; album: string; scanned: boolean; incomingReady: boolean; outgoingReady: boolean };

export default function StemBeatsCueReadyList({ tracks, loading, error, scanDisabled = false, adminFetch, onRunsChanged }: {
  tracks: StemBeatsCandidate[];
  loading: boolean;
  error: boolean;
  scanDisabled?: boolean;
  adminFetch: (path: string, init?: RequestInit) => Promise<Response>;
  onRunsChanged: () => Promise<unknown>;
}) {
  const [album, setAlbum] = useState('');
  const [artist, setArtist] = useState('');
  const [track, setTrack] = useState('');
  const [cueFilter, setCueFilter] = useState<CueFilter>('all');
  const [showUnscanned, setShowUnscanned] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [scanBusy, setScanBusy] = useState(false);
  const [queuing, setQueuing] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [page, setPage] = useState(0);
  const compatible = useMemo(() => tracks.filter(item => item.incomingReady || item.outgoingReady
    || (cueFilter === 'none' && item.scanned) || (showUnscanned && !item.scanned)), [cueFilter, showUnscanned, tracks]);
  const filtered = useMemo(() => {
    const albumNeedle = album.trim().toLocaleLowerCase();
    const artistNeedle = artist.trim().toLocaleLowerCase();
    const trackNeedle = track.trim().toLocaleLowerCase();
    return compatible.filter(item =>
      item.album.toLocaleLowerCase().includes(albumNeedle)
      && item.artist.toLocaleLowerCase().includes(artistNeedle)
      && item.title.toLocaleLowerCase().includes(trackNeedle)
      && (cueFilter === 'all'
        || (cueFilter === 'incoming' && item.incomingReady)
        || (cueFilter === 'outgoing' && item.outgoingReady)
        || (cueFilter === 'both' && item.incomingReady && item.outgoingReady)
        || (cueFilter === 'none' && item.scanned && !item.incomingReady && !item.outgoingReady)));
  }, [album, artist, compatible, cueFilter, track]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const setTextFilter = (setter: (value: string) => void) => (value: string) => { setter(value); setPage(0); };
  const clearFilters = () => { setAlbum(''); setArtist(''); setTrack(''); setCueFilter('all'); setPage(0); };
  const scanSelection = async () => {
    if (!selected.size || scanBusy) return;
    setScanBusy(true);
    setFeedback('');
    try {
      const created = await adminJson<{ runId: string }>(adminFetch, '/library/subbeats/prep-v2/runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'library-selected', ids: [...selected] }),
      });
      await adminJson(adminFetch, `/library/subbeats/prep-v2/runs/${created.runId}/start`, { method: 'POST' });
      setSelected(new Set());
      setFeedback('Selected tracks queued for scanning.');
      await onRunsChanged();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Selected tracks could not be scanned.');
    } finally {
      setScanBusy(false);
    }
  };
  const queueTrack = async (item: StemBeatsCandidate) => {
    setQueuing(item.id);
    setFeedback('');
    try {
      const result = await adminJson<{ queuePosition?: number; track: { title: string }; flow?: { name: string; size: number } }>(adminFetch, '/dj/queue-track', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, title: item.title, artist: item.artist, album: item.album }),
      });
      setFeedback(result.flow
        ? `Queued Flow “${result.flow.name}” · ${result.flow.size} tracks starting with “${result.track.title}”`
        : `Queued “${result.track.title}”${result.queuePosition == null ? '.' : ` · position ${result.queuePosition}`}`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Track could not be added to the queue.');
    } finally {
      setQueuing(null);
    }
  };

  return <section className="grid min-w-0 gap-3 border-t border-ink/20 pt-3" aria-labelledby="stem-beats-cue-ready">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 id="stem-beats-cue-ready" className="text-sm font-semibold">{showUnscanned || cueFilter === 'none' ? 'Stem Beats tracks' : 'Cue-ready tracks'}</h3>
        <span className="text-xs text-muted">{filtered.length.toLocaleString()} shown · {compatible.length.toLocaleString()} total</span>
      </div>
      <Button variant="outline" className="min-h-9" disabled={selected.size === 0 || scanBusy || scanDisabled} onClick={() => void scanSelection()}>
        <RefreshCw size={14} />{scanBusy ? 'Scanning…' : `Scan selection${selected.size ? ` (${selected.size})` : ''}`}
      </Button>
    </div>
    <label className="flex w-fit items-center gap-2 text-xs text-muted">
      <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={showUnscanned}
        onChange={event => { setShowUnscanned(event.target.checked); setPage(0); setSelected(new Set()); }} />
      Show tracks not yet scanned
    </label>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-[11px] text-muted">
        Track
        <Input aria-label="Filter by track" placeholder="Track title" value={track} onChange={event => setTextFilter(setTrack)(event.target.value)} />
      </label>
      <label className="grid gap-1 text-[11px] text-muted">
        Artist
        <Input aria-label="Filter by artist" placeholder="Artist" value={artist} onChange={event => setTextFilter(setArtist)(event.target.value)} />
      </label>
      <label className="grid gap-1 text-[11px] text-muted">
        Album
        <Input aria-label="Filter by album" placeholder="Album" value={album} onChange={event => setTextFilter(setAlbum)(event.target.value)} />
      </label>
      <label className="grid gap-1 text-[11px] text-muted">
        Cue role
        <select
          aria-label="Filter by cue readiness"
          className="h-10 w-full border border-input bg-field px-3 text-[13px] text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          value={cueFilter}
          onChange={event => { setCueFilter(event.target.value as CueFilter); setPage(0); }}
        >
          <option value="all">Any cue</option>
          <option value="incoming">Incoming cue</option>
          <option value="outgoing">Outgoing cue</option>
          <option value="both">Both cues</option>
          <option value="none">No Cues</option>
        </select>
      </label>
    </div>
    {(album || artist || track || cueFilter !== 'all') && <Button variant="ghost" className="w-fit" onClick={clearFilters}>Clear filters</Button>}

    {error && <p className="text-sm text-destructive" role="alert">Stem Beats preparation results are unavailable.</p>}
    {loading && compatible.length === 0 && <p className="text-sm text-muted" role="status">Loading cue-ready tracks…</p>}
    {!loading && !error && compatible.length === 0 && <p className="text-sm text-muted">{cueFilter === 'none'
      ? 'No scanned tracks without cues.'
      : 'No cue-ready tracks yet. Prepare the library above, or show tracks not yet scanned.'}</p>}
    {!loading && !error && compatible.length > 0 && filtered.length === 0 && <p className="text-sm text-muted">No tracks match these filters.</p>}
    {feedback && <p className="text-xs text-muted" role="status">{feedback}</p>}

    {visible.length > 0 && <div className="max-h-[114rem] overflow-y-auto border border-ink/25" role="list" aria-label="Stem Beats cue-ready tracks">
      {visible.map(item => <div key={item.id} role="listitem" className="flex min-w-0 items-center gap-3 border-b border-dashed border-[var(--separator-strong)] px-3 py-2 last:border-b-0 sm:px-4">
        <input type="checkbox" className="size-4 shrink-0 accent-[var(--accent)]" aria-label={`Select ${item.title} for Stem Beats scan`}
          checked={selected.has(item.id)} onChange={event => setSelected(current => {
            const next = new Set(current);
            if (event.target.checked) next.add(item.id); else next.delete(item.id);
            return next;
          })} />
        <Thumb track={{ id: item.id, title: item.title, artist: item.artist, album: item.album }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">{item.title || 'Unknown track'}</div>
          <div className="truncate text-xs text-muted">{item.artist || 'Unknown artist'}{item.album ? ` · ${item.album}` : ''}{!item.scanned && <span className="ml-2">Not scanned</span>}</div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Stem Beats cue roles">
          <MixingDeskStatusIcon icon={ArrowLeftToLine} grid state={item.incomingReady ? 'suitable' : 'unavailable'} label={`Incoming cue: ${item.incomingReady ? 'ready' : 'unavailable'}`} />
          <MixingDeskStatusIcon icon={ArrowRightToLine} grid state={item.outgoingReady ? 'suitable' : 'unavailable'} label={`Outgoing cue: ${item.outgoingReady ? 'ready' : 'unavailable'}`} />
        </span>
        <Button variant="outline" className="min-h-9 shrink-0 px-2.5" disabled={!!queuing}
          onClick={() => void queueTrack(item)} title="Add to queue" aria-label={`Add ${item.title} to queue`}>
          {queuing === item.id ? '…' : <><ListPlus size={13} /><span className="hidden sm:inline"> Queue</span></>}
        </Button>
      </div>)}
    </div>}

    {filtered.length > PAGE_SIZE && <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
      <span>{(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" className="min-h-9" disabled={page === 0} onClick={() => setPage(current => current - 1)}>Previous</Button>
        <span>Page {page + 1} of {pages}</span>
        <Button variant="outline" className="min-h-9" disabled={page + 1 >= pages} onClick={() => setPage(current => current + 1)}>Next</Button>
      </div>
    </div>}
  </section>;
}
