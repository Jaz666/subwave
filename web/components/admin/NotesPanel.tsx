'use client';

import Link from 'next/link';
import type { FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Activity, ArrowRight, BookOpen, Compass, ExternalLink, GitBranch, Search, Settings2, ShieldCheck, Trash2 } from 'lucide-react';
import { Card, Eyebrow, Pill, Seg } from './ui';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { SectionTabs } from './SectionTabs';
import { useAdminAuth } from '../../lib/adminAuth';
import { adminJson, useAdminQuery } from '../../lib/admin-query';
import { useSettingsMutation, useSettingsQuery } from './settings/queries';
import type { SettingsData } from './settings/shared';
import ConnectionsVisualizer from './connections/ConnectionsVisualizer';
import SleeveNotesModeration from './SleeveNotesModeration';

type NotesTab = 'overview' | 'research' | 'moderation' | 'explore' | 'connections' | 'sources' | 'config';

type NotesStatus = {
  enabled: boolean;
  providerEnabled: boolean;
  providerConfigured: boolean;
  providerTokenSource?: 'settings' | 'environment' | 'missing';
  collectionRunning: boolean;
  collectionBlockedReason: string | null;
  wikipediaPrompt?: string;
  wikipediaDefaultPrompt?: string;
  wikipediaPromptIsCustom?: boolean;
  coverage?: Record<string, number>;
};

type NotesReadout = {
  active: boolean;
  localAttachments: number;
  encounters: number;
  pendingMatches: number;
  retainedClaims: number;
  wikipediaChunkCharacterTarget?: number;
  wikipediaExtractAverageLatencyMs?: number | null;
  wikipediaExtractCallCount?: number;
  airtimeClaims: number;
  creditClaims: number;
  recycleBinPending: number;
  researchJobs: number;
  artists: Array<{ name: string; musicbrainzId: string | null; sources: number; claims: number }>;
  claims: Array<{
    id: string;
    artist: string | null;
    recording: string | null;
    provider: string;
    category: string;
    topic: string;
    wording: string;
    shortWording: string;
    evidence: string;
    sourceUrl: string;
    attribution?: string;
  }>;
  recentSparks: Array<{
    id: string;
    trackTitle: string | null;
    trackArtist: string | null;
    offeredWording: string;
    category: string;
    topic: string;
    detectionStatus: 'detected' | 'not-detected';
    binExempt: boolean;
    contextPassReason: string | null;
    qualityRejectionReason: string | null;
    suppliedAt: string;
    generatedText: string;
    ttsText: string | null;
    ttsRequestedAt: string | null;
    airedAt: string | null;
    releasedAt: string | null;
  }>;
  musicBrainzSeries: Array<{
    id: string;
    name: string;
    entityType: 'recording' | 'release-group';
    ranked: number;
    editionYear: number | null;
    fetchedAt: string | null;
    nextRefreshAt: string;
    attempts: number;
    lastError: string | null;
    members: number;
    localClaims: number;
    libraryAlbums: number;
    libraryTracks: number;
  }>;
  jobSummary: Array<{ provider: string; capability: string; state: string; jobs: number; attempts: number; nextDue: string | null; updatedAt: string }>;
  workQueue?: Array<{ provider: string; capability: string; phase: 'ready' | 'first-play' | 'next-play' | 'time-delay' | 'running' | 'unavailable'; jobs: number }>;
  workQueueItems?: Array<{
    id: string; provider: string; capability: string;
    phase: 'ready' | 'first-play' | 'next-play' | 'time-delay' | 'running' | 'unavailable';
    subjectType: string; subjectTitle: string; subjectArtist: string | null;
    priority: number; attempts: number; runAfter: string | null;
    wikiNextChunk: number; researchNextSection: number;
  }>;
  providerSummary: Array<{ provider: string; capability: string; outcome: string; status: number | null; requests: number; lastRequestedAt: string }>;
};

type ExploreEntity = {
  entityType: 'artist' | 'recording' | 'release' | 'release-group';
  entityId: string;
  title: string;
  artist: string | null;
  localMatch: boolean;
  sources: number;
  claimCount: number;
  childCount: number;
  updatedAt: string;
};

type ExplorePage = { active: boolean; entities: ExploreEntity[]; total: number; limit: number; offset: number };
type EntityDossier = ExploreEntity & { claims: Array<NotesReadout['claims'][number] & { attribution: string }> };

const TABS = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'research', label: 'Research', icon: Activity },
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'connections', label: 'Connections', icon: GitBranch },
  { id: 'sources', label: 'Sources', icon: ShieldCheck },
  { id: 'config', label: 'Config', icon: Settings2 },
  { id: 'moderation', label: 'Recycle Bin', icon: Trash2 },
];
const EXPLORE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function dateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function providerName(provider: string) {
  if (provider === 'musicbrainz-series' || provider === 'musicbrainz') return 'MusicBrainz';
  return provider ? `${provider.charAt(0).toUpperCase()}${provider.slice(1)}` : provider;
}

function ClaimEvidence({ provider, evidence }: { provider: string; evidence: string }) {
  if (provider !== 'musicbrainz-series' && provider !== 'genius') return <p className="text-xs leading-5 text-muted">{evidence}</p>;
  let label = provider === 'musicbrainz-series' ? 'MusicBrainz Series membership' : 'Genius metadata';
  try {
    const value = JSON.parse(evidence) as {
      seriesName?: string; rank?: string | number | null; editionYear?: number | null;
      role?: string; names?: string[]; type?: string; target?: { title?: string; artist?: string | null };
    };
    if (provider === 'musicbrainz-series') {
      const details = [
        value.seriesName,
        value.rank ? `Rank ${value.rank}` : null,
        value.editionYear ? `${value.editionYear} edition` : null,
      ].filter(Boolean);
      label = details.join(' · ') || label;
    } else {
      const names = value.names?.join(', ');
      const target = value.target?.title
        ? `${value.target.title}${value.target.artist ? ` · ${value.target.artist}` : ''}`
        : null;
      label = value.role && names ? `${value.role}: ${names}` : value.type && target ? `${value.type.replaceAll('_', ' ')} · ${target}` : label;
    }
  } catch { /* keep the provider fallback */ }
  return <p className="text-xs leading-5 text-muted">{label}</p>;
}

function Metric({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className="rounded-md border border-border/70 px-3 py-3">
      <div className="text-xl font-semibold tabular-nums">{value.toLocaleString('en-GB')}</div>
      <div className="text-xs text-ink">{label}</div>
      {detail && <div className="mt-1 text-[11px] text-muted">{detail}</div>}
    </div>
  );
}

function CompactMetric({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return <div className="min-w-0 rounded-md border border-border/70 px-3 py-2">
    <div className="flex items-baseline gap-2">
      <span className="text-lg font-semibold tabular-nums">{typeof value === 'number' ? value.toLocaleString('en-GB') : value}</span>
      <span className="text-xs text-ink">{label}</span>
    </div>
    {detail && <p className="text-[11px] leading-4 text-muted">{detail}</p>}
  </div>;
}

function ReadoutTable({
  title, empty, headings, rows, sub,
}: { title: string; empty: string; headings: string[]; rows: ReactNode[]; sub?: string }) {
  return (
    <Card title={title} sub={sub}>
      <div className="max-h-[30rem] overflow-auto rounded-md border border-border/70">
        <table className="w-full min-w-[650px] text-left text-xs">
          <thead className="sticky top-0 bg-card text-muted">
            <tr>{headings.map((heading) => <th key={heading} className="px-3 py-2 font-medium">{heading}</th>)}</tr>
          </thead>
          <tbody>{rows.length ? rows : <tr><td colSpan={headings.length} className="px-3 py-4 text-muted">{empty}</td></tr>}</tbody>
        </table>
      </div>
    </Card>
  );
}

function ClaimCard({ claim }: { claim: NotesReadout['claims'][number] }) {
  const identity = claim.recording || claim.artist || 'Unmatched entity';
  const subtitle = claim.recording && claim.artist ? claim.artist : providerName(claim.provider);
  return (
    <article className="rounded-md border border-border/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="ink">{claim.category.replaceAll('-', ' ')}</Pill>
        <span className="text-xs text-muted">{claim.topic}</span>
      </div>
      <h3 className="mt-2 text-[13px] font-semibold">{identity}</h3>
      <p className="text-xs text-muted">{subtitle}</p>
      <div className="mt-3 space-y-2 text-[13px] leading-[1.55]">
        <p><span className="font-medium text-muted">Full:</span> {claim.wording}</p>
        {claim.shortWording.trim() && <p><span className="font-medium text-muted">Short anchors:</span> {claim.shortWording}</p>}
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-border/60 pt-2">
        <div className="min-w-0">
          <ClaimEvidence provider={claim.provider} evidence={claim.evidence} />
          {claim.attribution && <p className="mt-1 text-[11px] leading-4 text-muted">{claim.attribution}</p>}
        </div>
        <a href={claim.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex flex-none items-center gap-1 text-xs font-medium text-primary hover:underline">
          Source <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

function seriesState(series: NotesReadout['musicBrainzSeries'][number]) {
  if (series.lastError) return { label: 'Needs attention', tone: 'accent' as const };
  if (!series.fetchedAt) return { label: 'Waiting', tone: 'default' as const };
  if (series.members === 0) return { label: 'No members', tone: 'default' as const };
  return { label: 'Cached', tone: 'solid' as const };
}

export default function NotesPanel() {
  const { adminFetch, hydrated } = useAdminAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: NotesTab = rawTab && TABS.some((item) => item.id === rawTab)
    ? rawTab as NotesTab
    : 'overview';

  const status = useAdminQuery<NotesStatus>({
    key: ['sleeve-notes', 'status'], adminFetch, enabled: hydrated,
    request: (fetcher, signal) => adminJson(fetcher, '/sleeve-notes/status', undefined, signal),
    staleTime: 10_000, refetchInterval: 30_000,
  });
  const enabled = status.data?.enabled === true;
  const needsReadout = tab === 'overview' || tab === 'research' || tab === 'sources';
  const readout = useAdminQuery<NotesReadout>({
    key: ['sleeve-notes', 'readout'], adminFetch, enabled: hydrated && enabled && needsReadout,
    request: (fetcher, signal) => adminJson(fetcher, '/sleeve-notes/readout', undefined, signal),
    staleTime: 10_000, refetchInterval: 30_000,
  });
  const settingsQuery = useSettingsQuery<SettingsData>({
    adminFetch, enabled: hydrated && tab === 'config',
  });
  const settingsSave = useSettingsMutation<SettingsData>({ adminFetch });
  const data = readout.data;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [tokenDraft, setTokenDraft] = useState('');
  const [wikiPromptDraft, setWikiPromptDraft] = useState('');
  const [configMessage, setConfigMessage] = useState('');
  const [wikiRefreshBusy, setWikiRefreshBusy] = useState(false);
  const [wikiRefreshMessage, setWikiRefreshMessage] = useState('');
  const categories = useMemo(
    () => [...new Set((data?.claims ?? []).map((claim) => claim.category))].sort(),
    [data?.claims],
  );
  const visibleClaims = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.claims ?? []).filter((claim) => {
      if (category !== 'all' && claim.category !== category) return false;
      if (!query) return true;
      return [claim.artist, claim.recording, claim.category, claim.topic, claim.wording, claim.shortWording]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [category, data?.claims, search]);

  function selectTab(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`${pathname ?? '/admin/notes'}?${params.toString()}`, { scroll: false });
  }

  async function refreshWikipedia(mode: 'clear' | 'replace') {
    setWikiRefreshBusy(true);
    setWikiRefreshMessage('');
    try {
      const preview = await adminJson<{ artists: number; albums: number; claims: number }>(
        adminFetch, '/sleeve-notes/wikipedia-refresh-preview',
      );
      const description = mode === 'clear'
        ? `Disable ${preview.claims} automatic Wikipedia claims for ${preview.artists} artists and ${preview.albums} albums now, then research them again on their next encounter?`
        : `Research ${preview.artists} artists and ${preview.albums} albums again on their next encounter, keeping existing claims until each full scan succeeds?`;
      if (!window.confirm(description)) return;
      const result = await adminJson<{ artists: number; albums: number; claimsCleared: number }>(
        adminFetch, '/sleeve-notes/wikipedia-refresh', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }),
        },
      );
      setWikiRefreshMessage(mode === 'clear'
        ? `Marked ${result.artists} artists and ${result.albums} albums for research on next encounter; disabled ${result.claimsCleared} automatic claims.`
        : `Marked ${result.artists} artists and ${result.albums} albums for research on next encounter. Existing claims will be replaced only after a full scan succeeds.`);
      await Promise.all([readout.refetch(), status.refetch()]);
    } catch (error) {
      setWikiRefreshMessage(error instanceof Error ? error.message : 'Could not mark Wikipedia research for refresh.');
    } finally {
      setWikiRefreshBusy(false);
    }
  }

  async function saveConfig(patch: Record<string, unknown>, success: string) {
    setConfigMessage('');
    try {
      const receipt = await settingsSave.mutateAsync(patch);
      await Promise.all([status.refetch(), settingsQuery.refetch()]);
      setConfigMessage(receipt.refreshError
        ? `Saved, but settings could not be refreshed: ${receipt.refreshError}`
        : success);
      const accessToken = (patch.sleeveNotes as { providers?: { genius?: { accessToken?: unknown } } } | undefined)
        ?.providers?.genius?.accessToken;
      if (typeof accessToken === 'string') setTokenDraft('');
    } catch (error) {
      setConfigMessage(error instanceof Error ? error.message : 'Could not save Sleeve Notes settings.');
    }
  }

  return (
    <div className={`mx-auto w-full space-y-5 ${tab === 'connections' ? 'max-w-none' : 'max-w-6xl'}`}>
      <section className="card">
        <div className="border-b border-ink p-4">
          <Eyebrow className="text-vermilion">Programming</Eyebrow>
          <div className="mt-1.5 text-[22px] font-extrabold tracking-[-0.02em]">Extended Sleeve Notes</div>
          <p className="mt-1 max-w-3xl text-[11px] leading-[1.6] text-muted">
            Source-backed stories gathered from the music your station plays. Config controls how strongly the DJ is guided to use an offered spark; background research yields to playback work.
          </p>
        </div>
        <SectionTabs tabs={TABS} value={tab} onChange={selectTab} label="Extended Sleeve Notes sections" />
      </section>

      {tab === 'overview' && (
        <OverviewView
          enabled={enabled}
          status={status.data}
          statusLoading={status.isLoading || !hydrated}
          statusError={!!status.error}
          readout={data}
          onRetryStatus={() => void status.refetch()}
        />
      )}

      {tab === 'config' && (
        <ConfigView
          status={status.data}
          values={settingsQuery.data?.values}
          loading={settingsQuery.isLoading || !hydrated}
          settingsError={settingsQuery.error instanceof Error ? settingsQuery.error.message : null}
          busy={settingsSave.isPending}
          tokenDraft={tokenDraft}
          onTokenDraft={setTokenDraft}
          wikiPromptDraft={wikiPromptDraft}
          onWikiPromptDraft={setWikiPromptDraft}
          message={configMessage}
          onSave={(patch, success) => void saveConfig(patch, success)}
          wikiRefreshBusy={wikiRefreshBusy}
          wikiRefreshMessage={wikiRefreshMessage}
          onWikiRefresh={(mode) => void refreshWikipedia(mode)}
          adminFetch={adminFetch}
          hydrated={hydrated}
        />
      )}

      {tab !== 'overview' && tab !== 'config' && !hydrated && (
        <Card title="Loading collection status"><p className="text-[13px] text-muted">Connecting to the station…</p></Card>
      )}
      {tab !== 'overview' && tab !== 'config' && hydrated && status.isLoading && (
        <Card title="Checking collection status"><p className="text-[13px] text-muted">Reading the station-wide setting…</p></Card>
      )}
      {tab !== 'overview' && tab !== 'config' && hydrated && status.error && (
        <Card title="Collection status unavailable">
          <p className="text-[13px] leading-[1.55] text-muted">The station’s Extended Sleeve Notes setting could not be read. Retry before assuming collection is on or off.</p>
          <button type="button" onClick={() => void status.refetch()} className="mt-3 text-[13px] font-medium text-primary hover:underline">Try again</button>
        </Card>
      )}

      {tab !== 'overview' && tab !== 'config' && hydrated && !status.error && !status.isLoading && !enabled && (
        <Card title="Extended Sleeve Notes is off" sub="No collection work is running">
          <p className="text-[13px] leading-[1.55] text-muted">The station keeps existing cached material, but does not make Extended provider calls or offer Extended story sparks while the master switch is off.</p>
          <Link href="/admin/settings?section=behaviour&card=extended-sleeve-notes" className="mt-3 inline-flex items-center gap-2 text-[13px] font-medium text-primary hover:underline">
            Open DJ Behaviour <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Card>
      )}

      {hydrated && enabled && needsReadout && readout.error && (
        <Card title="Could not load collection data">
          <p className="text-[13px] text-muted">{readout.error instanceof Error ? readout.error.message : 'The Notes readout is temporarily unavailable.'}</p>
          <button type="button" onClick={() => void readout.refetch()} className="mt-3 text-[13px] font-medium text-primary hover:underline">Try again</button>
        </Card>
      )}
      {hydrated && enabled && needsReadout && readout.isLoading && <p className="text-[13px] text-muted">Loading collection data…</p>}

      {hydrated && enabled && data && tab === 'research' && (
        <ResearchView
          data={data}
          search={search}
          onSearch={setSearch}
          category={category}
          onCategory={setCategory}
          categories={categories}
          claims={visibleClaims}
        />
      )}
      {hydrated && tab === 'moderation' && <SleeveNotesModeration adminFetch={adminFetch} hydrated={hydrated} />}
      {hydrated && enabled && tab === 'explore' && <ExploreView adminFetch={adminFetch} hydrated={hydrated} />}
      {hydrated && enabled && tab === 'connections' && <ConnectionsVisualizer adminFetch={adminFetch} hydrated={hydrated} />}
      {hydrated && enabled && data && tab === 'sources' && (
        <SourcesView
          data={data}
          status={status.data}
        />
      )}
    </div>
  );
}

function OverviewView({
  enabled, status, statusLoading, statusError, readout, onRetryStatus,
}: {
  enabled: boolean;
  status: NotesStatus | undefined;
  statusLoading: boolean;
  statusError: boolean;
  readout: NotesReadout | undefined;
  onRetryStatus: () => void;
}) {
  if (statusLoading || !status) {
    return <Card title="Checking Extended Sleeve Notes"><p className="text-[13px] text-muted">Reading the station-wide setting…</p></Card>;
  }
  if (statusError) {
    return (
      <Card title="Collection status unavailable">
        <p className="text-[13px] leading-[1.55] text-muted">The station’s Extended Sleeve Notes setting could not be read. Retry before assuming collection is on or off.</p>
        <button type="button" onClick={onRetryStatus} className="mt-3 text-[13px] font-medium text-primary hover:underline">Try again</button>
      </Card>
    );
  }
  if (enabled) return readout ? <ActiveOverview data={readout} /> : null;

  return (
    <div className="space-y-5">
      <Card title="Extended Sleeve Notes is off" sub="Vanilla Sleeve Notes remain unchanged">
        <p className="max-w-4xl text-[13px] leading-[1.55] text-muted">
          Extended Sleeve Notes adds a small, source-backed story spark to the station’s existing Sleeve Notes. It researches the artists, releases and tracks the station encounters, then may offer one detail for an eligible link. Config controls how strongly the DJ is guided to use an offered spark.
        </p>
      </Card>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Card title="Vanilla Sleeve Notes" sub="the usual factual link">
          <p className="text-[13px] leading-[1.55] text-muted">The station’s normal Sleeve Notes continue to guide track links. Turning Extended Sleeve Notes off does not remove or change that behavior.</p>
        </Card>
        <Card title="Extended Sleeve Notes" sub="one source-backed story spark">
          <p className="text-[13px] leading-[1.55] text-muted">When enabled and a cached claim fits, one source-backed fact may be supplied to the link writer: for example, a verified list appearance, album story, producer or writer credit. Config controls whether the DJ must use it, is encouraged to use it, or may leave it out.</p>
        </Card>
        <Card title="Resource use" sub="background research and a little prompt context">
          <p className="text-[13px] leading-[1.55] text-muted">Research runs outside playback and yields to station work. Enabled providers may use their API limits and background processing. An eligible cached spark adds context to the DJ’s prompt; the DJ makes no new provider request while speaking. With this switch off, Extended collection and prompt-time use are paused. Exact token or dollar estimates are not shown until measured.</p>
        </Card>
      </div>
      <Card title="Enable Extended Sleeve Notes" sub="station-wide master switch">
        <p className="text-[13px] leading-[1.55] text-muted">The master switch lives in DJ Behaviour. That setting opens automatically so you can review it in place.</p>
        <Link href="/admin/settings?section=behaviour&card=extended-sleeve-notes" className="mt-3 inline-flex items-center gap-2 text-[13px] font-medium text-primary hover:underline">
          Open DJ Behaviour <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </Card>
    </div>
  );
}

function ActiveOverview({ data }: { data: NotesReadout }) {
  const recent = data.claims.slice(0, 4);
  const recentSparks = data.recentSparks ?? [];
  const workQueue = data.workQueue ?? [];
  const workQueueItems = (data.workQueueItems ?? []).filter((job) => job.phase !== 'unavailable');
  const countPhase = (phase: NonNullable<NotesReadout['workQueue']>[number]['phase']) => workQueue
    .filter((job) => job.phase === phase).reduce((sum, job) => sum + job.jobs, 0);
  const readyJobs = countPhase('ready');
  const waitingJobs = countPhase('first-play') + countPhase('next-play') + countPhase('time-delay');
  const runningJobs = countPhase('running');
  const activeJobs = readyJobs + waitingJobs + runningJobs;
  const queueTaskName = (job: NonNullable<NotesReadout['workQueueItems']>[number]) => {
    const names: Record<string, string> = {
      match: 'MusicBrainz track match', 'release-context': 'MusicBrainz album details',
      connections: 'Genius track connections', 'album-biography': 'Genius album bio',
      biography: 'Wikipedia artist article', 'release-group-biography': 'Wikipedia album article',
      'extract-wikipedia': 'Extract Wikipedia artist section',
      'extract-wikipedia-release-group': 'Extract Wikipedia album section',
      'extract-genius-album': 'Extract Genius album bio',
    };
    return names[job.capability] ?? job.capability.replaceAll('-', ' ');
  };
  const queuePhaseText = (job: NonNullable<NotesReadout['workQueueItems']>[number]) => {
    if (job.phase === 'first-play') return 'Needs first play';
    if (job.phase === 'next-play') return 'Waiting for next play';
    if (job.phase === 'time-delay') return job.runAfter ? `Retry after ${dateTime(job.runAfter)}` : 'Retry scheduled';
    if (job.phase === 'running') return 'Running';
    return 'Ready';
  };
  const queueGroups = (() => {
    type QueueItem = NonNullable<NotesReadout['workQueueItems']>[number];
    const groups = new Map<string, { title: string; order: number; jobs: QueueItem[] }>();
    for (const job of workQueueItems) {
      const articleTask = (job.provider === 'wikipedia' && ['biography', 'release-group-biography'].includes(job.capability))
        || (job.provider === 'genius' && job.capability === 'album-biography')
        || (job.provider === 'researcher' && ['extract-wikipedia', 'extract-wikipedia-release-group', 'extract-genius-album'].includes(job.capability));
      const album = job.subjectType === 'release';
      const trackLookup = job.capability === 'match' || job.capability === 'connections';
      const section = job.capability === 'extract-wikipedia' || job.capability === 'extract-wikipedia-release-group'
        ? job.wikiNextChunk + 1
        : job.capability === 'extract-genius-album' ? job.researchNextSection + 1 : 1;
      const title = articleTask ? `${album ? 'Album' : 'Artist'} Section ${section}`
        : trackLookup ? 'Track lookups' : 'Other source lookups';
      const order = articleTask ? (section - 1) * 2 + (album ? 0 : 1)
        : trackLookup ? 10_000 : 10_001;
      const group = groups.get(title) ?? { title, order, jobs: [] };
      group.jobs.push(job);
      groups.set(title, group);
    }
    return [...groups.values()].sort((a, b) => a.order - b.order);
  })();

  return (
    <div className="space-y-5">
      <Card title="Collection" sub={`${data.localAttachments.toLocaleString('en-GB')} tracks encountered · gathering stories for future DJ links`}>
        <div className="grid grid-cols-2 gap-2">
          <CompactMetric label="Claims for DJs" value={data.retainedClaims} detail="Ready for future links" />
          {data.workQueue && <CompactMetric label="Research queue" value={activeJobs}
            detail={`${readyJobs} ready · ${waitingJobs} waiting · ${runningJobs} running`} />}
          {data.wikipediaChunkCharacterTarget != null && <CompactMetric label="Wiki text per chunk"
            value={`${data.wikipediaChunkCharacterTarget.toLocaleString('en-GB')} chars`}
            detail="Current adaptive target" />}
          {data.wikipediaExtractAverageLatencyMs != null && <CompactMetric label="Wiki extract average"
            value={`${(data.wikipediaExtractAverageLatencyMs / 1000).toFixed(1)}s`}
            detail={`${(data.wikipediaExtractCallCount ?? 0).toLocaleString('en-GB')} calls · same window as Stats`} />}
          {data.wikipediaExtractAverageLatencyMs == null && <CompactMetric label="Wiki extract average"
            value="—" detail="No calls in the Stats window yet" />}
        </div>
      </Card>
      <Card
        title="Recent story sparks"
        sub="What was offered, generated, sent to speech, and confirmed on air"
      >
        <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-2">
          {recentSparks.length ? recentSparks.map((spark) => {
            const sentToTts = !!spark.ttsRequestedAt && spark.ttsText != null;
            let voiceStatus = 'Waiting for speech';
            if (spark.airedAt) voiceStatus = 'Voice aired';
            else if (sentToTts) voiceStatus = spark.releasedAt ? 'Voice not aired' : 'Air not confirmed';
            else if (spark.releasedAt) voiceStatus = 'Dropped before speech';
            return (
              <article key={spark.id} className="rounded-md border border-border/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">
                      {spark.trackTitle || 'Unknown track'}{spark.trackArtist ? ` · ${spark.trackArtist}` : ''}
                    </p>
                    <p className="text-xs text-muted">
                      Generated {dateTime(spark.suppliedAt)}
                      {spark.ttsRequestedAt ? ` · Sent to speech ${dateTime(spark.ttsRequestedAt)}` : ''}
                      {spark.airedAt && <span className="block">Voice aired {dateTime(spark.airedAt)}</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={spark.airedAt ? 'solid' : 'default'}>{voiceStatus}</Pill>
                    {spark.contextPassReason ? <Pill tone="default">Not this moment</Pill>
                      : spark.qualityRejectionReason ? <Pill tone="default">Quality flag</Pill>
                        : <Pill tone={spark.detectionStatus === 'detected' ? 'solid' : 'default'}>
                            {spark.detectionStatus === 'detected' ? 'Claim signal found' : 'No clear claim signal'}
                          </Pill>}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 md:grid-cols-2">
                  <div className="min-w-0">
                    <Eyebrow>Offered spark</Eyebrow>
                    <p className="mt-1 text-[13px] leading-[1.55]">{spark.offeredWording}</p>
                    <p className="mt-1 text-xs text-muted">{spark.category.replaceAll('-', ' ')} · {spark.topic}</p>
                    {spark.contextPassReason && <p className="mt-1 text-xs text-muted">Not this moment: {spark.contextPassReason}. The spark stays available for another link.</p>}
                    {spark.qualityRejectionReason && <p className="mt-1 text-xs text-muted">Quality concern: {spark.qualityRejectionReason}. {spark.binExempt
                      ? 'This connection is exempt from the Recycle Bin for now.'
                      : 'Counts towards the Recycle Bin only if the voice airs.'}</p>}
                  </div>
                  <div className="min-w-0">
                    <Eyebrow>{sentToTts ? 'Text sent to speech' : 'Generated link'}</Eyebrow>
                    <p className="mt-1 text-[13px] leading-[1.55] break-words whitespace-pre-wrap">
                      {sentToTts ? spark.ttsText : spark.generatedText || 'No generated link text was retained.'}
                    </p>
                  </div>
                </div>
              </article>
            );
          }) : (
            <p className="text-[13px] text-muted">Story sparks offered to the link writer will appear here.</p>
          )}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted">
          “Voice aired” means Liquidsoap confirmed the clip reached its live edge. A claim cooldown starts only when a clear claim signal was found and that clip aired. The signal checks for distinctive wording overlap, so a paraphrase can be missed.
        </p>
      </Card>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <Card title="Recent research" sub={recent.length ? `${recent.length} newest claims in this preview` : 'No retained claims yet'}>
          <div className="max-h-[25rem] space-y-3 overflow-y-auto pr-2">
            {recent.length
              ? recent.map((claim, index) => <ClaimCard key={`${claim.provider}-${claim.topic}-${index}`} claim={claim} />)
              : <p className="text-[13px] text-muted">Source-backed claims will appear here when collection retains them.</p>}
          </div>
        </Card>
        <Card title="Research queue" sub={`${workQueueItems.length.toLocaleString('en-GB')} queued or running jobs · grouped by article section`}>
          <div className="max-h-[25rem] space-y-4 overflow-y-auto pr-1">
            {queueGroups.length ? queueGroups.map((group) => (
              <section key={group.title}>
                <h3 className="mb-1 text-xs font-semibold text-muted">{group.title}</h3>
                <div className="divide-y divide-border/60">
                  {group.jobs.map((job) => {
                    const subject = job.subjectArtist ? `${job.subjectArtist} · ${job.subjectTitle}` : job.subjectTitle;
                    return <div key={job.id} className="flex items-start justify-between gap-3 py-2 first:pt-1">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium" title={subject}>{subject}</p>
                        <p className="text-xs text-muted">{queueTaskName(job)}{job.attempts > 0 ? ` · ${job.attempts} attempts` : ''}</p>
                      </div>
                      <Pill tone={job.phase === 'ready' || job.phase === 'running' ? 'solid' : 'default'}>
                        {queuePhaseText(job)}
                      </Pill>
                    </div>;
                  })}
                </div>
              </section>
            )) : <p className="py-2 text-[13px] text-muted">No research jobs are queued.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ResearchView({
  data, search, onSearch, category, onCategory, categories, claims,
}: {
  data: NotesReadout;
  search: string;
  onSearch: (value: string) => void;
  category: string;
  onCategory: (value: string) => void;
  categories: string[];
  claims: NotesReadout['claims'];
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Tracks encountered" value={data.localAttachments} />
        <Metric label="Claims retained" value={data.retainedClaims} />
        <Metric label="Research jobs" value={data.researchJobs} />
        <Metric label="Matches pending" value={data.pendingMatches} />
      </div>
      <Card title="Recent claims" sub={`Showing ${data.claims.length === 80 ? 'the latest 80' : `all ${data.claims.length}`} retained claims`}>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search recent claims</span>
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search artist, album, claim…" className="w-full rounded-md border border-border bg-transparent py-2 pr-3 pl-9 text-[13px] outline-none focus:border-primary" />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">
            <span>Category</span>
            <select value={category} onChange={(event) => onCategory(event.target.value)} className="rounded-md border border-border bg-transparent px-2 py-2 text-[13px] text-ink">
              <option value="all">All</option>
              {categories.map((value) => <option key={value} value={value}>{value.replaceAll('-', ' ')}</option>)}
            </select>
          </label>
        </div>
        <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-2">
          {claims.length
            ? claims.map((claim, index) => <ClaimCard key={`${claim.provider}-${claim.topic}-${index}`} claim={claim} />)
            : <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted">{data.claims.length ? 'No claims match those filters.' : 'No source-backed claims have been collected yet.'}</p>}
        </div>
      </Card>
    </div>
  );
}

function entityTypeName(type: ExploreEntity['entityType']): string {
  if (type === 'artist') return 'Artist';
  if (type === 'recording') return 'Track';
  if (type === 'release-group') return 'Album';
  return 'Release';
}

function ExploreView({ adminFetch, hydrated }: { adminFetch: (path: string, init?: RequestInit) => Promise<Response>; hydrated: boolean }) {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [selectedLetter, setSelectedLetter] = useState('');
  const [page, setPage] = useState(0);
  const [selectedArtist, setSelectedArtist] = useState<ExploreEntity | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<ExploreEntity | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<ExploreEntity | null>(null);
  const pageSize = 30;
  const offset = page * pageSize;
  const level = selectedAlbum ? 'tracks' : selectedArtist ? 'albums' : 'artists';
  const params = new URLSearchParams({ level, limit: String(pageSize), offset: String(offset), search });
  if (selectedLetter) params.set('letter', selectedLetter);
  if (selectedArtist) params.set('artistId', selectedArtist.entityId);
  if (selectedAlbum) {
    params.set('albumType', selectedAlbum.entityType);
    params.set('albumId', selectedAlbum.entityId);
  }
  const results = useAdminQuery<ExplorePage>({
    key: ['sleeve-notes', 'explore', level, selectedArtist?.entityId, selectedAlbum?.entityType, selectedAlbum?.entityId, search, selectedLetter, page],
    adminFetch,
    enabled: hydrated,
    request: (fetcher, signal) => adminJson(fetcher, `/sleeve-notes/explore?${params.toString()}`, undefined, signal),
    staleTime: 10_000,
  });
  const selected = selectedTrack ?? selectedAlbum ?? selectedArtist;
  const selectedType = selected?.entityType ?? null;
  const selectedId = selected?.entityId ?? null;
  const selectedLabel = selectedTrack ? 'Track' : selectedAlbum ? 'Album' : selectedArtist ? 'Artist' : null;
  const dossier = useAdminQuery<EntityDossier>({
    key: ['sleeve-notes', 'dossier', selectedType, selectedId],
    adminFetch,
    enabled: hydrated && !!selectedType && !!selectedId && (selected?.claimCount ?? 0) > 0,
    request: (fetcher, signal) => {
      if (!selectedType || !selectedId) throw new Error('Choose an entity to open its dossier.');
      return adminJson(fetcher,
        `/sleeve-notes/dossier/${encodeURIComponent(selectedType)}/${encodeURIComponent(selectedId)}`,
        undefined,
        signal,
      );
    },
    staleTime: 10_000,
  });
  const totalPages = Math.max(1, Math.ceil((results.data?.total ?? 0) / pageSize));

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(draft.trim());
    setSelectedLetter('');
    setPage(0);
    if (level === 'albums') {
      setSelectedAlbum(null);
      setSelectedTrack(null);
    } else if (level === 'tracks') {
      setSelectedTrack(null);
    }
  }

  function enterArtist(entity: ExploreEntity) {
    setSelectedArtist(entity);
    setSelectedAlbum(null);
    setSelectedTrack(null);
    setSearch('');
    setSelectedLetter('');
    setDraft('');
    setPage(0);
  }

  function enterAlbum(entity: ExploreEntity) {
    setSelectedAlbum(entity);
    setSelectedTrack(null);
    setSearch('');
    setSelectedLetter('');
    setDraft('');
    setPage(0);
  }

  function showArtists() {
    setSelectedArtist(null);
    setSelectedAlbum(null);
    setSelectedTrack(null);
    setSearch('');
    setSelectedLetter('');
    setDraft('');
    setPage(0);
  }

  function showAlbums() {
    setSelectedAlbum(null);
    setSelectedTrack(null);
    setSearch('');
    setSelectedLetter('');
    setDraft('');
    setPage(0);
  }

  function showTracks() {
    setSelectedTrack(null);
    setSearch('');
    setSelectedLetter('');
    setDraft('');
    setPage(0);
  }

  function jumpToLetter(letter: string) {
    setSelectedLetter(letter);
    setSearch('');
    setDraft('');
    setSelectedTrack(null);
    setPage(0);
  }

  const levelTitle = level === 'artists' ? 'Artists' : level === 'albums' ? `Albums by ${selectedArtist?.title ?? 'artist'}` : `Tracks on ${selectedAlbum?.title ?? 'album'}`;
  const listTitle = selectedLetter ? `${levelTitle} · ${selectedLetter}` : levelTitle;
  const searchPlaceholder = level === 'artists' ? 'Search artists…' : level === 'albums' ? 'Search albums…' : 'Search tracks…';
  const emptyText = level === 'artists'
    ? 'Artists with retained Sleeve Notes will appear here.'
    : level === 'albums'
      ? 'No albums with retained Sleeve Notes were found for this artist.'
      : 'No tracks with retained Sleeve Notes were found on this album.';

  return (
    <div className="space-y-5">
      <Card title="Explore retained Sleeve Notes" sub="browse from artist to album to track">
        <nav aria-label="Explore location" className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={showArtists} className={!selectedArtist ? 'font-semibold text-ink' : 'text-primary hover:underline'}>Artists</button>
          {selectedArtist && <><span aria-hidden="true" className="text-muted">/</span><button type="button" onClick={showAlbums} className={!selectedAlbum ? 'font-semibold text-ink' : 'text-primary hover:underline'}>{selectedArtist.title}</button></>}
          {selectedAlbum && <><span aria-hidden="true" className="text-muted">/</span><button type="button" onClick={showTracks} className={!selectedTrack ? 'font-semibold text-ink' : 'text-primary hover:underline'}>{selectedAlbum.title}</button></>}
          {selectedTrack && <><span aria-hidden="true" className="text-muted">/</span><span className="font-semibold text-ink">{selectedTrack.title}</span></>}
        </nav>
        <form onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{searchPlaceholder}</span>
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={searchPlaceholder} className="w-full rounded-md border border-border bg-transparent py-2 pr-3 pl-9 text-[13px] outline-none focus:border-primary" />
          </label>
          <button type="submit" className="rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted/40">Search</button>
        </form>
      </Card>
      {results.error && <Card title="Could not load the Notes library"><p className="text-[13px] text-muted">{results.error instanceof Error ? results.error.message : 'The Explore index is temporarily unavailable.'}</p><button type="button" onClick={() => void results.refetch()} className="mt-3 text-[13px] font-medium text-primary hover:underline">Try again</button></Card>}
      {results.isLoading && <p className="text-[13px] text-muted">Loading {level.toLowerCase()}…</p>}
      {!results.error && results.data && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.4fr)]">
          <Card title={listTitle} sub={results.data.total ? `${offset + 1}–${Math.min(offset + pageSize, results.data.total)} of ${results.data.total}` : `No ${level} with retained notes${selectedLetter ? ` starting with ${selectedLetter}` : ''}`}>
            <div className="grid grid-cols-[minmax(0,1fr)_2rem] gap-2">
              <div className="max-h-[36rem] overflow-y-auto pr-2">
                {results.data.entities.length ? (
                  <div className="divide-y divide-border/60">
                    {results.data.entities.map((entity) => (
                      <button
                        key={`${entity.entityType}-${entity.entityId}`}
                        type="button"
                        onClick={() => {
                          if (level === 'artists') enterArtist(entity);
                          else if (level === 'albums') enterAlbum(entity);
                          else setSelectedTrack(entity);
                        }}
                        aria-pressed={selectedType === entity.entityType && selectedId === entity.entityId}
                        className="flex w-full items-center justify-between gap-3 py-3 text-left first:pt-0 last:pb-0 hover:text-primary"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium">{entity.title}</span>
                          <span className="block text-[11px] text-muted">{level === 'albums' ? 'Album' : entityTypeName(entity.entityType)}{entity.artist ? ` · ${entity.artist}` : ''} · {entity.localMatch ? 'matched to library' : 'not matched locally'}</span>
                          <span className="block text-[11px] text-muted">{entity.claimCount > 0 ? `${entity.claimCount} retained ${entity.claimCount === 1 ? 'claim' : 'claims'}` : level === 'artists' ? 'Browse albums and tracks' : level === 'albums' ? 'Browse tracks' : 'Retained notes'}</span>
                          {entity.childCount > 0 && <span className="block text-[11px] text-muted">{entity.childCount} {level === 'albums' ? 'tracks with notes' : 'items'}</span>}
                        </span>
                        <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                ) : <p className="py-5 text-[13px] text-muted">{emptyText}</p>}
              </div>
              <nav aria-label="Jump to first letter" className="flex max-h-[36rem] flex-col items-stretch gap-0.5 overflow-y-auto border-l border-border/60 pl-1">
                <button type="button" aria-pressed={!selectedLetter} onClick={() => jumpToLetter('')} className={`rounded px-0.5 py-1 text-[9px] font-semibold ${!selectedLetter ? 'bg-ink text-bg' : 'text-muted hover:bg-muted/40 hover:text-ink'}`}>All</button>
                {EXPLORE_LETTERS.map((letter) => (
                  <button key={letter} type="button" aria-pressed={selectedLetter === letter} onClick={() => jumpToLetter(letter)} className={`rounded px-0.5 py-0.5 text-[10px] font-medium ${selectedLetter === letter ? 'bg-ink text-bg' : 'text-muted hover:bg-muted/40 hover:text-ink'}`}>{letter}</button>
                ))}
              </nav>
            </div>
            {results.data.total > pageSize && <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
              <button type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="text-xs font-medium text-primary disabled:text-muted">Previous</button>
              <span className="text-xs text-muted">Page {page + 1} of {totalPages}</span>
              <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))} className="text-xs font-medium text-primary disabled:text-muted">Next</button>
            </div>}
          </Card>
          <Card title={dossier.data?.title ?? selected?.title ?? 'Entity dossier'} sub={dossier.data ? `${selectedLabel ?? entityTypeName(dossier.data.entityType)} · ${dossier.data.localMatch ? 'matched to library' : 'not matched locally'}` : selected ? 'source-backed claims and evidence' : 'select an artist, album or track'}>
            {selected && <Link href={`/admin/notes?tab=connections&focusType=${encodeURIComponent(selected.entityType)}&focusId=${encodeURIComponent(selected.entityId)}`} className="mb-3 inline-flex items-center gap-2 text-[13px] font-medium text-primary hover:underline">
              View connections <GitBranch className="size-4" aria-hidden="true" />
            </Link>}
            {!selected && <p className="text-[13px] text-muted">Choose an artist to browse its albums, then open a track to read retained claims and evidence sources.</p>}
            {selected && selected.claimCount === 0 && <p className="text-[13px] leading-[1.55] text-muted">No claims are attached directly to this {(selectedLabel ?? entityTypeName(selected.entityType)).toLowerCase()}. {level === 'artists' ? 'Browse its albums and tracks for retained notes.' : level === 'albums' ? 'Browse tracks on this album for retained notes.' : 'No source-backed track notes are available yet.'}</p>}
            {selected && selected.claimCount > 0 && dossier.isLoading && <p className="text-[13px] text-muted">Loading dossier…</p>}
            {dossier.error && <p className="text-[13px] text-muted">{dossier.error instanceof Error ? dossier.error.message : 'The dossier is temporarily unavailable.'}</p>}
            {dossier.data && <div className="max-h-[38rem] space-y-3 overflow-y-auto pr-2">
              {dossier.data.claims.length
                ? dossier.data.claims.map((claim, index) => <ClaimCard key={`${claim.provider}-${claim.topic}-${index}`} claim={claim} />)
                : <p className="text-[13px] text-muted">No retained claims are attached to this dossier.</p>}
            </div>}
          </Card>
        </div>
      )}
    </div>
  );
}

function ConfigView({
  status, values, loading, settingsError, busy, tokenDraft, onTokenDraft, message, onSave,
  wikiRefreshBusy, wikiRefreshMessage, onWikiRefresh, wikiPromptDraft, onWikiPromptDraft,
  adminFetch, hydrated,
}: {
  status: NotesStatus | undefined;
  values: SettingsData['values'] | undefined;
  loading: boolean;
  settingsError: string | null;
  busy: boolean;
  tokenDraft: string;
  onTokenDraft: (value: string) => void;
  message: string;
  onSave: (patch: Record<string, unknown>, success: string) => void;
  wikiRefreshBusy: boolean;
  wikiRefreshMessage: string;
  onWikiRefresh: (mode: 'clear' | 'replace') => void;
  wikiPromptDraft: string;
  onWikiPromptDraft: (value: string) => void;
  adminFetch: (path: string, init?: RequestInit) => Promise<Response>;
  hydrated: boolean;
}) {
  const geniusEnabled = values?.sleeveNotes?.providers?.genius?.enabled ?? status?.providerEnabled ?? true;
  const researchWhenEmpty = values?.djBehaviour?.sleeveNotesMaintenanceWhenEmpty === true;
  const storySparkFrequency = values?.djBehaviour?.extendedSleeveNoteUseFrequency ?? 'occasional';
  const artistClaimLimit = values?.sleeveNotes?.wikipedia?.artistClaimLimit ?? 20;
  const albumClaimLimit = values?.sleeveNotes?.wikipedia?.albumClaimLimit ?? 5;
  const [artistClaimDraft, setArtistClaimDraft] = useState(String(artistClaimLimit));
  const [albumClaimDraft, setAlbumClaimDraft] = useState(String(albumClaimLimit));
  useEffect(() => { setArtistClaimDraft(String(artistClaimLimit)); }, [artistClaimLimit]);
  useEffect(() => { setAlbumClaimDraft(String(albumClaimLimit)); }, [albumClaimLimit]);
  const savedInSettings = status?.providerTokenSource === 'settings';
  const prompt = values?.sleeveNotes?.wikipedia?.extractPrompt ?? '';
  const effectivePrompt = wikiPromptDraft.trim() || status?.wikipediaDefaultPrompt || '';
  const previewArtists = useAdminQuery<{ artists: Array<{ id: string; name: string; hasCachedArticle: boolean }> }>({
    key: ['sleeve-notes', 'wikipedia-preview-artists'],
    adminFetch,
    enabled: hydrated,
    request: (fetcher, signal) => adminJson(fetcher, '/sleeve-notes/wikipedia-preview-artists', undefined, signal),
    staleTime: 30_000,
  });
  const [previewArtistId, setPreviewArtistId] = useState('');
  const previewAlbums = useAdminQuery<{ albums: Array<{ id: string; name: string; hasCachedArticle: boolean }> }>({
    key: ['sleeve-notes', 'wikipedia-preview-albums', previewArtistId],
    adminFetch,
    enabled: hydrated && Boolean(previewArtistId),
    request: (fetcher, signal) => adminJson(fetcher,
      `/sleeve-notes/wikipedia-preview-albums/${encodeURIComponent(previewArtistId)}`, undefined, signal),
    staleTime: 30_000,
  });
  const [previewAlbumId, setPreviewAlbumId] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewOutput, setPreviewOutput] = useState<{
    entityType: 'artist' | 'release-group'; subject: string | null;
    section: string; output: string; elapsedMs: number; inputCharacters: number; wikiNumber: number;
  } | null>(null);
  useEffect(() => { onWikiPromptDraft(prompt || status?.wikipediaDefaultPrompt || ''); },
    [onWikiPromptDraft, prompt, status?.wikipediaDefaultPrompt]);

  async function previewWikipediaPrompt() {
    if (!previewArtistId) return;
    setPreviewBusy(true);
    setPreviewError('');
    setPreviewOutput(null);
    try {
      const result = await adminJson<NonNullable<typeof previewOutput>>(
        adminFetch, '/sleeve-notes/wikipedia-prompt-preview', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entityType: previewAlbumId ? 'release-group' : 'artist',
            entityId: previewAlbumId || previewArtistId, prompt: wikiPromptDraft }),
        },
      );
      setPreviewOutput(result);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Could not generate a preview.');
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card title="Collection controls" sub="these settings apply only to Extended Sleeve Notes">
        {loading ? <p className="text-[13px] text-muted">Loading Config…</p> : settingsError ? (
          <p className="text-[13px] text-muted">Could not read saved settings: {settingsError}</p>
        ) : (
          <div className="space-y-5">
            <div className="field">
              <Label>Genius metadata collection</Label>
              <Seg value={geniusEnabled ? 'on' : 'off'} options={[
                { id: 'off', label: 'Off', title: 'Do not queue Genius metadata research' },
                { id: 'on', label: 'On', title: 'Collect Genius recording credits and musical connections when configured' },
              ]} onChange={(value) => onSave({ sleeveNotes: { providers: { genius: { enabled: value === 'on' } } } }, `Genius metadata collection ${value === 'on' ? 'enabled' : 'disabled'}.`)} />
              <p className="mt-2 text-[13px] leading-[1.55] text-muted">Collect structured producer, Writer and musical-connection metadata only. Lyrics are not fetched or retained. The station-wide master switch must also be on.</p>
            </div>
            <div className="field">
              <Label>Research while the station is empty</Label>
              <Seg value={researchWhenEmpty ? 'on' : 'off'} options={[
                { id: 'off', label: 'Off', title: 'Pause non-airing Sleeve Notes research while the station is empty' },
                { id: 'on', label: 'On', title: 'Allow low-priority backfill while Icecast confirms zero listeners' },
              ]} onChange={(value) => onSave({ djBehaviour: { sleeveNotesMaintenanceWhenEmpty: value === 'on' } }, `Empty-station research ${value === 'on' ? 'enabled' : 'disabled'}.`)} />
              <p className="mt-2 text-[13px] leading-[1.55] text-muted">This controls background research only. It does not resume DJ speech or picks, and work still yields to higher-priority station tasks.</p>
            </div>
          </div>
        )}
      </Card>
      <Card title="Wikipedia research prompt" sub={status?.wikipediaPromptIsCustom ? 'custom prompt active' : 'default prompt active'}>
        <p className="mb-3 max-w-4xl text-[13px] leading-[1.55] text-muted">Set the instructions used to choose and rank claims. Use <code>{'{wikiNumber}'}</code> where the prompt should state how many claims this article section may return. The code shares your Artist or Album limit across sections according to their text length; source checks may retain fewer. A refresh uses the saved Wikipedia text.</p>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="field"><span className="text-[13px] font-medium">Claims per Artist article</span><Input type="number" min={1} max={20} step={1} value={artistClaimDraft} onChange={(event) => setArtistClaimDraft(event.target.value)} className="mt-1 w-28" /></label>
          <label className="field"><span className="text-[13px] font-medium">Claims per Album article</span><Input type="number" min={1} max={20} step={1} value={albumClaimDraft} onChange={(event) => setAlbumClaimDraft(event.target.value)} className="mt-1 w-28" /></label>
          <button type="button" disabled={busy || !/^([1-9]|1\d|20)$/u.test(artistClaimDraft) || !/^([1-9]|1\d|20)$/u.test(albumClaimDraft) || (Number(artistClaimDraft) === artistClaimLimit && Number(albumClaimDraft) === albumClaimLimit)} onClick={() => onSave({ sleeveNotes: { wikipedia: { artistClaimLimit: Number(artistClaimDraft), albumClaimLimit: Number(albumClaimDraft) } } }, 'Wikipedia claim limits saved.')} className="rounded-md border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">Save claim limits</button>
        </div>
        <textarea
          aria-label="Wikipedia research prompt"
          maxLength={8000}
          value={wikiPromptDraft}
          onChange={(event) => { onWikiPromptDraft(event.target.value); setPreviewOutput(null); setPreviewError(''); }}
          className="min-h-48 w-full rounded-md border border-border bg-bg p-3 text-[13px] leading-[1.55]"
          placeholder={status?.wikipediaDefaultPrompt}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <span>{wikiPromptDraft.length.toLocaleString('en-GB')} / 8,000 characters · {wikiPromptDraft === (status?.wikipediaDefaultPrompt ?? '') && !prompt ? 'Default prompt is active.' : 'Custom instructions are active after saving.'}</span>
          <div className="flex gap-2">
            <button type="button" disabled={busy || wikiPromptDraft === prompt} onClick={() => onSave({ sleeveNotes: { wikipedia: { extractPrompt: wikiPromptDraft } } }, 'Wikipedia research prompt saved.')} className="rounded-md bg-ink px-3 py-2 font-semibold text-bg disabled:opacity-50">Save prompt</button>
            <button type="button" disabled={busy || !prompt} onClick={() => { onWikiPromptDraft(''); onSave({ sleeveNotes: { wikipedia: { extractPrompt: '' } } }, 'Default Wikipedia research prompt restored.'); }} className="rounded-md border border-border px-3 py-2 font-medium disabled:opacity-50">Restore default</button>
          </div>
        </div>
        {effectivePrompt && <details className="mt-3"><summary className="cursor-pointer text-xs font-medium">Preview active prompt</summary><pre className="mt-2 rounded-md bg-muted/20 p-3 text-xs leading-[1.5] whitespace-pre-wrap">{effectivePrompt}</pre></details>}
        <div className="mt-5 border-t border-border/70 pt-4">
          <Label htmlFor="wikipedia-prompt-preview-artist">Test prompt against an encountered artist or album</Label>
          <p className="mt-1 mb-3 text-xs leading-[1.5] text-muted">Choose an artist, then preview either their artist article or one of their cached album articles. It runs one call on the first article chunk using the prompt currently in the editor; the result is not stored as claims.</p>
          <div className="flex flex-wrap gap-2">
            <select id="wikipedia-prompt-preview-artist" value={previewArtistId}
              onChange={(event) => { setPreviewArtistId(event.target.value); setPreviewAlbumId(''); setPreviewOutput(null); setPreviewError(''); }}
              className="min-w-64 rounded-md border border-border bg-bg px-3 py-2 text-[13px]">
              <option value="">Choose an artist…</option>
              {(previewArtists.data?.artists ?? []).map((artist) => <option key={artist.id} value={artist.id} disabled={!artist.hasCachedArticle}>{artist.name}{artist.hasCachedArticle ? '' : ' · no cached Wikipedia article'}</option>)}
            </select>
            <select aria-label="Choose an artist or album article to preview" value={previewAlbumId}
              disabled={!previewArtistId || previewAlbums.isLoading}
              onChange={(event) => { setPreviewAlbumId(event.target.value); setPreviewOutput(null); setPreviewError(''); }}
              className="min-w-64 rounded-md border border-border bg-bg px-3 py-2 text-[13px]">
              <option value="">Artist article</option>
              {(previewAlbums.data?.albums ?? []).map((album) => <option key={album.id} value={album.id} disabled={!album.hasCachedArticle}>{album.name}{album.hasCachedArticle ? '' : ' · no cached Wikipedia article'}</option>)}
            </select>
            <button type="button" disabled={previewBusy || !previewArtistId || wikiPromptDraft.length > 8000}
              onClick={() => void previewWikipediaPrompt()}
              className="rounded-md border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">
              {previewBusy ? 'Generating preview…' : 'Preview changes'}
            </button>
          </div>
          {previewArtists.error && <p className="mt-2 text-xs text-red-700">Could not load encountered artists.</p>}
          {previewAlbums.error && <p className="mt-2 text-xs text-red-700">Could not load albums for this artist.</p>}
          {!previewArtists.isLoading && !previewArtists.error && !(previewArtists.data?.artists.length)
            && <p className="mt-2 text-xs text-muted">No artists encountered by Extended Sleeve Notes are available.</p>}
          {previewError && <p role="alert" className="mt-3 text-[13px] text-red-700">{previewError}</p>}
          {previewOutput && <div className="mt-4 rounded-md border border-border p-3">
            <div className="text-xs text-muted">{previewOutput.subject} · {previewOutput.entityType === 'artist' ? 'artist' : 'album'} article · {previewOutput.section} · up to {previewOutput.wikiNumber} claims in this section · {(previewOutput.elapsedMs / 1000).toFixed(1)}s · {previewOutput.inputCharacters.toLocaleString('en-GB')} article characters</div>
            <pre className="mt-3 text-[13px] leading-[1.6] whitespace-pre-wrap">{previewOutput.output || '(The model returned no text.)'}</pre>
          </div>}
        </div>
      </Card>
      <Card title="Refresh Wikipedia claims" sub="runs on each artist or album’s next encounter">
        <p className="max-w-4xl text-[13px] leading-[1.55] text-muted">Research is extracted from the cached article text. Manually reviewed claims are preserved in both modes.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={wikiRefreshBusy} onClick={() => onWikiRefresh('replace')} className="rounded-md border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">{wikiRefreshBusy ? 'Working…' : 'Keep claims, refresh and replace'}</button>
          <button type="button" disabled={wikiRefreshBusy} onClick={() => onWikiRefresh('clear')} className="rounded-md border border-red-500/50 px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-50">Clear claims and refresh</button>
        </div>
        {wikiRefreshMessage && <p role="status" className="mt-3 text-[13px] text-muted">{wikiRefreshMessage}</p>}
      </Card>
      <Card title="Story spark frequency" sub={`DJ guidance: ${storySparkFrequency}`}>
        <div className="field">
          <Label>How often the DJ uses an offered spark</Label>
          <Seg value={storySparkFrequency} options={[
            { id: 'regular', label: 'Regular', title: 'Encourage the DJ to use fitting sparks often and weave them into the link naturally' },
            { id: 'occasional', label: 'Occasional', title: 'Use a spark when it gives this particular link an interesting angle' },
            { id: 'rare', label: 'Rare', title: 'Use a spark only when it adds a particularly strong angle' },
          ]} onChange={(value) => onSave(
            { djBehaviour: { extendedSleeveNoteUseFrequency: value } },
            `Story spark use set to ${value}.`,
          )} />
          <p className="mt-2 text-[13px] leading-[1.55] text-muted">This changes how readily the DJ uses an offered spark. Every setting leaves room to skip one that would make the link sound forced. It does not change which sparks are offered or add another model call.</p>
        </div>
      </Card>
      <Card title="Genius access token" sub={savedInSettings ? 'saved in Settings' : status?.providerConfigured ? 'using a server environment token' : 'not configured'}>
        <p className="max-w-4xl text-[13px] leading-[1.55] text-muted">Create a Genius API client, then generate its Client Access Token. The saved token is masked and never returned to the browser. Saving one here makes it the station’s Settings-backed token.</p>
        <a href="https://genius.com/api-clients" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
          Open Genius API Clients <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
        <div className="mt-4 max-w-2xl">
          <Label htmlFor="genius-access-token">Genius Client Access Token</Label>
          <Input id="genius-access-token" type="password" autoComplete="new-password" value={tokenDraft} onChange={(event) => onTokenDraft(event.target.value)} placeholder={savedInSettings ? 'Saved token is hidden; enter a replacement' : 'Paste Client Access Token'} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy || !tokenDraft.trim()} onClick={() => onSave({ sleeveNotes: { providers: { genius: { accessToken: tokenDraft.trim() } } } }, 'Genius token saved.')} className="rounded-md bg-ink px-3 py-2 text-xs font-semibold text-bg disabled:opacity-50">Save token</button>
          {savedInSettings && <button type="button" disabled={busy} onClick={() => onSave({ sleeveNotes: { providers: { genius: { accessToken: '' } } } }, 'Saved Genius token cleared.')} className="rounded-md border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">Clear saved token</button>}
        </div>
        {status?.providerTokenSource === 'environment' && <p className="mt-3 text-xs text-muted">A server environment token is currently available. A token saved here takes priority over it.</p>}
        {message && <p role="status" className="mt-3 text-[13px] text-muted">{message}</p>}
      </Card>
      <Card title="Station-wide control" sub="the master switch stays in global DJ Behaviour">
        <p className="text-[13px] leading-[1.55] text-muted">Turn Extended Sleeve Notes on or off for the whole station. When off, provider controls above remain saved but no Extended work runs.</p>
        <Link href="/admin/settings?section=behaviour&card=extended-sleeve-notes" className="mt-3 inline-flex items-center gap-2 text-[13px] font-medium text-primary hover:underline">Open DJ Behaviour <ArrowRight className="size-4" aria-hidden="true" /></Link>
      </Card>
    </div>
  );
}

function SourcesView({
  data, status,
}: {
  data: NotesReadout;
  status: NotesStatus | undefined;
}) {
  const cachedSeries = data.musicBrainzSeries.filter((series) => series.fetchedAt && !series.lastError).length;
  const totalMembers = data.musicBrainzSeries.reduce((sum, series) => sum + series.members, 0);
  const localClaims = data.musicBrainzSeries.reduce((sum, series) => sum + series.localClaims, 0);
  const geniusCoverage = status?.coverage ?? {};
  const seriesRows = data.musicBrainzSeries.map((series) => {
    const state = seriesState(series);
    const label = series.editionYear ? `${series.name} · ${series.editionYear}` : series.name;
    return (
      <tr key={series.id} className="border-t border-border/60 align-top">
        <td className="px-3 py-2 font-medium">{label}<span className="block text-[10px] text-muted">{series.ranked ? 'Ranked list' : 'Additions list'}</span></td>
        <td className="px-3 py-2">{series.entityType === 'recording' ? 'Track' : 'Album'}</td>
        <td className="px-3 py-2"><Pill tone={state.tone}>{state.label}</Pill>{series.lastError && <span className="mt-1 block max-w-64 text-[10px] text-muted">{series.lastError}</span>}</td>
        <td className="px-3 py-2 tabular-nums">{series.members.toLocaleString('en-GB')}</td>
        <td className="px-3 py-2 tabular-nums">{series.localClaims.toLocaleString('en-GB')}</td>
        <td className="px-3 py-2 tabular-nums" title={`${series.libraryTracks.toLocaleString('en-GB')} local tracks linked`}>{series.libraryAlbums.toLocaleString('en-GB')}</td>
        <td className="px-3 py-2 whitespace-nowrap">{dateTime(series.fetchedAt)}</td>
      </tr>
    );
  });
  const jobRows = data.jobSummary.map((job) => (
    <tr key={`${job.provider}-${job.capability}-${job.state}`} className="border-t border-border/60">
      <td className="px-3 py-2 font-medium">{job.provider}</td>
      <td className="px-3 py-2">{job.capability}</td>
      <td className="px-3 py-2">{job.state}</td>
      <td className="px-3 py-2 tabular-nums">{job.jobs.toLocaleString('en-GB')}</td>
      <td className="px-3 py-2 whitespace-nowrap">{dateTime(job.nextDue)}</td>
    </tr>
  ));
  const requestRows = data.providerSummary.map((request) => (
    <tr key={`${request.provider}-${request.capability}-${request.outcome}-${request.status ?? 'none'}`} className="border-t border-border/60">
      <td className="px-3 py-2 font-medium">{providerName(request.provider)}</td>
      <td className="px-3 py-2">{request.capability}</td>
      <td className="px-3 py-2">{request.outcome}{request.status ? ` · ${request.status}` : ''}</td>
      <td className="px-3 py-2 tabular-nums">{request.requests.toLocaleString('en-GB')}</td>
      <td className="px-3 py-2 whitespace-nowrap">{dateTime(request.lastRequestedAt)}</td>
    </tr>
  ));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="MusicBrainz lists cached" value={cachedSeries} detail={`of ${data.musicBrainzSeries.length} curated lists`} />
        <Metric label="Series members" value={totalMembers} detail="track and album entries retained" />
        <Metric label="Local recognition claims" value={localClaims} detail="matched by canonical identity or library scan" />
        <Metric label="Genius items processed" value={geniusCoverage.processed ?? 0} detail={`${geniusCoverage.queued ?? 0} queued · ${geniusCoverage['retry-at'] ?? 0} retrying · ${geniusCoverage.failed ?? 0} failed`} />
      </div>

      <ReadoutTable title="MusicBrainz Series" sub="Curated list snapshots and matches in this library" empty="The Series catalogue has not been initialized yet." headings={['List', 'Level', 'Cache', 'Members', 'Local claims', 'Library albums', 'Last refreshed']} rows={seriesRows} />

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <ReadoutTable title="Research queue" sub="Background work by provider and capability" empty="No research jobs are queued." headings={['Provider', 'Work', 'State', 'Jobs', 'Next due']} rows={jobRows} />
        <ReadoutTable title="Provider activity" sub="Request outcomes grouped by source" empty="No provider requests have been recorded." headings={['Source', 'Work', 'Outcome', 'Calls', 'Latest']} rows={requestRows} />
      </div>

      <Card title="Genius collection" sub={status?.providerEnabled ? (status.providerConfigured ? 'provider enabled and configured' : 'server token missing') : 'provider disabled'}>
        <p className="text-[13px] leading-[1.55] text-muted">Genius collection requires both its provider switch and a server-held access token. It stores approved metadata and relationships; lyric text is never collected.</p>
      </Card>

    </div>
  );
}
