'use client';

import { Card } from '../ui';
import type { DebugSleeveNotes } from './types';

export function SleeveNotesCalls({ sleeveNotes }: { sleeveNotes?: DebugSleeveNotes }) {
  const calls = sleeveNotes?.recentCalls ?? [];
  return (
    <Card title="Sleeve Notes provider calls" sub={`${calls.length} recent HTTP call${calls.length === 1 ? '' : 's'} · metadata only`}>
      <div className="grid gap-1.5">
        {calls.length === 0 && <span className="field-hint text-muted">No Genius calls since controller start.</span>}
        {calls.map((call, index) => (
          <div key={`${call.t ?? index}-${index}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 border border-separator-strong px-2.5 py-2">
            <span className={call.ok ? 'font-bold text-vermilion' : 'font-bold text-[var(--danger)]'}>{call.ok ? '✓' : '✗'}</span>
            <span className="min-w-0 text-[12px]"><strong>{call.endpoint}</strong> <span className="text-muted">·</span> <span className="truncate">{call.title}{call.artist ? ` — ${call.artist}` : ''}</span></span>
            <span className="mono-num text-[11px] text-muted">{call.ms ?? '—'}ms</span>
            <span className="mono-num text-[10px] text-muted">{call.status ?? call.error ?? 'network'}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
