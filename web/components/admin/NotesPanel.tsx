'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { BookOpen, Radio, ShieldCheck } from 'lucide-react';
import { Card, Eyebrow } from './ui';
import { useAdminAuth } from '../../lib/adminAuth';
import { adminJson, useAdminQuery } from '../../lib/admin-query';

type NotesStatus = {
  enabled: boolean;
  providerEnabled: boolean;
  providerConfigured: boolean;
  collectionRunning: boolean;
  collectionBlockedReason: string | null;
  coverage?: Record<string, number>;
  replacement?: { localAttachments: number; encounters: number; pendingMatches: number; retainedClaims: number; researchJobs: number } | null;
};

type NotesReadout = {
  active: boolean;
  localAttachments: number;
  encounters: number;
  pendingMatches: number;
  retainedClaims: number;
  researchJobs: number;
  claims: Array<{ artist: string | null; recording: string | null; provider: string; category: string; topic: string; wording: string; evidence: string; sourceUrl: string }>;
  jobSummary: Array<{ provider: string; capability: string; state: string; jobs: number; attempts: number; nextDue: string | null; updatedAt: string }>;
  providerSummary: Array<{ provider: string; capability: string; outcome: string; status: number | null; requests: number; lastRequestedAt: string }>;
};

function clock(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value));
  } catch { return '—'; }
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border border-border/70 px-3 py-2"><div className="text-xl font-semibold tabular-nums">{value}</div><div className="text-xs text-muted">{label}</div></div>;
}

export default function NotesPanel() {
  const { adminFetch, hydrated } = useAdminAuth();
  const status = useAdminQuery<NotesStatus>({
    key: ['sleeve-notes', 'status'], adminFetch, enabled: hydrated,
    request: (fetcher, signal) => adminJson(fetcher, '/sleeve-notes/status', undefined, signal),
    staleTime: 10_000, refetchInterval: 30_000,
  });
  const enabled = status.data?.enabled === true;
  const readout = useAdminQuery<NotesReadout>({
    key: ['sleeve-notes', 'readout'], adminFetch, enabled: hydrated && enabled,
    request: (fetcher, signal) => adminJson(fetcher, '/sleeve-notes/readout', undefined, signal),
    staleTime: 10_000, refetchInterval: 30_000,
  });
  const data = readout.data;
  const [requeueing, setRequeueing] = useState(false);
  const [requeueMessage, setRequeueMessage] = useState('');

  async function requeueCachedWikipediaResearch() {
    setRequeueing(true);
    setRequeueMessage('');
    try {
      const result = await adminJson<{ artistsWithCachedSources: number; jobsQueued: number }>(
        adminFetch, '/sleeve-notes/requeue-wikipedia-research', { method: 'POST' },
      );
      setRequeueMessage(`Queued ${result.jobsQueued} research jobs from cached Wikipedia sources for ${result.artistsWithCachedSources} artists. Existing claims and source data were preserved.`);
      await Promise.all([readout.refetch(), status.refetch()]);
    } catch (error) {
      setRequeueMessage(error instanceof Error ? error.message : 'Could not requeue cached Wikipedia research.');
    } finally {
      setRequeueing(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <Eyebrow>Programming</Eyebrow>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Extended Sleeve Notes</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Source-backed music research collected in the background and offered as optional context for DJ links.
        </p>
      </div>

      <Card title={enabled ? 'Collection enabled' : 'Not collecting'} sub={enabled ? 'background only' : 'safe by default'}>
        <p className="text-sm leading-6 text-muted">
          {enabled
            ? 'MusicBrainz matching, Wikipedia retrieval, Genius metadata collection, and cautious claim extraction run only when their settings and station gates allow them.'
            : 'Turn on Extended Sleeve Notes before the station creates provider work or opens its collection database.'}
        </p>
        <Link href="/admin/settings" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
          Review the master switch <ShieldCheck className="size-4" />
        </Link>
        {enabled && <div className="mt-4">
          <button type="button" disabled={requeueing} onClick={() => void requeueCachedWikipediaResearch()}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/40 disabled:opacity-60">
            {requeueing ? 'Queueing cached research…' : 'Requeue from cached sources'}
          </button>
          <p className="mt-2 text-xs text-muted">Re-runs extraction using stored Wikipedia text. It preserves existing claims and source documents and makes no Wikimedia requests.</p>
          {requeueMessage && <p role="status" className="mt-2 text-xs text-muted">{requeueMessage}</p>}
        </div>}
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="On air" sub="optional story spark"><Radio className="mb-3 size-5 text-muted" /><p className="text-sm leading-6 text-muted">Regular Sleeve Notes remain available. One eligible Extended Sleeve Note may be offered separately and can be omitted by the DJ.</p></Card>
        <Card title="Collected" sub="development inspection"><BookOpen className="mb-3 size-5 text-muted" /><p className="text-sm leading-6 text-muted">Claims stay reviewable with their exact retained evidence.</p></Card>
        <Card title="Sources" sub="identity-first"><ShieldCheck className="mb-3 size-5 text-muted" /><p className="text-sm leading-6 text-muted">MusicBrainz resolves identity before Wikipedia and Genius research. Genius coverage: {status.data?.coverage?.processed ?? 0} processed, {status.data?.coverage?.queued ?? 0} queued, {status.data?.coverage?.['retry-at'] ?? 0} retrying, {status.data?.coverage?.failed ?? 0} failed.</p></Card>
      </div>

      {enabled && <Card title="Development readout" sub="temporary · read-only · refreshes every 30 seconds">
        {readout.isLoading ? <p className="text-sm text-muted">Loading Sleeve Notes activity…</p> : !data ? <p className="text-sm text-muted">Could not load the collection readout.</p> : (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="tracks encountered" value={data.localAttachments} />
              <Metric label="encounters" value={data.encounters} />
              <Metric label="retained claims" value={data.retainedClaims} />
              <Metric label="research jobs" value={data.researchJobs} />
              <Metric label="MusicBrainz pending" value={data.pendingMatches} />
            </div>
            <ReadoutTable title="Job state" empty="No provider jobs yet." headings={['Provider', 'Work', 'State', 'Jobs', 'Attempts', 'Next due']}>
              {data.jobSummary.map((job) => <tr key={`${job.provider}-${job.capability}-${job.state}`} className="border-t border-border/60">
                <td className="py-2 pr-4 font-medium">{job.provider}</td><td className="py-2 pr-4">{job.capability}</td><td className="py-2 pr-4">{job.state}</td><td className="py-2 pr-4 tabular-nums">{job.jobs}</td><td className="py-2 pr-4 tabular-nums">{job.attempts}</td><td className="py-2">{clock(job.nextDue)}</td>
              </tr>)}
            </ReadoutTable>
            <ReadoutTable title="Recent provider outcomes" empty="No completed provider calls yet." headings={['Provider', 'Work', 'Outcome', 'Status', 'Requests', 'Latest']}>
              {data.providerSummary.map((request) => <tr key={`${request.provider}-${request.capability}-${request.outcome}-${request.status ?? 'none'}`} className="border-t border-border/60">
                <td className="py-2 pr-4 font-medium">{request.provider}</td><td className="py-2 pr-4">{request.capability}</td><td className="py-2 pr-4">{request.outcome}</td><td className="py-2 pr-4">{request.status ?? '—'}</td><td className="py-2 pr-4 tabular-nums">{request.requests}</td><td className="py-2">{clock(request.lastRequestedAt)}</td>
              </tr>)}
            </ReadoutTable>
            <ReadoutTable title="Latest retained claims" empty="No claims retained yet." headings={['Artist', 'Category', 'Claim', 'Evidence']}>
              {data.claims.slice(0, 16).map((claim, index) => <tr key={`${claim.artist}-${claim.topic}-${index}`} className="border-t border-border/60 align-top">
                <td className="py-2 pr-4 font-medium">{claim.recording ? `${claim.recording}${claim.artist ? ` · ${claim.artist}` : ''}` : claim.artist ?? 'Unknown entity'}<span className="block text-[10px] text-muted">{claim.provider}</span></td><td className="py-2 pr-4">{claim.category}<span className="block text-[10px] text-muted">{claim.topic}</span></td><td className="py-2 pr-4">{claim.wording}</td><td className="py-2"><a href={claim.sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{claim.evidence}</a></td>
              </tr>)}
            </ReadoutTable>
          </div>
        )}
      </Card>}
    </div>
  );
}

function ReadoutTable({ title, empty, headings, children }: { title: string; empty: string; headings: string[]; children: ReactNode }) {
  const rows = Array.isArray(children) ? children : [];
  return <section><h2 className="mb-2 text-sm font-medium">{title}</h2><div className="max-h-80 overflow-auto rounded-md border border-border/70"><table className="w-full min-w-[680px] text-left text-xs"><thead className="sticky top-0 bg-card text-muted"><tr>{headings.map((heading) => <th key={heading} className="px-3 py-2 font-medium">{heading}</th>)}</tr></thead><tbody>{rows.length ? rows : <tr><td colSpan={headings.length} className="px-3 py-3 text-muted">{empty}</td></tr>}</tbody></table></div></section>;
}
