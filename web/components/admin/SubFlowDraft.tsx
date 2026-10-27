'use client';

import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Disc3, Plus, Search, Trash2, X } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../ui/input-group';
import { Btn, Card, Pill } from './ui';

// UI-only example until the Flow store and album catalogue are connected.
type Track = { id: string; title: string; duration: string };
type Flow = { id: string; name: string; tracks: Track[]; enabled: boolean };

const exampleTracks: Track[] = [
  { id: 'intro', title: 'Intro', duration: '0:23' },
  { id: 'eat-the-rich', title: 'Eat the Rich', duration: '4:11' },
];

export default function SubFlowDraft() {
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [name, setName] = useState('');
  const [flows, setFlows] = useState<Flow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);

  const reset = () => { setTracks([]); setName(''); setEditing(null); setEnabled(true); };
  const add = (track: Track, index = tracks.length) => {
    if (tracks.some(t => t.id === track.id) || tracks.length >= 3) return;
    setTracks(current => {
      if (current.some(t => t.id === track.id) || current.length >= 3) return current;
      const next = [...current];
      next.splice(Math.min(index, current.length), 0, track);
      return next;
    });
  };
  const move = (index: number, direction: number) => {
    setTracks(current => {
      const other = index + direction;
      if (other < 0 || other >= current.length) return current;
      const next = [...current];
      const first = next[index];
      const second = next[other];
      if (!first || !second) return current;
      next[index] = second;
      next[other] = first;
      return next;
    });
  };
  const save = () => {
    if (!name.trim() || tracks.length < 2) return;
    const flow = { id: editing ?? crypto.randomUUID(), name: name.trim(), tracks: [...tracks], enabled };
    setFlows(current => editing ? current.map(item => item.id === editing ? flow : item) : [...current, flow]);
    reset();
  };
  const findAlbum = (event: FormEvent) => { event.preventDefault(); setSearched(true); setAlbumOpen(false); };
  const matches = /aerosmith|get a grip|intro|eat the rich/i.test(query.trim());

  return (
    <div className="grid min-w-0 gap-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Sub/Flow</h1>
        <p className="mt-1 text-sm text-muted">Keep two or three album tracks together, in the order they were meant to play.</p>
      </div>
      <div role="status" className="border border-separator-strong bg-bg p-3 text-sm text-muted">
        UI draft: search uses an example album, and saved Flows last only until this page is refreshed. Playback and track verification are not connected yet.
      </div>
      <Card title="Build a Sub/Flow" sub="Choose an album, then add its tracks in order">
        <div className="grid gap-5">
          <form onSubmit={findAlbum} className="flex flex-wrap gap-2">
            <InputGroup className="min-w-0 flex-1">
              <InputGroupAddon><Search /></InputGroupAddon>
              <InputGroupInput aria-label="Search example albums" placeholder="Search albums or artists" value={query} onChange={event => setQuery(event.target.value)} />
            </InputGroup>
            <Btn type="submit" tone="accent" disabled={!query.trim()}>Search</Btn>
          </form>
          {searched && !albumOpen && (matches ? (
            <button type="button" onClick={() => setAlbumOpen(true)} className="flex items-center gap-3 border border-separator-strong p-3 text-left hover:bg-ink-soft">
              <Disc3 size={24} className="text-muted" />
              <span><span className="block text-sm font-bold">Get a Grip</span><span className="text-xs text-muted">Aerosmith · 1993 · example album</span></span>
            </button>
          ) : <p className="text-sm text-muted">No example albums found. Try “Get a Grip”.</p>)}

          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2"><h2 className="text-sm font-bold">Flow tracks</h2><span className="text-xs text-muted">{tracks.length} of 3 · at least 2 required</span></div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[0, 1, 2].map(index => {
                const track = tracks[index];
                return <div key={index} onDragOver={event => event.preventDefault()} onDrop={event => {
                  event.preventDefault();
                  const selected = exampleTracks.find(item => item.id === event.dataTransfer.getData('text/plain'));
                  if (selected) add(selected, index);
                }} className="min-w-0 border border-separator-strong bg-bg p-3">
                  <span className="text-xs text-muted">Track {index + 1}</span>
                  {track ? <><p className="mt-1 truncate text-sm font-bold" title={track.title}>{track.title}</p><p className="text-xs text-muted">{track.duration}</p>
                    <div className="mt-3 flex gap-1">
                      <Btn sm aria-label={`Move ${track.title} earlier`} onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp size={14} /></Btn>
                      <Btn sm aria-label={`Move ${track.title} later`} onClick={() => move(index, 1)} disabled={index === tracks.length - 1}><ArrowDown size={14} /></Btn>
                      <Btn sm aria-label={`Remove ${track.title}`} onClick={() => setTracks(current => current.filter(item => item.id !== track.id))}><X size={14} /></Btn>
                    </div></> : <p className="mt-2 text-sm text-muted">Drag or add a track</p>}
                </div>;
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-48 flex-1 gap-1 text-sm font-semibold">Flow name
              <input className="min-h-10 border border-separator-strong bg-bg px-3 text-sm font-normal text-ink" value={name} onChange={event => setName(event.target.value)} placeholder="Name this Flow" />
            </label>
            <Btn tone="accent" onClick={save} disabled={!name.trim() || tracks.length < 2}>{editing ? 'Update draft' : 'Save draft'}</Btn>
            <Btn onClick={reset}>Clear</Btn>
          </div>

          {albumOpen && <div className="grid gap-4 border-t border-separator-strong pt-5 sm:grid-cols-[180px_minmax(0,1fr)]">
            <div>
              <div className="grid aspect-square w-full max-w-44 place-items-center border border-separator-strong bg-ink-soft text-muted"><Disc3 size={52} aria-label="Artwork placeholder" /></div>
              <h2 className="mt-3 font-bold">Get a Grip</h2><p className="text-sm text-muted">Aerosmith · 1993</p><p className="mt-1 text-xs text-muted">Example album · artwork not connected</p>
            </div>
            <div className="min-w-0"><h2 className="mb-2 text-sm font-bold">Album tracks</h2><p className="mb-2 text-xs text-muted">Drag a track to a slot or use Add.</p>
              {exampleTracks.map((track, index) => <div key={track.id} draggable onDragStart={event => event.dataTransfer.setData('text/plain', track.id)} className="flex items-center gap-3 border-b border-separator-strong py-3">
                <span className="w-5 text-right text-xs text-muted">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm">{track.title}</span><span className="text-xs text-muted">{track.duration}</span>
                <Btn sm onClick={() => add(track)} disabled={tracks.some(item => item.id === track.id) || tracks.length >= 3} aria-label={`Add ${track.title} to Flow`}><Plus size={14} /> Add</Btn>
              </div>)}
            </div>
          </div>}
        </div>
      </Card>

      <Card title="Saved Flows" sub={`${flows.length} draft${flows.length === 1 ? '' : 's'} in this session`}>
        {flows.length === 0 ? <p className="text-sm text-muted">No Flows saved yet. Build one above to see it here.</p> : <div className="grid gap-3">{flows.map(flow =>
          <div key={flow.id} className="flex flex-wrap items-center gap-3 border border-separator-strong p-3">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{flow.name}</strong><Pill>{flow.enabled ? 'Enabled' : 'Disabled'}</Pill></div><p className="mt-1 text-xs text-muted">{flow.tracks.map(track => track.title).join(' → ')}</p></div>
            <Btn sm onClick={() => { setEditing(flow.id); setName(flow.name); setTracks([...flow.tracks]); setEnabled(flow.enabled); }}>Edit</Btn>
            <Btn sm onClick={() => setFlows(current => current.map(item => item.id === flow.id ? { ...item, enabled: !item.enabled } : item))}>{flow.enabled ? 'Disable' : 'Enable'}</Btn>
            <Btn sm aria-label={`Delete ${flow.name}`} onClick={() => { setFlows(current => current.filter(item => item.id !== flow.id)); if (editing === flow.id) reset(); }}><Trash2 size={14} /></Btn>
          </div>)}</div>}
      </Card>
    </div>
  );
}
