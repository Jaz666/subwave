'use client';

import Link from 'next/link';
import { BookOpen, Radio, ShieldCheck } from 'lucide-react';
import { Card, Eyebrow } from './ui';
import { useAdminAuth } from '../../lib/adminAuth';
import { adminJson, useAdminQuery } from '../../lib/admin-query';

type NotesStatus = {
  enabled: boolean;
  providerEnabled: boolean;
  providerConfigured: boolean;
  collectionRunning: boolean;
  collectionBlockedReason: 'disabled' | 'provider-unconfigured' | null;
  coverage: Record<string, number>;
};

export default function NotesPanel() {
  const { adminFetch, hydrated } = useAdminAuth();
  const status = useAdminQuery<NotesStatus>({
    key: ['sleeve-notes', 'status'], adminFetch, enabled: hydrated,
    request: (fetcher, signal) => adminJson(fetcher, '/sleeve-notes/status', undefined, signal),
    staleTime: 10_000, refetchInterval: 30_000,
  });
  const active = status.data?.collectionRunning === true;
  const blocked = status.data?.collectionBlockedReason === 'provider-unconfigured'
    ? 'Genius needs its access token before collection can start.'
    : 'Turn on Sleeve Notes to allow any background collection.';
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Eyebrow>Programming</Eyebrow>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Sleeve Notes</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          A local, source-backed music knowledge store. It is optional, sparse on air,
          and never delays playback.
        </p>
      </div>
      <Card title={active ? 'Collection active' : 'Not collecting'} sub={active ? 'background only' : 'safe by default'}>
        <p className="text-sm leading-6 text-muted">
          {active
            ? 'Genius work is low-priority and never delays playback. Source material is collected locally only; it is not yet used in DJ links.'
            : `${blocked} While inactive, Sub/Wave makes no provider calls or background jobs, and the Verified Facts path remains unchanged.`}
        </p>
        <Link href="/admin/settings" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
          Review the master switch <ShieldCheck className="size-4" />
        </Link>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="On air" sub="coming in Phase 4">
          <Radio className="mb-3 size-5 text-muted" />
          <p className="text-sm leading-6 text-muted">A permanent ledger of supplied notes and the final spoken link.</p>
        </Card>
        <Card title="Collected" sub="coming in Phase 4">
          <BookOpen className="mb-3 size-5 text-muted" />
          <p className="text-sm leading-6 text-muted">Source-backed claims, relationships, freshness, and correction state.</p>
        </Card>
        <Card title="Sources" sub={active ? 'Genius' : 'configured safely'}>
          <ShieldCheck className="mb-3 size-5 text-muted" />
          <p className="text-sm leading-6 text-muted">
            {status.isLoading ? 'Checking provider status…' : active
              ? `Genius is collecting. Ready: ${status.data?.coverage.ready ?? 0}; queued: ${status.data?.coverage.queued ?? 0}; retrying: ${status.data?.coverage['retry-at'] ?? 0}.`
              : status.data?.providerEnabled
                ? 'Genius is enabled but not ready to collect.'
                : 'Genius is disabled independently of the station-wide switch.'}
          </p>
        </Card>
      </div>
    </div>
  );
}
