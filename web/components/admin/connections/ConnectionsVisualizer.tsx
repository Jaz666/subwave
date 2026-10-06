'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink, LocateFixed, Search, X } from 'lucide-react';
import type { NowPlayingResponse } from '../../../lib/types';
import { adminJson, type AdminFetch, useAdminQuery } from '../../../lib/admin-query';
import { Card, Eyebrow, Pill } from '../ui';
import ConnectionsGraph from './ConnectionsGraph';
import {
  connectionKeys,
  loadConnectionGraph,
  resolveCurrentConnection,
  searchConnectionEntities,
} from './queries';
import type {
  ConnectionEdgeType,
  ConnectionEntityType,
  ConnectionGraphData,
  ConnectionNode,
} from './types';

const EDGE_FILTERS: Array<{ id: ConnectionEdgeType; label: string }> = [
  { id: 'samples', label: 'Samples' },
  { id: 'sampled-in', label: 'Sampled by' },
  { id: 'cover-of', label: 'Cover of' },
  { id: 'covered-by', label: 'Covered by' },
  { id: 'producer', label: 'Producer' },
  { id: 'writer', label: 'Writer' },
  { id: 'performed-by', label: 'Artists' },
  { id: 'appears-on', label: 'Albums' },
  { id: 'series-membership', label: 'Lists' },
];
const ENTITY_TYPES = new Set<ConnectionEntityType>(['artist', 'recording', 'release', 'release-group', 'series']);

function providerName(value: string): string {
  if (value === 'musicbrainz') return 'MusicBrainz';
  if (value === 'genius') return 'Genius';
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : 'Source';
}

function entityLabel(node: ConnectionNode): string {
  if (node.kind === 'external-recording') return 'External track';
  if (node.kind === 'contributor') return 'Credited person';
  if (node.kind === 'release') return 'Album or release';
  if (node.kind === 'series') return 'Editorial list';
  return node.kind.charAt(0).toUpperCase() + node.kind.slice(1);
}

export default function ConnectionsVisualizer({
  adminFetch,
  hydrated,
}: {
  adminFetch: AdminFetch;
  hydrated: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawType = searchParams.get('focusType');
  const focusType = rawType && ENTITY_TYPES.has(rawType as ConnectionEntityType)
    ? rawType as ConnectionEntityType
    : null;
  const focusId = searchParams.get('focusId')?.trim() || null;
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [includeExternal, setIncludeExternal] = useState(true);
  const [edgeTypes, setEdgeTypes] = useState<ConnectionEdgeType[]>(() => EDGE_FILTERS.map((item) => item.id));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [currentMessage, setCurrentMessage] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(draft.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const search = useAdminQuery({
    key: connectionKeys.search(query),
    adminFetch,
    enabled: hydrated && query.length >= 2,
    request: (fetcher, signal) => searchConnectionEntities(fetcher, query, signal),
    staleTime: 30_000,
  });
  const graph = useAdminQuery({
    key: connectionKeys.graph(focusType ?? '', focusId ?? '', edgeTypes),
    adminFetch,
    enabled: hydrated && !!focusType && !!focusId,
    request: (fetcher, signal) => {
      if (!focusType || !focusId) throw new Error('Choose a Connections entity first.');
      return loadConnectionGraph(fetcher, focusType, focusId, edgeTypes, signal);
    },
    staleTime: 30_000,
  });
  const nowPlaying = useAdminQuery<NowPlayingResponse>({
    key: [...connectionKeys.all(), 'now-playing'],
    adminFetch,
    enabled: hydrated,
    request: (fetcher, signal) => adminJson(fetcher, '/now-playing', undefined, signal),
    staleTime: 5_000,
  });

  function choose(entityType: ConnectionEntityType, entityId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'connections');
    params.set('focusType', entityType);
    params.set('focusId', entityId);
    router.replace(`${pathname ?? '/admin/notes'}?${params.toString()}`, { scroll: false });
    setDraft('');
    setQuery('');
    setSelectedEdgeId(null);
    setSelectedNodeId(null);
  }

  function clearFocus() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('focusType');
    params.delete('focusId');
    params.set('tab', 'connections');
    router.replace(`${pathname ?? '/admin/notes'}?${params.toString()}`, { scroll: false });
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }

  async function openCurrentTrack() {
    const localTrackId = nowPlaying.data?.nowPlaying?.subsonic_id;
    if (!localTrackId) {
      setCurrentMessage('There is no identified track on air right now.');
      return;
    }
    setCurrentMessage('Finding the current track…');
    try {
      const result = await resolveCurrentConnection(adminFetch, localTrackId);
      setCurrentMessage('');
      choose(result.entityType, result.entityId);
    } catch (error) {
      setCurrentMessage(error instanceof Error ? error.message : 'The current track has not been matched yet.');
    }
  }

  const visibleGraph = useMemo<ConnectionGraphData | null>(() => {
    if (!graph.data) return null;
    if (includeExternal) return graph.data;
    const nodes = graph.data.nodes.filter((node) => node.local || node.id === graph.data?.focusId);
    const ids = new Set(nodes.map((node) => node.id));
    return { ...graph.data, nodes, edges: graph.data.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) };
  }, [graph.data, includeExternal]);

  useEffect(() => {
    if (!visibleGraph) return;
    if (selectedNodeId && visibleGraph.nodes.some((node) => node.id === selectedNodeId)) return;
    setSelectedNodeId(visibleGraph.focusId);
    setSelectedEdgeId(null);
  }, [selectedNodeId, visibleGraph]);

  const selectedNode = visibleGraph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = visibleGraph?.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedEdgeEndpoints = selectedEdge && visibleGraph ? {
    source: visibleGraph.nodes.find((node) => node.id === selectedEdge.source) ?? null,
    target: visibleGraph.nodes.find((node) => node.id === selectedEdge.target) ?? null,
  } : null;

  function toggleEdge(type: ConnectionEdgeType) {
    setEdgeTypes((current) => current.includes(type)
      ? current.filter((value) => value !== type)
      : EDGE_FILTERS.map((item) => item.id).filter((value) => value === type || current.includes(value)));
  }

  return (
    <div className="space-y-5">
      <Card title="Connections visualizer" sub="source-backed relationships between the music and people around your library">
        <div className="grid gap-3 xl:grid-cols-[minmax(18rem,1fr)_auto]">
          <div className="relative">
            <label className="relative block">
              <span className="sr-only">Search Connections</span>
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input value={draft} onChange={(event) => setDraft(event.target.value)}
                placeholder="Search tracks, artists, albums or lists…"
                className="w-full rounded-md border border-border bg-transparent py-2.5 pr-9 pl-9 text-[13px] outline-none focus:border-primary" />
              {draft && <button type="button" onClick={() => setDraft('')} aria-label="Clear search"
                className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-muted hover:text-ink"><X className="size-4" /></button>}
            </label>
            {query.length >= 2 && (
              <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
                {search.isLoading && <p className="px-3 py-3 text-xs text-muted">Searching…</p>}
                {search.error && <p className="px-3 py-3 text-xs text-muted">Connections search is temporarily unavailable.</p>}
                {search.data?.map((result) => (
                  <button key={result.nodeId} type="button" onClick={() => choose(result.entityType, result.entityId)}
                    className="flex w-full items-center justify-between gap-3 border-b border-border/50 px-3 py-2.5 text-left last:border-0 hover:bg-muted/20">
                    <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{result.title}</span>
                      <span className="block truncate text-xs text-muted">{result.subtitle || result.kind}</span></span>
                    <Pill tone="default">{result.kind}</Pill>
                  </button>
                ))}
                {!search.isLoading && search.data?.length === 0 && <p className="px-3 py-3 text-xs text-muted">No retained Connections entities match.</p>}
              </div>
            )}
          </div>
          <button type="button" onClick={() => void openCurrentTrack()}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted/30">
            <LocateFixed className="size-4" aria-hidden="true" /> Current track
          </button>
        </div>
        {currentMessage && <p role="status" className="mt-2 text-xs text-muted">{currentMessage}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {EDGE_FILTERS.map((filter) => <Pill key={filter.id} onClick={() => toggleEdge(filter.id)} pressed={edgeTypes.includes(filter.id)}>{filter.label}</Pill>)}
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
          <Pill onClick={() => setIncludeExternal((value) => !value)} pressed={includeExternal}>External music</Pill>
          {focusType && focusId && <button type="button" onClick={clearFocus} className="ml-auto text-xs font-medium text-primary hover:underline">Choose another starting point</button>}
        </div>
      </Card>

      {!focusType || !focusId ? (
        <div className="grid items-start gap-5 lg:grid-cols-3">
          <Card title="Choose where to begin" sub="the graph opens around one known entity">
            <p className="text-[13px] leading-[1.55] text-muted">Search for a track, artist, album or editorial list, or open the track currently on air. Connections loads a bounded neighbourhood and never starts provider research.</p>
          </Card>
          <Card title="Relationship direction" sub="the label reads from the first node to the second">
            <p className="text-[13px] leading-[1.55] text-muted">Samples, covers, writers and producers retain their source direction. Select any line to inspect the supporting source.</p>
          </Card>
          <Card title="Local and external music" sub="solid nodes are matched to this library">
            <p className="text-[13px] leading-[1.55] text-muted">Outlined nodes are source-backed connections that are not currently matched to a local recording. They remain useful context without being presented as library tracks.</p>
          </Card>
        </div>
      ) : graph.isLoading ? (
        <Card title="Drawing connections"><p className="text-[13px] text-muted">Loading the source-backed neighbourhood…</p></Card>
      ) : graph.error ? (
        <Card title="Could not load Connections">
          <p className="text-[13px] text-muted">{graph.error instanceof Error ? graph.error.message : 'The graph is temporarily unavailable.'}</p>
          <button type="button" onClick={() => void graph.refetch()} className="mt-3 text-[13px] font-medium text-primary hover:underline">Try again</button>
        </Card>
      ) : visibleGraph ? (
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Card title="Relationship map" sub={`${visibleGraph.nodes.length} entities · ${visibleGraph.edges.length} source-backed links`}>
            {edgeTypes.length === 0 ? <p className="py-16 text-center text-[13px] text-muted">Select at least one relationship type.</p> : (
              <>
                <div className="hidden md:block">
                  <ConnectionsGraph data={visibleGraph} selectedNode={selectedNodeId} selectedEdge={selectedEdgeId}
                    onSelectNode={(node) => { setSelectedNodeId(node.id); setSelectedEdgeId(null); }}
                    onSelectEdge={(edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); }}
                    onOpenNode={(node) => {
                      if (ENTITY_TYPES.has(node.entityType as ConnectionEntityType)) choose(node.entityType as ConnectionEntityType, node.entityId);
                    }} />
                </div>
                <div className="space-y-2 md:hidden">
                  {visibleGraph.edges.map((edge) => {
                    const source = visibleGraph.nodes.find((node) => node.id === edge.source);
                    const target = visibleGraph.nodes.find((node) => node.id === edge.target);
                    return <button key={edge.id} type="button" onClick={() => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); }}
                      className="w-full rounded-md border border-border/70 p-3 text-left text-[13px] hover:bg-muted/20">
                      <span className="font-medium">{source?.title}</span> <span className="text-muted">{edge.label}</span> <span className="font-medium">{target?.title}</span>
                    </button>;
                  })}
                </div>
              </>
            )}
            {visibleGraph.truncated && <p className="mt-3 text-xs text-muted">This neighbourhood reached the display limit. Open a connected local node to continue exploring.</p>}
          </Card>
          <Card title={selectedEdge ? 'Relationship evidence' : selectedNode ? entityLabel(selectedNode) : 'Details'}
            sub={selectedEdge ? providerName(selectedEdge.provider) : selectedNode?.local ? 'matched to this library' : 'external or unresolved'}>
            {selectedEdge && selectedEdgeEndpoints ? (
              <div className="space-y-4">
                <p className="text-[15px] leading-6"><strong>{selectedEdgeEndpoints.source?.title}</strong> {selectedEdge.label} <strong>{selectedEdgeEndpoints.target?.title}</strong></p>
                <div><Eyebrow>Evidence</Eyebrow><p className="mt-1 text-[13px] leading-[1.55] text-muted">{selectedEdge.evidence}</p></div>
                {selectedEdge.attribution && <p className="text-xs leading-5 text-muted">{selectedEdge.attribution}</p>}
                {selectedEdge.sourceUrl && <a href={selectedEdge.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Open source <ExternalLink className="size-3" /></a>}
              </div>
            ) : selectedNode ? (
              <div className="space-y-4">
                <div><h3 className="text-lg font-semibold">{selectedNode.title}</h3>{selectedNode.subtitle && <p className="text-[13px] text-muted">{selectedNode.subtitle}</p>}</div>
                <div className="flex flex-wrap gap-2"><Pill tone={selectedNode.local ? 'solid' : 'default'}>{selectedNode.local ? 'In library' : 'External'}</Pill><Pill tone="ink">{entityLabel(selectedNode)}</Pill></div>
                {selectedNode.expandable && ENTITY_TYPES.has(selectedNode.entityType as ConnectionEntityType) && (
                  <button type="button" onClick={() => choose(selectedNode.entityType as ConnectionEntityType, selectedNode.entityId)} className="block text-[13px] font-medium text-primary hover:underline">Open this neighbourhood</button>
                )}
                {selectedNode.local && selectedNode.entityType !== 'series' && <Link href="/admin/notes?tab=explore" className="block text-[13px] font-medium text-primary hover:underline">Browse Sleeve Notes dossiers</Link>}
                {selectedNode.sourceUrl && <a href={selectedNode.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Open source <ExternalLink className="size-3" /></a>}
              </div>
            ) : <p className="text-[13px] text-muted">Select a node or relationship to inspect it.</p>}
            <div className="mt-5 border-t border-border/60 pt-4 text-xs leading-5 text-muted">
              Credit names marked “identity unresolved” are kept separate. Connections never merges people on a matching name alone.
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
