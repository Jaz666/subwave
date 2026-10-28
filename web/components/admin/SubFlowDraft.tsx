'use client';

import { useState, type FormEvent } from 'react';
import { Disc3, Plus, Search, Trash2, X } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../ui/input-group';
import { V3AlertDialog } from '../ui/alert-dialog';
import { Btn, Card, Pill } from './ui';
import { ADMIN_API_URL, useAdminAuth } from '../../lib/adminAuth';
import { adminJson, useAdminMutation, useAdminQuery } from '../../lib/admin-query';
import { fmtDuration } from './library/bits';
import { useWatch } from 'react-hook-form';
import { useZodForm } from '../../lib/form';
import { TextField } from '../../lib/form-fields';
import { subFlowNameSchema } from '../../lib/schemas.generated';
import { albumSelection } from './library/sub-flow-order';

type Track = { id: string; title: string; duration: number | null; artist: string | null; album: string | null; order?: number };
type Flow = { id: string; name: string; tracks: Track[]; enabled: boolean; revision: number; orderVerified: boolean; verification: 'pending' | 'verified' | 'failed'; verificationError: string | null };
type Album = { id: string; name: string; artist: string | null; year: number | null; coverArt: string | null };

export default function SubFlowDraft() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [album, setAlbum] = useState<Album | null>(null);
  const [artFailed, setArtFailed] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const nameForm = useZodForm(subFlowNameSchema, { name: '' });
  const name = useWatch({ control: nameForm.control, name: 'name' }) ?? '';
  const [editing, setEditing] = useState<{ id: string; revision: number } | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<Flow | null>(null);
  const { adminFetch, hydrated, needsAuth } = useAdminAuth();
  const flowsQuery = useAdminQuery({
    key: ['sub-flow', 'definitions'], adminFetch, enabled: hydrated && !needsAuth,
    refetchInterval: 5000,
    request: (fetcher, signal) => adminJson<{ flows: Flow[] }>(fetcher, '/library/sub-flow', undefined, signal),
  });
  const flows = flowsQuery.data?.flows ?? [];
  const saveFlow = useAdminMutation({
    adminFetch,
    request: (value: { id: string | null; revision?: number; name: string; enabled: boolean; trackIds: string[] }, fetcher) =>
      adminJson<{ flow: Flow }>(fetcher, value.id ? `/library/sub-flow/${encodeURIComponent(value.id)}` : '/library/sub-flow', {
        method: value.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: value.name, enabled: value.enabled, trackIds: value.trackIds, ...(value.revision ? { revision: value.revision } : {}) }),
      }),
    onDone: async (_data, _value, client) => { await client.invalidateQueries({ queryKey: ['sub-flow', 'definitions'] }); },
  });
  const deleteFlow = useAdminMutation({
    adminFetch,
    request: (flow: Flow, fetcher) => adminJson(fetcher, `/library/sub-flow/${encodeURIComponent(flow.id)}?revision=${flow.revision}`, { method: 'DELETE' }),
    onDone: async (_data, _value, client) => { await client.invalidateQueries({ queryKey: ['sub-flow', 'definitions'] }); },
  });
  const setFlowEnabled = useAdminMutation({
    adminFetch,
    request: (flow: Flow, fetcher) => adminJson(fetcher, `/library/sub-flow/${encodeURIComponent(flow.id)}/enabled`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: flow.revision, enabled: !flow.enabled }),
    }),
    onDone: async (_data, _value, client) => { await client.invalidateQueries({ queryKey: ['sub-flow', 'definitions'] }); },
  });
  const albums = useAdminQuery({
    key: ['sub-flow', 'albums', submitted], adminFetch,
    enabled: hydrated && !needsAuth && !!submitted,
    request: (fetcher, signal) => adminJson<{ albums: Album[] }>(fetcher, `/library/sub-flow/albums?q=${encodeURIComponent(submitted)}`, undefined, signal),
  });
  const albumTracks = useAdminQuery({
    key: ['sub-flow', 'album', album?.id], adminFetch,
    enabled: hydrated && !needsAuth && !!album,
    request: (fetcher, signal) => adminJson<{ tracks: (Track & { order: number })[] }>(fetcher, `/library/sub-flow/albums/${encodeURIComponent(album?.id ?? '')}/tracks`, undefined, signal),
  });
  const availableTracks = albumTracks.data?.tracks ?? [];

  const reset = () => { setTracks([]); nameForm.reset({ name: '' }); setEditing(null); setEnabled(true); };
  const selectedOrder = albumSelection(tracks.map(track => track.id), availableTracks);
  const selectionValid = !!selectedOrder && selectedOrder.every((id, index) => id === tracks[index]?.id);
  const albumLoaded = !!album && !!albumTracks.data;
  const canAdd = (track: Track) => !saveFlow.isPending && tracks.length < 3 && !tracks.some(t => t.id === track.id)
    && !!albumSelection([...tracks.map(item => item.id), track.id], availableTracks);
  const add = (track: Track) => {
    if (!canAdd(track)) return;
    setTracks(current => {
      if (current.some(t => t.id === track.id) || current.length >= 3) return current;
      const next = [...current];
      next.push(track);
      const ids = albumSelection(next.map(item => item.id), availableTracks);
      return ids ? ids.map(id => next.find(item => item.id === id)!) : current;
    });
  };
  const save = async () => {
    if (tracks.length < 2 || !(await nameForm.trigger())) return;
    try {
      await saveFlow.mutateAsync({ id: editing?.id ?? null, revision: editing?.revision, name: name.trim(), enabled, trackIds: tracks.map(track => track.id) });
      reset();
    } catch { /* mutation displays the error and keeps the editor intact */ }
  };
  const findAlbum = (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (text === submitted) void albums.refetch();
    else setSubmitted(text);
    setAlbum(null);
  };

  return (
    <div className="grid min-w-0 gap-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Sub/Flow</h1>
        <p className="mt-1 text-sm text-muted">Keep two or three album tracks together, in the order they were meant to play.</p>
      </div>
      <div role="status" className="border border-separator-strong bg-bg p-3 text-sm text-muted">
        Saved Flows are checked in the background. Protected playback is not connected yet.
      </div>
      <Card title="Build a Sub/Flow" sub="Choose an album, then add its tracks in order">
        <fieldset disabled={saveFlow.isPending} className="grid min-w-0 gap-5">
          <form onSubmit={findAlbum} className="flex flex-wrap gap-2">
            <InputGroup className="min-w-0 flex-1">
              <InputGroupAddon><Search /></InputGroupAddon>
              <InputGroupInput aria-label="Search albums" placeholder="Search albums or artists" value={query} onChange={event => setQuery(event.target.value)} />
            </InputGroup>
            <Btn type="submit" tone="accent" disabled={!query.trim()}>Search</Btn>
            <Btn onClick={() => { setQuery(''); setSubmitted(''); setAlbum(null); }}>Clear</Btn>
          </form>
          {submitted && !album && <div className="grid gap-2" aria-live="polite">
            {albums.isFetching && <p className="text-sm text-muted">Searching albums…</p>}
            {albums.isError && <p className="text-sm text-muted">Could not search albums. Try again.</p>}
            {!albums.isFetching && !albums.isError && albums.data?.albums.length === 0 && <p className="text-sm text-muted">No albums found.</p>}
            {albums.data?.albums.map(item => <button key={item.id} type="button" onClick={() => { setAlbum(item); setArtFailed(false); }} className="flex items-center gap-3 border border-separator-strong p-3 text-left hover:bg-ink-soft">
              <Disc3 size={24} className="text-muted" /><span><span className="block text-sm font-bold">{item.name}</span><span className="text-xs text-muted">{[item.artist, item.year].filter(Boolean).join(' · ')}</span></span>
            </button>)}
          </div>}

          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2"><h2 className="text-sm font-bold">Flow tracks</h2><span className="text-xs text-muted">{tracks.length} of 3 · at least 2 required</span></div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[0, 1, 2].map(index => {
                const track = tracks[index];
                return <div key={index} onDragOver={event => event.preventDefault()} onDrop={event => {
                  event.preventDefault();
                  const selected = availableTracks.find(item => item.id === event.dataTransfer.getData('text/plain'));
                  if (selected) add(selected);
                }} className="min-w-0 border border-separator-strong bg-bg p-3">
                  <span className="text-xs text-muted">Track {index + 1}</span>
                  {track ? <><p className="mt-1 truncate text-sm font-bold" title={track.title}>{track.title}</p><p className="text-xs text-muted">{fmtDuration(track.duration) ?? 'Duration unknown'}</p>
                    <div className="mt-3 flex gap-1">
                      <Btn sm aria-label={`Remove ${track.title}`} onClick={() => setTracks(current => current.filter(item => item.id !== track.id))}><X size={14} /></Btn>
                    </div></> : <p className="mt-2 text-sm text-muted">Drag or add a track</p>}
                </div>;
              })}
            </div>
            {tracks.length > 0 && <p className="mt-2 text-xs text-muted">Add neighbouring tracks from the same album. They stay in album order.</p>}
            {tracks.length > 1 && albumLoaded && !selectionValid && <p role="alert" className="mt-2 text-sm text-muted">Choose consecutive tracks from this album, with no gaps.</p>}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <TextField control={nameForm.control} name="name" label="Flow name" placeholder="Name this Flow" maxLength={200} className="min-w-48 flex-1" />
            <Btn tone="accent" onClick={() => { void save(); }} disabled={!name.trim() || tracks.length < 2 || saveFlow.isPending || (albumLoaded && !selectionValid)}>{saveFlow.isPending ? 'Saving…' : editing ? 'Update Flow' : 'Save Flow'}</Btn>
            <Btn onClick={reset}>Clear</Btn>
          </div>

          {album && <div className="grid gap-4 border-t border-separator-strong pt-5 sm:grid-cols-[180px_minmax(0,1fr)]">
            <div>
              <div className="grid aspect-square w-full max-w-44 place-items-center overflow-hidden border border-separator-strong bg-ink-soft text-muted">{!artFailed && album.coverArt ? <img src={`${ADMIN_API_URL}/cover/${encodeURIComponent(album.coverArt)}`} alt="" className="h-full w-full object-cover" onError={() => setArtFailed(true)} /> : <Disc3 size={52} aria-label="Artwork unavailable" />}</div>
              <h2 className="mt-3 font-bold">{album.name}</h2><p className="text-sm text-muted">{[album.artist, album.year].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="min-w-0"><h2 className="mb-2 text-sm font-bold">Album tracks</h2><p className="mb-2 text-xs text-muted">Drag a track to a slot or use Add.</p>
              {albumTracks.isFetching && <p className="text-sm text-muted">Loading tracks…</p>}
              {albumTracks.isError && <p className="text-sm text-muted">Could not load this album. Search and try again.</p>}
              {!albumTracks.isFetching && !albumTracks.isError && availableTracks.length === 0 && <p className="text-sm text-muted">No tracks found for this album.</p>}
              {availableTracks.map((track, index) => <div key={track.id} draggable onDragStart={event => event.dataTransfer.setData('text/plain', track.id)} className="flex items-center gap-3 border-b border-separator-strong py-3">
                <span className="w-5 text-right text-xs text-muted">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm">{track.title}</span><span className="text-xs text-muted">{fmtDuration(track.duration)}</span>
                <Btn sm onClick={() => add(track)} disabled={!canAdd(track)} aria-label={`Add ${track.title} to Flow`}><Plus size={14} /> Add</Btn>
              </div>)}
            </div>
          </div>}
        </fieldset>
      </Card>

      <Card title="Saved Flows" sub={`${flows.length} Flow${flows.length === 1 ? '' : 's'}`}>
        {flowsQuery.isLoading ? <p className="text-sm text-muted">Loading Flows…</p> : flowsQuery.isError ? <p className="text-sm text-muted">Could not load saved Flows. Refresh the page to try again.</p> : flows.length === 0 ? <p className="text-sm text-muted">No Flows saved yet. Build one above to see it here.</p> : <div className="grid gap-3">{flows.map(flow =>
          <div key={flow.id} className="flex flex-wrap items-center gap-3 border border-separator-strong p-3">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{flow.name}</strong><Pill>{flow.enabled ? 'Enabled' : 'Disabled'}</Pill><Pill>{flow.verification === 'pending' ? 'Checking…' : flow.verification === 'verified' ? 'Audio checked at save' : 'Needs attention'}</Pill>{!flow.orderVerified && <Pill>Check track order</Pill>}</div><p className="mt-1 text-xs text-muted">{flow.tracks.map(track => track.title).join(' → ')}</p>{flow.verificationError && <p className="mt-1 text-xs text-muted">{flow.verificationError}</p>}</div>
            <Btn sm disabled={saveFlow.isPending} onClick={() => { setEditing({ id: flow.id, revision: flow.revision }); nameForm.reset({ name: flow.name }); setTracks([...flow.tracks]); setEnabled(flow.enabled); }}>Edit</Btn>
            <Btn sm disabled={setFlowEnabled.isPending} onClick={() => { void setFlowEnabled.mutateAsync(flow).catch(() => {}); }}>{flow.enabled ? 'Disable' : 'Enable'}</Btn>
            {(flow.verification === 'failed' || !flow.orderVerified) && <Btn sm disabled={saveFlow.isPending} onClick={() => { void saveFlow.mutateAsync({ id: flow.id, revision: flow.revision, name: flow.name, enabled: flow.enabled, trackIds: flow.tracks.map(track => track.id) }).catch(() => {}); }}>Check again</Btn>}
            <Btn sm disabled={deleteFlow.isPending} aria-label={`Delete ${flow.name}`} onClick={() => setPendingDelete(flow)}><Trash2 size={14} /></Btn>
          </div>)}</div>}
      </Card>
      <V3AlertDialog
        open={!!pendingDelete}
        onOpenChange={open => { if (!open) setPendingDelete(null); }}
        title="Delete Flow?"
        description={`Delete “${pendingDelete?.name ?? ''}”? This cannot be undone.`}
        confirmLabel="Delete Flow"
        cancelLabel="Cancel"
        danger
        onConfirm={() => {
          if (!pendingDelete || deleteFlow.isPending) return;
          const flow = pendingDelete;
          void deleteFlow.mutateAsync(flow).then(() => { if (editing?.id === flow.id) reset(); }).catch(() => {});
        }}
      />
    </div>
  );
}
