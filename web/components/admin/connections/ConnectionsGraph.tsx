'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ConnectionEdge,
  ConnectionGraphData,
  ConnectionNode,
  PositionedConnectionNode,
} from './types';

type ViewBox = { x: number; y: number; width: number; height: number };
const INITIAL_VIEW: ViewBox = { x: -520, y: -360, width: 1040, height: 720 };

const KIND_ORDER: Record<ConnectionNode['kind'], number> = {
  artist: 0,
  contributor: 1,
  release: 2,
  series: 3,
  recording: 4,
  'external-recording': 5,
};

function displayTitle(value: string): string {
  return value.length > 28 ? `${value.slice(0, 26)}…` : value;
}

function layoutGraph(data: ConnectionGraphData): PositionedConnectionNode[] {
  const focus = data.nodes.find((node) => node.id === data.focusId);
  const others = data.nodes
    .filter((node) => node.id !== data.focusId)
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title));
  const positioned: PositionedConnectionNode[] = focus ? [{ ...focus, x: 0, y: 0 }] : [];
  const innerCount = Math.min(18, others.length);
  for (const [index, node] of others.entries()) {
    const outer = index >= innerCount;
    const ringIndex = outer ? index - innerCount : index;
    const ringCount = outer ? Math.max(1, others.length - innerCount) : Math.max(1, innerCount);
    const radiusX = outer ? 430 : 260;
    const radiusY = outer ? 290 : 190;
    const angle = -Math.PI / 2 + (ringIndex / ringCount) * Math.PI * 2 + (outer ? 0.12 : 0);
    positioned.push({ ...node, x: Math.cos(angle) * radiusX, y: Math.sin(angle) * radiusY });
  }
  return positioned;
}

function nodeShape(node: PositionedConnectionNode, selected: boolean) {
  const fill = node.local ? 'var(--ink)' : 'var(--surface)';
  const stroke = selected ? 'var(--accent)' : 'var(--ink)';
  const common = { fill, stroke, strokeWidth: selected ? 4 : 2 };
  if (node.kind === 'artist') return <circle r="31" {...common} />;
  if (node.kind === 'contributor') return <path d="M0 -31 L31 0 L0 31 L-31 0 Z" {...common} />;
  if (node.kind === 'release') return <rect x="-31" y="-25" width="62" height="50" rx="4" {...common} />;
  if (node.kind === 'series') return <path d="M-28 -17 L0 -33 L28 -17 L28 17 L0 33 L-28 17 Z" {...common} />;
  return <circle r={selected ? 31 : 27} {...common} strokeDasharray={node.local ? undefined : '6 4'} />;
}

export default function ConnectionsGraph({
  data,
  selectedNode,
  selectedEdge,
  onSelectNode,
  onSelectEdge,
  onOpenNode,
}: {
  data: ConnectionGraphData;
  selectedNode: string | null;
  selectedEdge: string | null;
  onSelectNode: (node: ConnectionNode) => void;
  onSelectEdge: (edge: ConnectionEdge) => void;
  onOpenNode: (node: ConnectionNode) => void;
}) {
  const nodes = useMemo(() => layoutGraph(data), [data]);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const [view, setView] = useState<ViewBox>(INITIAL_VIEW);
  const drag = useRef<{ x: number; y: number; viewX: number; viewY: number; moved: boolean } | null>(null);

  useEffect(() => setView(INITIAL_VIEW), [data.focusId]);

  function zoom(factor: number, clientX?: number, clientY?: number, element?: SVGSVGElement) {
    setView((current) => {
      const nextWidth = Math.min(2400, Math.max(360, current.width * factor));
      const nextHeight = nextWidth * (current.height / current.width);
      if (!element || clientX == null || clientY == null) {
        return { x: current.x + (current.width - nextWidth) / 2, y: current.y + (current.height - nextHeight) / 2, width: nextWidth, height: nextHeight };
      }
      const rect = element.getBoundingClientRect();
      const fx = (clientX - rect.left) / rect.width;
      const fy = (clientY - rect.top) / rect.height;
      return {
        x: current.x + fx * (current.width - nextWidth),
        y: current.y + fy * (current.height - nextHeight),
        width: nextWidth,
        height: nextHeight,
      };
    });
  }

  return (
    <div className="relative min-h-[34rem] overflow-hidden rounded-md border border-border bg-[var(--page-bg)]">
      <svg
        className="absolute inset-0 size-full touch-none select-none"
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        role="img"
        aria-label={`Connections graph with ${data.nodes.length} nodes and ${data.edges.length} relationships`}
        onWheel={(event) => {
          event.preventDefault();
          zoom(event.deltaY > 0 ? 1.13 : 0.885, event.clientX, event.clientY, event.currentTarget);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y, moved: false };
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) start.moved = true;
          setView((current) => ({ ...current,
            x: start.viewX - dx * (current.width / rect.width),
            y: start.viewY - dy * (current.height / rect.height),
          }));
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <defs>
          <marker id="connection-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted)" />
          </marker>
        </defs>
        {data.edges.map((edge) => {
          const source = byId.get(edge.source);
          const target = byId.get(edge.target);
          if (!source || !target) return null;
          const chosen = selectedEdge === edge.id;
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const distance = Math.max(1, Math.hypot(dx, dy));
          const inset = 36;
          const sourceX = source.x + (dx / distance) * inset;
          const sourceY = source.y + (dy / distance) * inset;
          const targetX = target.x - (dx / distance) * inset;
          const targetY = target.y - (dy / distance) * inset;
          return (
            <g key={edge.id} role="button" tabIndex={0} aria-label={`${source.title} ${edge.label} ${target.title}`}
              onClick={(event) => { event.stopPropagation(); onSelectEdge(edge); }}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectEdge(edge); } }}
              className="cursor-pointer outline-none">
              <line x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}
                stroke="transparent" strokeWidth="18" />
              <line x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}
                stroke={chosen ? 'var(--accent)' : 'var(--muted)'} strokeWidth={chosen ? 3 : 1.5}
                markerEnd="url(#connection-arrow)" opacity={chosen ? 1 : 0.72} />
              <rect x={midX - 42} y={midY - 10} width="84" height="20" rx="4"
                fill="var(--surface)" stroke={chosen ? 'var(--accent)' : 'var(--soft-border)'} />
              <text x={midX} y={midY + 4} textAnchor="middle" fill="var(--muted)" fontSize="10">
                {edge.label.length > 15 ? `${edge.label.slice(0, 14)}…` : edge.label}
              </text>
            </g>
          );
        })}
        {nodes.map((node) => {
          const selected = selectedNode === node.id;
          const textFill = node.local ? 'var(--bg)' : 'var(--ink)';
          return (
            <g key={node.id} transform={`translate(${node.x} ${node.y})`} role="button" tabIndex={0}
              aria-label={`${node.title}, ${node.kind.replaceAll('-', ' ')}${node.local ? ', in library' : ', external'}`}
              className="cursor-pointer outline-none"
              onClick={(event) => { event.stopPropagation(); onSelectNode(node); }}
              onDoubleClick={(event) => { event.stopPropagation(); if (node.expandable) onOpenNode(node); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectNode(node); }
                if (event.key === 'Enter' && event.shiftKey && node.expandable) onOpenNode(node);
              }}>
              {nodeShape(node, selected)}
              <text textAnchor="middle" y="4" fill={textFill} fontSize="10" fontWeight="700">
                {node.kind === 'series' ? 'LIST' : node.kind === 'release' ? 'ALBUM' : node.kind === 'artist' ? 'ARTIST' : node.kind === 'contributor' ? 'CREDIT' : 'TRACK'}
              </text>
              <text textAnchor="middle" y="49" fill="var(--ink)" fontSize="12" fontWeight="700">
                {displayTitle(node.title)}
              </text>
              {node.subtitle && <text textAnchor="middle" y="65" fill="var(--muted)" fontSize="10">{displayTitle(node.subtitle)}</text>}
            </g>
          );
        })}
      </svg>
      <div className="absolute top-3 right-3 flex gap-1 rounded-md border border-border bg-card p-1">
        <button type="button" onClick={() => zoom(0.82)} className="size-8 text-lg hover:bg-muted/40" aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoom(1.22)} className="size-8 text-lg hover:bg-muted/40" aria-label="Zoom out">−</button>
        <button type="button" onClick={() => setView(INITIAL_VIEW)} className="px-2 text-xs font-medium hover:bg-muted/40">Fit</button>
      </div>
      <div className="absolute bottom-3 left-3 rounded-md border border-border bg-card/95 px-2 py-1 text-[10px] text-muted">
        Drag to move · wheel to zoom · double-click a local node to open
      </div>
    </div>
  );
}
