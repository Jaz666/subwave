import type { BrainCoverage, ConnectionGraphData } from './types';

export const COVERAGE_LABELS: Record<BrainCoverage['state'], string> = {
  ready: 'Stories ready', empty: 'Researched, nothing usable', unexplored: 'Unexplored',
  queued: 'Queued', researching: 'Researching', incomplete: 'Research incomplete',
};
export const COVERAGE_COLORS: Record<BrainCoverage['state'], string> = {
  ready: '#64d8ca', empty: '#eecb81', unexplored: '#8490a4', queued: '#8da8ee', researching: '#8da8ee', incomplete: '#ee8a8a',
};

export function withBrainCoverage(graph: ConnectionGraphData | undefined, artists: Record<string, BrainCoverage> | undefined): ConnectionGraphData | undefined {
  if (!graph || !artists) return graph;
  return { ...graph, nodes: graph.nodes.map(node => ({ ...node, coverage: node.kind === 'artist'
    ? artists[node.id] ?? (node.localArtistId ? artists[`library-artist:${node.localArtistId}`] : undefined) : undefined })) };
}
