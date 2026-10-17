'use client';

import dynamic from 'next/dynamic';
import type { BrainCanvasProps } from './BrainCanvas';

const BrainCanvas = dynamic<BrainCanvasProps>(() => import('./BrainCanvas'), {
  ssr: false,
  loading: () => <div role="status" className="flex h-[34rem] items-center justify-center text-sm text-muted">Waking the Station Brain…</div>,
});

export default function ConnectionsGraph(props: BrainCanvasProps) {
  return <BrainCanvas {...props} />;
}
