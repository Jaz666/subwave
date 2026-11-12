'use client';

import { useState } from 'react';
import { Check, Download, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminAuth } from '../../../lib/adminAuth';
import { AdminResponseError, adminJson, useAdminMutation, useAdminQuery } from '../../../lib/admin-query';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { V3AlertDialog } from '../../ui/alert-dialog';
import { libraryKeys } from '../library/queries';
import type { PlaylistSummary } from '../library/types';

type ExportResult = { playlistId: string | null; name: string; added: number };

export function SubbeatsPlaylistExport({ preparedCount, loading }: { preparedCount: number; loading: boolean }) {
  const { adminFetch, hydrated, needsAuth } = useAdminAuth();
  const ready = hydrated && !needsAuth;
  const queryClient = useQueryClient();
  const playlists = useAdminQuery({
    key: libraryKeys.playlists(), adminFetch, enabled: ready,
    request: async (fetcher, signal) => (await adminJson<{ playlists?: PlaylistSummary[] }>(fetcher, '/playlists', undefined, signal)).playlists ?? [],
  });
  const [name, setName] = useState('Sub/Beats Prepared Tracks');
  const [playlistId, setPlaylistId] = useState('');
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const save = useAdminMutation({
    adminFetch,
    request: async (_: void, fetcher) => adminJson<ExportResult>(fetcher, '/library/subbeats/playlist-export', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), ...(playlistId ? { playlistId } : {}) }),
    }),
    onDone: async (value) => {
      setResult(value);
      setConfirmOverwrite(false);
      await queryClient.invalidateQueries({ queryKey: libraryKeys.playlists() });
    },
  });
  const error = save.error instanceof AdminResponseError && typeof save.error.body.error === 'string'
    ? save.error.body.error : save.error instanceof Error ? save.error.message : '';
  const submit = () => {
    if (!playlistId) save.mutate(undefined);
    else setConfirmOverwrite(true);
  };
  const savePlaylist = () => { setConfirmOverwrite(false); save.mutate(undefined); };

  return <section className="max-w-3xl border border-ink p-4 sm:p-6" aria-labelledby="subbeats-playlist-export">
    <h2 id="subbeats-playlist-export" className="font-display text-xl font-bold">Playlist Export</h2>
    <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
      Create a Navidrome playlist from every currently prepared Sub/Beats track. Tracks still queued, preparing, or without a saved Sub/Beats bundle are left out.
    </p>

    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="subbeats-export-name" className="mb-1 block text-sm font-medium">Playlist name</label>
        <Input id="subbeats-export-name" className="min-h-11" value={name} maxLength={120} onChange={event => { setName(event.target.value); setResult(null); }} />
      </div>
      <div>
        <label htmlFor="subbeats-export-target" className="mb-1 block text-sm font-medium">Save to</label>
        <select id="subbeats-export-target" className="h-11 w-full min-w-0 border border-ink bg-bg px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" value={playlistId} onChange={event => { setPlaylistId(event.target.value); setResult(null); }}>
          <option value="">Create a new playlist</option>
          {(playlists.data ?? []).map(playlist => <option key={playlist.id} value={playlist.id}>Replace: {playlist.name}</option>)}
        </select>
      </div>
    </div>

    <div className="mt-5 flex flex-wrap items-center gap-3">
      <Button className="min-h-11" disabled={!ready || loading || !name.trim() || preparedCount === 0 || save.isPending || playlists.isLoading} onClick={submit}>
        {save.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Download />}
        {save.isPending ? 'Saving playlist…' : playlistId ? 'Replace playlist' : 'Create playlist'}
      </Button>
      <span className="text-sm text-muted tabular-nums" role="status">{loading ? 'Loading prepared tracks…' : `${preparedCount.toLocaleString()} prepared ${preparedCount === 1 ? 'track' : 'tracks'} ready to export`}</span>
    </div>

    {playlists.isError && <p role="alert" className="mt-3 text-sm">Could not load existing playlists. Refresh the page to try again.</p>}
    {!loading && preparedCount === 0 && <p className="mt-3 text-sm text-muted">Prepare tracks on Explore before creating a playlist.</p>}
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
    {result && <p role="status" className="mt-3 flex items-center gap-2 text-sm"><Check size={16} /> {result.added.toLocaleString()} prepared tracks saved to “{result.name}”.</p>}

    <V3AlertDialog open={confirmOverwrite} onOpenChange={setConfirmOverwrite}
      title="Replace this playlist?" confirmLabel="Replace playlist" danger
      description={`This replaces all tracks in “${playlists.data?.find(item => item.id === playlistId)?.name ?? 'the selected playlist'}” with the ${preparedCount.toLocaleString()} currently prepared Sub/Beats tracks.`}
      onConfirm={savePlaylist} />
  </section>;
}
