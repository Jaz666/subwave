import type { ConnectionEdgeType } from './types';

export const EDGE_FILTERS: Array<{ id: ConnectionEdgeType; label: string }> = [
  { id: 'samples', label: 'Samples' }, { id: 'sampled-in', label: 'Sampled by' },
  { id: 'cover-of', label: 'Cover of' }, { id: 'covered-by', label: 'Covered by' },
  { id: 'producer', label: 'Producer' }, { id: 'writer', label: 'Writer' },
  { id: 'performed-by', label: 'Artists' }, { id: 'appears-on', label: 'Albums' },
  { id: 'series-membership', label: 'Lists' },
];
export const ALL_EDGE_TYPES = EDGE_FILTERS.map((filter) => filter.id);
export const LEGEND_GROUPS: Array<{ label: string; types: ConnectionEdgeType[]; className: string; symbol: string; overview: boolean }> = [
  { label: 'Samples', types: ['samples', 'sampled-in'], className: 'text-[#ff8155]', symbol: '●', overview: true },
  { label: 'Covers', types: ['cover-of', 'covered-by'], className: 'text-[#64d8ca]', symbol: '●', overview: true },
  { label: 'Writers / producers', types: ['writer', 'producer'], className: 'text-[#b698ee]', symbol: '◆', overview: true },
  { label: 'Artists / albums / lists', types: ['performed-by', 'appears-on', 'series-membership'], className: 'text-[#8e96ad]', symbol: '●', overview: false },
];

export function toggleConnectionGroup(current: readonly ConnectionEdgeType[], group: readonly ConnectionEdgeType[]): ConnectionEdgeType[] {
  const hide = group.some((type) => current.includes(type));
  return ALL_EDGE_TYPES.filter((type) => group.includes(type) ? !hide : current.includes(type));
}
