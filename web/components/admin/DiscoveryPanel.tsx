'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAdminAuth } from '../../lib/adminAuth';
import { Btn, Card, Eyebrow } from './ui';
import { Textarea } from '../ui/textarea';

type ToolInfo = { name: string; available: boolean; description: string | null };
type Catalog = { current: { id?: string; title?: string; artist?: string; genre?: string } | null; tools: ToolInfo[] };
type Comparison = { agentic: Array<{ round: number; source: string; tracks: Array<{ id: string; title: string; artist: string }> }>; shortlist: Array<{ round: number; source: string; tracks: Array<{ id: string; title: string; artist: string }> }> };

const DEFAULTS: Record<string, (current: Catalog['current']) => Record<string, unknown>> = {
  similarSongs: (current) => ({ songId: current?.id || '' }),
  tracksLikeThis: (current) => ({ songId: current?.id || '' }),
  tracksThatSoundLikeThis: (current) => ({ songId: current?.id || '' }),
  searchLibrary: (current) => ({ query: current?.artist || current?.title || '' }),
  topSongsByArtist: (current) => ({ artist: current?.artist || '' }),
  recentByArtist: (current) => ({ artist: current?.artist || '' }),
  songsByGenre: (current) => ({ genre: current?.genre || '' }),
  tracksByMood: () => ({ mood: 'night', energy: null }),
  tracksByEnergy: () => ({ energy: 'medium' }),
  searchByLyrics: () => ({ query: '' }),
  searchBySound: () => ({ query: '' }),
};

export default function DiscoveryPanel() {
  const { adminFetch, hydrated, needsAuth } = useAdminAuth();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selected, setSelected] = useState<ToolInfo | null>(null);
  const [args, setArgs] = useState('{}');
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [comparison, setComparison] = useState<Comparison | null>(null);

  const ready = hydrated && !needsAuth;
  useEffect(() => {
    if (!ready) return;
    void (async () => {
      try {
        const r = await adminFetch('/debug/discovery');
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error || `request failed (${r.status})`);
        setCatalog(body);
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    })();
  }, [adminFetch, ready]);

  const title = useMemo(() => catalog?.current
    ? `${catalog.current.title || 'Unknown track'} — ${catalog.current.artist || 'Unknown artist'}`
    : 'No live track', [catalog]);

  const choose = (tool: ToolInfo) => {
    setSelected(tool);
    setArgs(JSON.stringify(DEFAULTS[tool.name]?.(catalog?.current ?? null) ?? {}, null, 2));
    setResult(null);
    setError(null);
  };

  const run = async () => {
    if (!selected) return;
    let body: unknown;
    try { body = JSON.parse(args); } catch { setError('Tool input must be valid JSON.'); return; }
    setRunning(true); setError(null);
    try {
      const r = await adminFetch(`/debug/discovery/tool/${encodeURIComponent(selected.name)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const payload = await r.json();
      if (!r.ok) throw new Error(payload?.error || `request failed (${r.status})`);
      setResult(payload);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setRunning(false); }
  };

  const compare = async () => {
    setRunning(true); setError(null);
    try {
      const r = await adminFetch('/debug/discovery/compare', { method: 'POST' });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error || `request failed (${r.status})`);
      setComparison(body);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setRunning(false); }
  };

  return <div className="grid gap-4">
    <section className="card">
      <div className="border-b border-ink p-4">
        <Eyebrow className="text-vermilion">discovery bench</Eyebrow>
        <div className="mt-1.5 text-[22px] font-extrabold tracking-[-0.02em]">Run the DJ’s library tools, one at a time.</div>
        <p className="mt-1 text-[11px] leading-[1.6] text-muted">Individual tool checks are read-only. The comparison uses the live scope, runs one recorded Agentic Picker model call, and never queues music.</p>
      </div>
      <div className="p-3 text-[12px]"><span className="text-muted">Current scope:</span> {title}</div>
      <div className="border-t border-ink p-3"><Btn sm onClick={compare} disabled={running}>{running ? 'Comparing…' : 'Compare 3 rounds vs 3 passes'}</Btn></div>
    </section>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card title="Discovery tools" sub="available tools mirror this pick’s current scope">
        <div className="grid gap-2">
          {catalog?.tools.map(tool => <div key={tool.name} className="flex items-center gap-3 border-b border-separator-soft pb-2 last:border-0">
            <div className="min-w-0 flex-1"><div className="font-mono text-[13px] font-bold">{tool.name}</div><div className="mt-0.5 text-[10px] leading-[1.45] text-muted">{tool.description || 'Unavailable for this scope.'}</div></div>
            <Btn sm onClick={() => choose(tool)} disabled={!tool.available}>Run</Btn>
          </div>)}
          {!catalog && <span className="field-hint">Loading live picker scope…</span>}
        </div>
      </Card>
      <Card title={selected ? `Response — ${selected.name}` : 'Response'} sub="the tool’s direct result">
        {selected && <><label className="caption mb-1 block">Arguments (JSON)</label><Textarea value={args} onChange={e => setArgs(e.target.value)} rows={7} className="font-mono text-[11px]" />
          <div className="mt-2"><Btn sm onClick={run} disabled={running}>{running ? 'Running…' : 'Run tool'}</Btn></div></>}
        {error && <p className="mt-3 text-[12px] text-[var(--danger)]">{error}</p>}
        {result !== null && <pre className="term mt-3 max-h-[520px] overflow-auto text-[11px]">{JSON.stringify(result, null, 2)}</pre>}
        {!selected && <p className="field-hint italic">Choose an available tool to inspect its live response.</p>}
      </Card>
    </div>
    {comparison && <Card title="Paired discovery comparison" sub="same live scope · one recorded Agentic Picker call · no tracks queued">
      <div className="overflow-auto"><table className="w-full text-left text-[12px]"><thead><tr className="border-b border-separator-strong text-muted"><th className="p-2">Route</th><th className="p-2">Round</th><th className="p-2">Tool / source</th><th className="p-2">Returned tracks</th></tr></thead><tbody>
        {[...comparison.agentic.map(row => ({ ...row, route: 'Agentic Picker' })), ...comparison.shortlist.map(row => ({ ...row, route: 'Track Shortlist' }))].map((row, index) => <tr key={`${row.route}-${index}`} className="border-b border-separator-soft align-top"><td className="p-2 font-bold">{row.route}</td><td className="p-2">{row.round}</td><td className="p-2 font-mono">{row.source}</td><td className="p-2">{row.tracks.length ? row.tracks.map(track => <div key={track.id}>{track.artist} — {track.title}</div>) : '—'}</td></tr>)}
      </tbody></table></div>
    </Card>}
  </div>;
}
