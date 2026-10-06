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
  collectionBlockedReason: 'disabled' | 'provider-disabled' | 'provider-unconfigured' | null;
  coverage: Record<string, number>;
};

type NotesReadout = {
  active: boolean;
  localAttachments: number;
  encounters: number;
  pendingMatches: number;
  artists: Array<{ name: string; musicbrainzId: string | null; sources: number; claims: number }>;
  claims: Array<{ artist: string | null; recording: string | null; category: string; topic: string; wording: string; evidence: string; sourceUrl: string; provider: string }>;
  jobs: Array<{ provider: string; subjectType: string; capability: string; state: string; priority: number }>;
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
    : status.data?.collectionBlockedReason === 'provider-disabled'
      ? 'Enable Genius in the Sleeve Notes provider settings before collection can start.'
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
            ? 'Genius collects recording credits and musical connections only. Lyrics are never fetched or retained. Research yields to playback-critical work and is not yet used in DJ links.'
            : `${blocked} Genius makes no requests unless its collection gates are open. The default Sleeve Notes and Verified Facts path remains unchanged.`}
        </p>
        <Link href="/admin/settings" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
          Review collection settings <ShieldCheck className="size-4" />
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
              ? `Genius is collecting metadata only. Processed: ${status.data?.coverage.processed ?? 0}; queued: ${status.data?.coverage.queued ?? 0}; retrying: ${status.data?.coverage['retry-at'] ?? 0}; failed: ${status.data?.coverage.failed ?? 0}.`
              : status.data?.providerEnabled
                ? 'Genius is enabled but not ready to collect.'
                : 'Genius is disabled independently of the station-wide switch.'}
          </p>
        </Card>
      </div>
      {active && (
        <Card title="Collection database" sub="local research readout · refreshes every 30 seconds">
          {readout.isLoading ? <p className="text-sm text-muted">Loading collected records…</p> : (
            <div className="space-y-6">
              <p className="text-xs text-muted">{readout.data?.localAttachments ?? 0} local attachments · {readout.data?.encounters ?? 0} encounters · {readout.data?.pendingMatches ?? 0} pending matches</p>
              <ReadoutTable title="Artists" empty="No artists collected yet." headings={['Artist', 'Sources', 'Claims']}>
                {readout.data?.artists.map((artist) => (
                  <tr key={artist.musicbrainzId ?? artist.name} className="border-t border-border/60">
                    <td className="py-2 pr-4 font-medium">{artist.name}</td>
                    <td className="py-2 pr-4">{artist.sources}</td><td className="py-2">{artist.claims}</td>
                  </tr>
                ))}
              </ReadoutTable>
              <ReadoutTable title="Claims" empty="No source-backed claims collected yet." headings={['Artist / recording', 'Category / topic', 'Claim', 'Source']}>
                {readout.data?.claims.map((claim, index) => (
                  <tr key={`${claim.provider}-${claim.sourceUrl}-${claim.topic}-${index}`} className="border-t border-border/60">
                    <td className="py-2 pr-4 font-medium">{displaySong(claim.recording ?? claim.artist ?? 'Unknown recording', claim.recording ? claim.artist : null)}<span className="block text-[10px] text-muted">{claim.provider}</span></td>
                    <td className="py-2 pr-4">{claim.category}<span className="block text-[10px] text-muted">{claim.topic}</span></td>
                    <td className="py-2 pr-4">{claim.wording}</td>
                    <td className="py-2"><a className="text-primary hover:underline" href={claim.sourceUrl} target="_blank" rel="noreferrer">source</a></td>
                  </tr>
                ))}
              </ReadoutTable>
              <ReadoutTable title="Jobs" empty="No collection jobs yet." headings={['Provider', 'Subject', 'Capability', 'State']}>
                {readout.data?.jobs.map((job) => (
                  <tr key={`${job.provider}-${job.subjectType}-${job.capability}-${job.state}-${job.priority}`} className="border-t border-border/60"><td className="py-2 pr-4 font-medium">{job.provider}</td><td className="py-2 pr-4">{job.subjectType}</td><td className="py-2 pr-4">{job.capability}</td><td className="py-2">{job.state}</td></tr>
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
