'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
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

type NotesReadout = {
  active: boolean;
  entities: Array<{ id: string; kind: string; title: string; artist: string | null; releaseTitle: string | null; local: boolean; providerId: string | null; resolutionState: string | null; coverage: string | null; discoveredAt: string | null; relationships: number }>;
  relationships: Array<{ id: string; type: string; fromTitle: string; fromArtist: string | null; toTitle: string; toArtist: string | null; createdAt: string }>;
  jobs: Array<{ id: string; kind: string; state: string; priority: number; attempts: number; depth: number; title: string; artist: string | null; updatedAt: string }>;
};

function displaySong(title: string, artist: string | null) {
  return artist ? `${title} — ${artist}` : title;
}

export default function NotesPanel() {
  const { adminFetch, hydrated } = useAdminAuth();
  const status = useAdminQuery<NotesStatus>({
    key: ['sleeve-notes', 'status'], adminFetch, enabled: hydrated,
    request: (fetcher, signal) => adminJson(fetcher, '/sleeve-notes/status', undefined, signal),
    staleTime: 10_000, refetchInterval: 30_000,
  });
  const active = status.data?.collectionRunning === true;
  const readout = useAdminQuery<NotesReadout>({
    key: ['sleeve-notes', 'readout'], adminFetch, enabled: hydrated && active,
    request: (fetcher, signal) => adminJson(fetcher, '/sleeve-notes/readout', undefined, signal),
    staleTime: 10_000, refetchInterval: 30_000,
  });
  const blocked = status.data?.collectionBlockedReason === 'provider-unconfigured'
    ? 'Genius needs its access token before collection can start.'
    : 'Turn on Extended Sleeve Notes to allow any background collection.';
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Eyebrow>Programming</Eyebrow>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Extended Sleeve Notes</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          An optional, source-backed extension to the default Sleeve Notes and Verified Facts.
          It is collected in the background and never delays playback.
        </p>
      </div>
      <Card title={active ? 'Collection active' : 'Not collecting'} sub={active ? 'background only' : 'safe by default'}>
        <p className="text-sm leading-6 text-muted">
          {active
            ? 'Genius work is low-priority and never delays playback. Extended material is collected locally only; it is not yet used in DJ links.'
            : `${blocked} While inactive, Sub/Wave makes no provider calls or background jobs, and the default Sleeve Notes and Verified Facts path remains unchanged.`}
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
      {active && (
        <Card title="Collection database" sub="temporary Phase 2 inspection · refreshes every 30 seconds">
          {readout.isLoading ? <p className="text-sm text-muted">Loading collected records…</p> : (
            <div className="space-y-6">
              <ReadoutTable title="Entities" empty="No records collected yet." headings={['Track', 'Kind', 'Local', 'Resolution', 'Coverage', 'Links']}>
                {readout.data?.entities.map((entity) => (
                  <tr key={entity.id} className="border-t border-border/60">
                    <td className="py-2 pr-4 font-medium">{displaySong(entity.title, entity.artist)}</td>
                    <td className="py-2 pr-4">{entity.kind}</td><td className="py-2 pr-4">{entity.local ? 'yes' : 'external'}</td>
                    <td className="py-2 pr-4">{entity.resolutionState ?? '—'}</td><td className="py-2 pr-4">{entity.coverage ?? '—'}</td><td className="py-2">{entity.relationships}</td>
                  </tr>
                ))}
              </ReadoutTable>
              <ReadoutTable title="Relationships" empty="No relationships collected yet." headings={['From', 'Relationship', 'To']}>
                {readout.data?.relationships.map((relationship) => (
                  <tr key={relationship.id} className="border-t border-border/60"><td className="py-2 pr-4 font-medium">{displaySong(relationship.fromTitle, relationship.fromArtist)}</td><td className="py-2 pr-4">{relationship.type}</td><td className="py-2">{displaySong(relationship.toTitle, relationship.toArtist)}</td></tr>
                ))}
              </ReadoutTable>
              <ReadoutTable title="Jobs" empty="No collection jobs yet." headings={['Track', 'Work', 'State', 'Depth', 'Attempts']}>
                {readout.data?.jobs.map((job) => (
                  <tr key={job.id} className="border-t border-border/60"><td className="py-2 pr-4 font-medium">{displaySong(job.title, job.artist)}</td><td className="py-2 pr-4">{job.kind}</td><td className="py-2 pr-4">{job.state}</td><td className="py-2 pr-4">{job.depth}</td><td className="py-2">{job.attempts}</td></tr>
                ))}
              </ReadoutTable>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function ReadoutTable({ title, empty, headings, children }: { title: string; empty: string; headings: string[]; children: ReactNode }) {
  const rows = Array.isArray(children) ? children : [];
  return <section><h2 className="mb-2 text-sm font-medium">{title}</h2><div className="max-h-80 overflow-auto rounded-md border border-border/70"><table className="w-full min-w-[620px] text-left text-xs"><thead className="sticky top-0 bg-card text-muted"><tr>{headings.map((heading) => <th key={heading} className="px-3 py-2 font-medium">{heading}</th>)}</tr></thead><tbody>{rows.length ? rows : <tr><td colSpan={headings.length} className="px-3 py-3 text-muted">{empty}</td></tr>}</tbody></table></div></section>;
}
