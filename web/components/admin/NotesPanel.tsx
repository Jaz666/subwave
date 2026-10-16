'use client';
import SleeveNotesSegmentSettings from './SleeveNotesSegmentSettings';

import Link from 'next/link';
import type { FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, BookOpen, Compass, ExternalLink, GitBranch, Search, Settings2, ShieldCheck } from 'lucide-react';
import { Card, Eyebrow, Pill, Seg } from './ui';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { SectionTabs } from './SectionTabs';
import HeardOnAir from './HeardOnAir';
import NotesLiveSummary from './NotesLiveSummary';
import { useAdminAuth } from '../../lib/adminAuth';
import { adminJson, useAdminQuery, useAdminMutation, type AdminFetch } from '../../lib/admin-query';
import { notify } from '../../lib/notify';
import { useSettingsMutation, useSettingsQuery } from './settings/queries';
import type { SettingsData } from './settings/shared';
import ConnectionsVisualizer from './connections/ConnectionsVisualizer';
import SleeveNotesModeration from './SleeveNotesModeration';
import MusicBrainzLists from './MusicBrainzLists';

type NotesTab = 'overview' | 'stories' | 'heard' | 'moderation' | 'connections' | 'config';

type NotesStatus = {
  enabled: boolean;
  providerEnabled: boolean;
  providerConfigured: boolean;
  providerTokenSource?: 'settings' | 'environment' | 'missing';
  collectionRunning: boolean;
  collectionPaused?: boolean;
  collectionBlockedReason: string | null;
  wikipediaPrompt?: string;
  wikipediaDefaultPrompt?: string;
  wikipediaPromptIsCustom?: boolean;
  coverage?: Record<string, number>;
};

type NotesReadout = {
  researchPausedByBudget?: boolean;
  active: boolean;
  readAt?: number;
  localAttachments: number;
  encounters: number;
  pendingMatches: number;
  retainedClaims: number;
  wikipediaArtistChunkCharacterTarget?: number;
  wikipediaAlbumChunkCharacterTarget?: number;
  wikipediaExtractAverageLatencyMs?: number | null;
  wikipediaExtractCallCount?: number;
  airtimeClaims: number;
  creditClaims: number;
  recycleBinPending: number;
  researchJobs: number;
  artists: Array<{ name: string; musicbrainzId: string | null; sources: number; claims: number }>;
  claims: Array<{
    id: string;
    entityType?: ExploreEntity['entityType'];
    entityId?: string;
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
    entityType?: ExploreEntity['entityType'];
    entityId?: string;
    sourceUrl?: string;
    trackTitle: string | null;
    trackArtist: string | null;
    offeredWording: string;
    category: string;
    topic: string;
    detectionStatus: 'detected' | 'not-detected';
    generatedSignal?: { status: 'detected' | 'not-detected'; reason: string; clause: string | null } | null;
    speechSignal?: { status: 'detected' | 'not-detected'; reason: string; clause: string | null } | null;
    ttsRenderedAt?: string | null;
    ttsEngine?: string | null;
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
    enabled?: boolean;
    removed?: boolean;
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
  { id: 'stories', label: 'Stories', icon: Compass },
  { id: 'heard', label: 'Heard on air', icon: BookOpen },
  { id: 'connections', label: 'Station Brain', icon: GitBranch },
  { id: 'moderation', label: 'Review', icon: ShieldCheck },
  { id: 'config', label: 'Settings', icon: Settings2 },
];
const EXPLORE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function dateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function providerName(provider: string) {
  if (provider === 'web-operator') return 'Archived web research';
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
  return <div className="min-w-0 rounded-md border border-border/70 px-3 py-2 lg:px-2 lg:py-1.5">
    <div className="flex items-baseline gap-2">
      <span className="text-lg font-semibold tabular-nums lg:text-base">{typeof value === 'number' ? value.toLocaleString('en-GB') : value}</span>
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

function ClaimCard({ claim, adminFetch, readOnly = false }: { claim: NotesReadout['claims'][number]; adminFetch: AdminFetch; readOnly?: boolean }) {
  const review = useAdminMutation<{ id: string }, void>({ adminFetch,
    request: (_value, fetcher) => adminJson(fetcher, `/sleeve-notes/claims/${encodeURIComponent(claim.id)}/review`, { method: 'POST' }),
    onDone: async (_data, _vars, client) => {
      notify.ok('Story sent to Review and withdrawn from future DJ offers.');
      await client.invalidateQueries({ queryKey: ['sleeve-notes'] });
    },
  });
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
        <p>{claim.wording}</p>
      </div>
      {claim.entityId && claim.entityType && <div className="mt-3 flex gap-3 text-xs text-primary">
        <Link href={`/admin/notes?tab=stories&storyType=${claim.entityType}&storyId=${encodeURIComponent(claim.entityId)}`}>Saved story context</Link>
        <Link href={`/admin/notes?tab=connections&focusType=${claim.entityType}&focusId=${encodeURIComponent(claim.entityId)}`}>Station Brain</Link>
      </div>}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-border/60 pt-2">
        <div className="min-w-0">
          <details><summary className="cursor-pointer text-xs text-muted">Supporting evidence</summary><ClaimEvidence provider={claim.provider} evidence={claim.evidence} /></details>
          {claim.attribution && <p className="mt-1 text-[11px] leading-4 text-muted">{claim.attribution}</p>}
        </div>
        <a href={claim.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex flex-none items-center gap-1 text-xs font-medium text-primary hover:underline">
          {providerName(claim.provider)} source <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </div>
      {!readOnly && <div className="mt-3 border-t border-border/60 pt-2">
        <button type="button" disabled={review.isPending || review.isSuccess} onClick={() => review.mutate()}
          className="text-xs font-medium text-primary hover:underline disabled:opacity-50">{review.isPending ? 'Sending…' : review.isSuccess ? 'Sent to Review' : 'Send to Review'}</button>
        <p className="mt-1 text-[11px] text-muted">Withdraws this fact from DJ use until you correct or delete it in Review.</p>
        {review.error && <p role="alert" className="mt-1 text-xs text-vermilion">{review.error.message}</p>}
      </div>}
    </article>
  );
}

function seriesState(series: NotesReadout['musicBrainzSeries'][number]) {
  if (series.removed) return { label: 'Removed · cache kept', tone: 'default' as const };
  if (series.enabled === false) return { label: 'Disabled · cache kept', tone: 'default' as const };
  if (series.lastError) return { label: 'Needs attention', tone: 'accent' as const };
  if (!series.fetchedAt) return { label: 'Waiting', tone: 'default' as const };
  if (series.members === 0) return { label: 'No members', tone: 'default' as const };
  return { label: 'Cached', tone: 'solid' as const };
}

export default function NotesPanel() {
  const { adminFetch: stationFetch, hydrated } = useAdminAuth();
  const adminFetch = useMemo(() => (path: string, init?: RequestInit) => {
    const cached = path.startsWith('/sleeve-notes/') && (!init?.method || init.method === 'GET');
    return stationFetch(cached ? `${path}${path.includes('?') ? '&' : '?'}cached=1` : path, init);
  }, [stationFetch]);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const fromBrain=searchParams.get('from')==='brain';
  const aliases: Record<string, NotesTab> = { research: 'stories', explore: 'stories', sources: 'overview', settings: 'config', review: 'moderation', brain: 'connections' };
  const tab: NotesTab = rawTab && TABS.some((item) => item.id === rawTab) ? rawTab as NotesTab : aliases[rawTab ?? ''] ?? 'overview';
  const [storiesMode, setStoriesMode] = useState(rawTab === 'explore' ? 'browse' : 'all');
  const storyType = searchParams.get('storyType');
  const storyId = searchParams.get('storyId');
  const story = useAdminQuery<EntityDossier>({
    key: ['sleeve-notes', 'dossier', storyType, storyId], adminFetch,
    enabled: hydrated && tab === 'stories' && !!storyId && ['artist', 'recording', 'release', 'release-group'].includes(storyType ?? ''),
    request: (fetcher, signal) => adminJson(fetcher, `/sleeve-notes/dossier/${encodeURIComponent(storyType ?? '')}/${encodeURIComponent(storyId ?? '')}`, undefined, signal),
    staleTime: 10_000,
  });

  const status = useAdminQuery<NotesStatus>({
    key: ['sleeve-notes', 'status'], adminFetch, enabled: hydrated,
    request: (fetcher, signal) => adminJson(fetcher, '/sleeve-notes/status', undefined, signal),
    staleTime: 10_000, refetchInterval: 30_000,
  });
  const enabled = status.data?.enabled === true;
  const needsReadout = tab === 'overview';
  const readout = useAdminQuery<NotesReadout>({
    key: ['sleeve-notes', 'readout', enabled], adminFetch, enabled: hydrated && !!status.data && needsReadout,
    request: (fetcher, signal) => adminJson(fetcher, '/sleeve-notes/readout', undefined, signal),
    staleTime: 10_000, refetchInterval: 30_000,
  });
  const settingsQuery = useSettingsQuery<SettingsData>({
    adminFetch, enabled: hydrated && tab === 'config',
  });
  const settingsSave = useSettingsMutation<SettingsData>({ adminFetch });
  const data = readout.data;
  const [search, setSearch] = useState(searchParams.get('q')??'');
  const [storyOffset,setStoryOffset]=useState(0);
  const [category, setCategory] = useState('all');
  const storyQuery=searchParams.get('q')??'';
  useEffect(()=>{setSearch(storyQuery);setStoryOffset(0);if(fromBrain){setStoriesMode('all');setCategory('all');}},[storyQuery,fromBrain]);
  const [tokenDraft, setTokenDraft] = useState('');
  const [wikiPromptDraft, setWikiPromptDraft] = useState('');
  const [configMessage, setConfigMessage] = useState('');
  const [wikiRefreshBusy, setWikiRefreshBusy] = useState(false);
  const [wikiRefreshMessage, setWikiRefreshMessage] = useState('');
  const collection=useAdminQuery<{claims:NotesReadout['claims'];total:number;categories:string[]}>({
    key:['sleeve-notes','stories',search,category,storiesMode,storyOffset],adminFetch,
    enabled:hydrated&&tab==='stories'&&!storyId&&storiesMode!=='browse',
    request:(fetcher,signal)=>adminJson(fetcher,`/sleeve-notes/stories?${new URLSearchParams({search,category:category==='all'?'':category,recent:storiesMode==='recent'?'1':'0',offset:String(storyOffset)})}`,undefined,signal),
    staleTime:10_000,
  });
  const backParams=new URLSearchParams(searchParams.toString());
  backParams.delete('storyType');backParams.delete('storyId');backParams.delete('storyName');
  backParams.delete('from');backParams.set('tab',fromBrain?'connections':'stories');
  const storyBack=`${pathname??'/admin/notes'}?${backParams}`;

  function selectTab(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`${pathname ?? '/admin/notes'}?${params.toString()}`, { scroll: false });
  }

  async function refreshWikipedia(mode: 'clear' | 'replace') {
    setWikiRefreshBusy(true);
    setWikiRefreshMessage('');
    try {
      // admin-query-imperative: wikipedia-refresh-preview
      const preview = await adminJson<{ artists: number; albums: number; claims: number }>(
        adminFetch, '/sleeve-notes/wikipedia-refresh-preview',
      );
      const description = mode === 'clear'
        ? `Disable ${preview.claims} automatic Wikipedia facts for ${preview.artists} artists and ${preview.albums} albums now, then research them again on their next encounter?`
        : `Mark ${preview.artists} artists and ${preview.albums} albums for refresh when each is next played? Existing facts stay available until that entity's full scan succeeds, and only encountered entities enter the research queue.`;
      if (!window.confirm(description)) return;
      const result = await adminJson<{ artists: number; albums: number; claimsCleared: number }>(
        adminFetch, '/sleeve-notes/wikipedia-refresh', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }),
        },
      );
      setWikiRefreshMessage(mode === 'clear'
        ? `Marked ${result.artists} artists and ${result.albums} albums for research on next encounter; disabled ${result.claimsCleared} automatic facts.`
        : `Marked ${result.artists} artists and ${result.albums} albums for refresh on next play. Existing facts remain available until each full scan succeeds; jobs are added as entities are encountered.`);
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
            Give your DJ stories about the music you play. Sleeve Notes gathers source-backed facts and connections; the DJ uses them when they fit.
          </p>
        </div>
        <SectionTabs tabs={TABS} value={tab} onChange={selectTab} label="Extended Sleeve Notes sections" />
      </section>

      {tab === 'overview' && (
        <OverviewView
          adminFetch={adminFetch}
          enabled={enabled}
          status={status.data}
          statusLoading={status.isLoading || !hydrated}
          statusError={!!status.error}
          readout={data}
          openActivity={rawTab === 'sources'}
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
          <p className="text-[13px] leading-[1.55] text-muted">Saved stories and connections remain browsable. Collection and Story Spark offers are paused until you enable Sleeve Notes in Settings.</p>
          <Link href="/admin/notes?tab=config" className="mt-3 inline-flex items-center gap-2 text-[13px] font-medium text-primary hover:underline">
            Open Sleeve Notes Settings <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Card>
      )}

      {hydrated && needsReadout && readout.error && (
        <Card title="Could not load collection data">
          <p className="text-[13px] text-muted">{readout.error instanceof Error ? readout.error.message : 'The Notes readout is temporarily unavailable.'}</p>
          <button type="button" onClick={() => void readout.refetch()} className="mt-3 text-[13px] font-medium text-primary hover:underline">Try again</button>
        </Card>
      )}
      {hydrated && needsReadout && readout.isLoading && <p className="text-[13px] text-muted">Loading collection data…</p>}

      {tab === 'stories' && storyId && <Card title={story.data?.title ?? searchParams.get('storyName') ?? 'Saved story context'}>
        <Link href={storyBack} className="text-xs text-primary">{fromBrain?'Back to Station Brain':'Back to Stories'}</Link>
        {story.error && <p role="alert" className="mt-3 text-[13px]">{story.error instanceof Error ? story.error.message : 'Could not load saved stories'}</p>}
        {story.isLoading && <p role="status" className="mt-3 text-[13px]">Loading saved facts…</p>}
        <div className="mt-3 space-y-3">{story.data?.claims.map((claim) => <ClaimCard key={claim.id} claim={claim} adminFetch={adminFetch} readOnly={!enabled} />)}</div>
      </Card>}
      {tab === 'stories' && !storyId && <Seg value={storiesMode} options={[{id:'all',label:'All saved facts'},{ id: 'recent', label: 'Recent facts' }, { id: 'browse', label: 'Browse library' }]} onChange={value=>{setStoriesMode(value);setStoryOffset(0);}} />}
      {tab==='stories'&&!storyId&&fromBrain&&<Link href={storyBack} className="text-xs text-primary">Back to Station Brain</Link>}
      {tab==='stories'&&collection.error&&<p role="alert">Could not load saved facts. Please try again.</p>}
      {tab==='stories'&&collection.isLoading&&storiesMode!=='browse'&&!storyId&&<p role="status">Loading saved facts…</p>}
      {hydrated && collection.data && tab === 'stories' && !storyId && storiesMode !== 'browse' && (
        <ResearchView
          adminFetch={adminFetch}
          readOnly={!enabled}
          total={collection.data.total}
          recent={storiesMode==='recent'}
          search={search}
          onSearch={value=>{setSearch(value);setStoryOffset(0);}}
          category={category}
          onCategory={value=>{setCategory(value);setStoryOffset(0);}}
          categories={collection.data.categories}
          claims={collection.data.claims}
          offset={storyOffset}
          onOffset={setStoryOffset}
        />
      )}
      {hydrated && tab === 'moderation' && <SleeveNotesModeration adminFetch={adminFetch} hydrated={hydrated} />}
      {hydrated && tab === 'heard' && <HeardOnAir adminFetch={adminFetch} />}
      {hydrated && tab === 'stories' && !storyId && storiesMode === 'browse' && <ExploreView adminFetch={adminFetch} hydrated={hydrated} readOnly={!enabled} />}
      {hydrated && tab === 'connections' && <ConnectionsVisualizer adminFetch={adminFetch} hydrated={hydrated} readOnly={!enabled} />}

    </div>
  );
}

function OverviewView({
  enabled, status, statusLoading, statusError, readout, onRetryStatus, openActivity, adminFetch,
}: {
  adminFetch: AdminFetch;
  enabled: boolean;
  status: NotesStatus | undefined;
  statusLoading: boolean;
  statusError: boolean;
  readout: NotesReadout | undefined;
  onRetryStatus: () => void;
  openActivity: boolean;
}) {
  if (statusLoading && !statusError) {
    return <Card title="Checking Extended Sleeve Notes"><p className="text-[13px] text-muted">Reading the station-wide setting…</p></Card>;
  }
  if (statusError || !status) {
    return (
      <Card title="Collection status unavailable">
        <p className="text-[13px] leading-[1.55] text-muted">The station’s Extended Sleeve Notes setting could not be read. Retry before assuming collection is on or off.</p>
        <button type="button" onClick={onRetryStatus} className="mt-3 text-[13px] font-medium text-primary hover:underline">Try again</button>
      </Card>
    );
  }
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <div><p className="text-sm font-medium">{enabled && !status.collectionPaused && !readout?.researchPausedByBudget ? 'Research enabled' : 'Research paused'}</p>
        <p className="mt-1 text-xs text-muted">{enabled && status.collectionPaused ? 'Collection is paused. Saved Sparks remain available to the DJ.' : enabled && readout?.researchPausedByBudget ? 'Paused by the station token budget. Saved jobs will resume when allowance is available.' : enabled ? 'Research runs when broadcast activity allows.' : 'Saved stories remain available to browse.'}</p></div>
      <div className="flex flex-wrap gap-5 text-sm">
        <Link href="/admin/notes?tab=stories">{readout?.airtimeClaims ?? '—'} usable stories</Link>
        <Link href="/admin/notes?tab=moderation">{readout?.recycleBinPending ?? '—'} awaiting Review</Link>
      </div>
      <details className="text-xs"><summary className="cursor-pointer text-primary">Manage research</summary>
        <Link href="/admin/notes?tab=config" className="mt-2 inline-flex items-center gap-2 text-primary">Settings and refresh controls <ArrowRight className="size-4" /></Link>
      </details>
    </div>
    <NotesLiveSummary adminFetch={adminFetch} enabled={enabled} />
    {enabled && status.providerEnabled && !status.providerConfigured && <Card title="Needs attention">
      <p className="text-[13px] text-muted">Genius connections are enabled but need an access token.</p>
      <Link href="/admin/notes?tab=config" className="mt-2 inline-block text-sm text-primary">Open Settings →</Link>
    </Card>}
    {readout && readout.retainedClaims === 0 && <Card title="Get your first story">
      <ol className="list-decimal space-y-2 pl-5 text-[13px]"><li>Enable Sleeve Notes in Settings.</li><li>Optionally add a Genius token for credits and musical connections.</li><li>Play music. Research saves facts over time, then offers a suitable fact to the DJ as a Story Spark.</li></ol>
      <div className="mt-4 rounded-md border border-border p-3 text-[13px]"><Eyebrow>Illustrative example · not station data</Eyebrow><p className="mt-2">Saved fact: an album was recorded in a converted church.</p><p className="mt-1">Offered Spark: that recording story, when an album track is played.</p><p className="mt-1">DJ line: “This album was recorded in a converted church — here’s another track from it.”</p></div>
    </Card>}
    {readout && <ActiveOverview data={readout} status={status} openActivity={openActivity} />}
  </div>;
}

function ActiveOverview({ data, status, openActivity }: { data: NotesReadout; status: NotesStatus; openActivity: boolean }) {
  const recentSparks = data.recentSparks ?? [];
  const workQueue = data.workQueue ?? [];
  const workQueueItems = (data.workQueueItems ?? []).filter((job) => job.phase !== 'unavailable');
  const countPhase = (phase: NonNullable<NotesReadout['workQueue']>[number]['phase']) => workQueue
    .filter((job) => job.phase === phase).reduce((sum, job) => sum + job.jobs, 0);
  const readyJobs = countPhase('ready');
  const waitingJobs = countPhase('first-play') + countPhase('next-play') + countPhase('time-delay');
  const runningJobs = countPhase('running');

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
      <Card title="Research activity" sub="MusicBrainz, Wikipedia and Genius">
        <div className="space-y-5">
          <section><h3 className="text-sm font-medium">Research queue</h3>
            <p className="my-2 text-xs text-muted">{readyJobs} ready · {waitingJobs} waiting · {runningJobs} running</p>
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
            )) : <p className="py-2 text-[13px] text-muted">{status.enabled ? 'No research jobs are queued.' : 'Collection is paused. Saved jobs will be re-evaluated when Sleeve Notes is enabled.'}</p>}
          </div>
          </section>
        </div>
      </Card>
      <details className="border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">Recent Story Sparks and DJ lines</summary><div className="mt-3">
      <Card
        title="Recent story sparks"
        sub="A saved fact becomes a Story Spark when offered to the DJ"
      >
        <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-2">
          {recentSparks.length ? recentSparks.map((spark) => {
            const sentToTts = !!spark.ttsRequestedAt && spark.ttsText != null;
            const recentlyOffered = typeof data.readAt === 'number' && data.readAt - Date.parse(spark.suppliedAt) < 5 * 60_000;
            const voiceStatus = spark.contextPassReason ? 'DJ passed'
              : spark.qualityRejectionReason ? 'Needs review'
                : spark.airedAt ? spark.speechSignal?.status === 'detected' ? 'Aired · fact detected' : 'Aired · fact not confirmed'
                  : spark.releasedAt || !recentlyOffered ? 'Air not confirmed' : 'Preparing speech';
            return (
              <article key={spark.id} className="rounded-md border border-border/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">
                      {spark.trackTitle || 'Unknown track'}{spark.trackArtist ? ` · ${spark.trackArtist}` : ''}
                    </p>
                    <p className="text-xs text-muted">
                      Offered {dateTime(spark.suppliedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={spark.airedAt ? 'solid' : 'default'}>{voiceStatus}</Pill>

                  </div>
                </div>
                <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 md:grid-cols-2">
                  <div className="min-w-0">
                    <Eyebrow>Offered spark</Eyebrow>
                    <p className="mt-1 text-[13px] leading-[1.55]">{spark.offeredWording}</p>
                    {spark.entityId && spark.entityType && <div className="mt-2 flex gap-3 text-xs text-primary"><Link href={`/admin/notes?tab=stories&storyType=${spark.entityType}&storyId=${encodeURIComponent(spark.entityId)}`}>Saved story context</Link><Link href={`/admin/notes?tab=connections&focusType=${spark.entityType}&focusId=${encodeURIComponent(spark.entityId)}`}>Station Brain</Link>{spark.sourceUrl && <a href={spark.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a>}</div>}
                    <p className="mt-1 text-xs text-muted">{spark.category.replaceAll('-', ' ')} · {spark.topic}</p>

                  </div>
                  <div className="min-w-0">
                    <Eyebrow>DJ line</Eyebrow>
                    <p className="mt-1 text-[13px] leading-[1.55] break-words whitespace-pre-wrap">
                      {sentToTts ? spark.ttsText : spark.generatedText || 'No generated link text was retained.'}
                    </p>
                  </div>
                </div>
                <details className="mt-3 text-xs text-muted"><summary className="cursor-pointer">Detection and speech details</summary>
                  <p className="mt-2">Generated fact check: {spark.generatedSignal?.reason ?? 'No separate check saved'}</p>
                  <p>Speech fact check: {spark.speechSignal?.reason ?? 'No separate check saved'}</p>
                  <p>Speech engine: {spark.ttsEngine ?? 'Not saved'}</p>
                  <p>Speech requested: {dateTime(spark.ttsRequestedAt)} · rendered: {dateTime(spark.ttsRenderedAt)} · aired: {dateTime(spark.airedAt)} · released: {dateTime(spark.releasedAt)}</p>
                  {spark.contextPassReason && <p>DJ passed: {spark.contextPassReason}. The fact stays available.</p>}
                  {spark.qualityRejectionReason && <p>Quality concern: {spark.qualityRejectionReason}. {spark.binExempt ? 'This connection is exempt from automatic review.' : 'Counts towards Review only if the voice airs.'}</p>}
                  <p>Automatic matching can miss paraphrases. An artist announcement alone does not establish fact use.</p>
                </details>
              </article>
            );
          }) : (
            <p className="text-[13px] text-muted">Story sparks offered to the link writer will appear here.</p>
          )}
        </div>

      </Card>
      </div></details>
      <details open={openActivity || undefined} className="border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">Research details</summary>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <CompactMetric label="Saved facts" value={data.retainedClaims} />
            <CompactMetric label="Tracks encountered" value={data.localAttachments} />
            {data.wikipediaExtractAverageLatencyMs != null && <CompactMetric label="Average Wiki extraction" value={`${(data.wikipediaExtractAverageLatencyMs / 1000).toFixed(1)}s`} />}
            {data.wikipediaArtistChunkCharacterTarget != null && <CompactMetric label="Artist Wiki chunk" value={`${data.wikipediaArtistChunkCharacterTarget} chars`} />}
            {data.wikipediaAlbumChunkCharacterTarget != null && <CompactMetric label="Album Wiki chunk" value={`${data.wikipediaAlbumChunkCharacterTarget} chars`} />}
          </div>
          <SourcesView data={data} status={status} />
        </div>
      </details>
    </div>
  );
}

function ResearchView({
  total, recent, offset, onOffset, search, onSearch, category, onCategory, categories, claims, adminFetch, readOnly,
}: {
  total:number; recent:boolean; offset:number; onOffset:(value:number)=>void;
  search: string;
  onSearch: (value: string) => void;
  category: string;
  onCategory: (value: string) => void;
  categories: string[];
  claims: NotesReadout['claims'];
  adminFetch: AdminFetch;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-5">
      <Card title={recent?'Recent saved facts':'All saved facts'} sub={recent?'Search the latest 80 saved facts.':'Search stories, artists, albums and tracks across your saved collection.'}>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search saved facts</span>
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={recent?'Search recent facts…':'Search all saved facts…'} className="w-full rounded-md border border-border bg-transparent py-2 pr-3 pl-9 text-[13px] outline-none focus:border-primary" />
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
            ? claims.map((claim, index) => <ClaimCard key={claim.id??`${claim.provider}-${claim.topic}-${index}`} claim={claim} adminFetch={adminFetch} readOnly={readOnly} />)
            : <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted">{search||category!=='all'?'No facts match those filters.':'No facts saved yet. Play music with Sleeve Notes enabled to build your collection.'}</p>}
        </div>
        <div className="mt-4 flex items-center gap-3 text-xs"><span>{total} matching facts</span>
          <button type="button" disabled={!offset} onClick={()=>onOffset(Math.max(0,offset-30))}>Previous</button>
          <button type="button" disabled={offset+30>=total} onClick={()=>onOffset(offset+30)}>Next</button>
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

function ExploreView({ adminFetch, hydrated, readOnly }: { adminFetch: (path: string, init?: RequestInit) => Promise<Response>; hydrated: boolean; readOnly: boolean }) {
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
      if (!selectedType || !selectedId) throw new Error('Choose an artist, album or track to see its saved stories.');
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
    ? 'Artists with saved stories will appear here.'
    : level === 'albums'
      ? 'No albums with saved stories were found for this artist.'
      : 'No tracks with saved stories were found on this album.';

  return (
    <div className="space-y-5">
      <Card title="Browse saved stories" sub="browse from artist to album to track">
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
                          <span className="block text-[11px] text-muted">{entity.claimCount > 0 ? `${entity.claimCount} saved ${entity.claimCount === 1 ? 'fact' : 'facts'}` : level === 'artists' ? 'Browse albums and tracks' : level === 'albums' ? 'Browse tracks' : 'Saved stories'}</span>
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
          <Card title={dossier.data?.title ?? selected?.title ?? 'Saved stories'} sub={dossier.data ? `${selectedLabel ?? entityTypeName(dossier.data.entityType)} · ${dossier.data.localMatch ? 'matched to library' : 'not matched locally'}` : selected ? 'saved facts and source evidence' : 'select an artist, album or track'}>
            {selected && <Link href={`/admin/notes?tab=connections&focusType=${encodeURIComponent(selected.entityType)}&focusId=${encodeURIComponent(selected.entityId)}`} className="mb-3 inline-flex items-center gap-2 text-[13px] font-medium text-primary hover:underline">
              View connections <GitBranch className="size-4" aria-hidden="true" />
            </Link>}
            {!selected && <p className="text-[13px] text-muted">Choose an artist to browse its albums, then open a track to read saved facts and their sources.</p>}
            {selected && selected.claimCount === 0 && <p className="text-[13px] leading-[1.55] text-muted">No saved facts are attached directly to this {(selectedLabel ?? entityTypeName(selected.entityType)).toLowerCase()}. {level === 'artists' ? 'Browse its albums and tracks for saved stories.' : level === 'albums' ? 'Browse tracks on this album for saved stories.' : 'No source-backed track notes are available yet.'}</p>}
            {selected && selected.claimCount > 0 && dossier.isLoading && <p className="text-[13px] text-muted">Loading saved stories…</p>}
            {dossier.error && <p className="text-[13px] text-muted">{dossier.error instanceof Error ? dossier.error.message : 'Saved stories are temporarily unavailable.'}</p>}
            {dossier.data && <div className="max-h-[38rem] space-y-3 overflow-y-auto pr-2">
              {dossier.data.claims.length
                ? dossier.data.claims.map((claim, index) => <ClaimCard key={claim.id??`${claim.provider}-${claim.topic}-${index}`} claim={claim} adminFetch={adminFetch} readOnly={readOnly} />)
                : <p className="text-[13px] text-muted">No saved facts are attached to this artist, album or track.</p>}
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const geniusEnabled = values?.sleeveNotes?.providers?.genius?.enabled ?? status?.providerEnabled ?? true;
  const researchWhenEmpty = values?.djBehaviour?.sleeveNotesMaintenanceWhenEmpty === true;
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
    enabled: hydrated && advancedOpen && status?.enabled === true,
    request: (fetcher, signal) => adminJson(fetcher, '/sleeve-notes/wikipedia-preview-artists', undefined, signal),
    staleTime: 30_000,
  });
  const [previewArtistId, setPreviewArtistId] = useState('');
  const previewAlbums = useAdminQuery<{ albums: Array<{ id: string; name: string; hasCachedArticle: boolean }> }>({
    key: ['sleeve-notes', 'wikipedia-preview-albums', previewArtistId],
    adminFetch,
    enabled: hydrated && advancedOpen && status?.enabled === true && Boolean(previewArtistId),
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
      <Card title="Enable Sleeve Notes" sub="Changes to switches save immediately">
        <Seg value={values?.djBehaviour?.extendedSleeveNotes ? 'on' : 'off'} disabled={busy || loading || !!settingsError} options={[{ id: 'off', label: 'Off' }, { id: 'on', label: 'On' }]} onChange={(value) => onSave({ djBehaviour: { extendedSleeveNotes: value === 'on' } }, `Sleeve Notes ${value === 'on' ? 'enabled' : 'paused'}.`)} />
        <p className="mt-3 text-[13px] text-muted">Enable to gather facts from played music and offer Story Sparks to the DJ. Turning off pauses collection and offers; your saved stories stay available.</p>
        {settingsError && <p role="alert" className="mt-2 text-[13px]">{settingsError}</p>}
      </Card>
      <Card title="Background collection" sub="Keep saved Sparks on air while research is paused">
        <Seg value={values?.djBehaviour?.sleeveNotesCollectionPaused?'paused':'running'} disabled={busy||loading||!!settingsError} options={[{id:'running',label:'Collect stories'},{id:'paused',label:'Pause collection'}]} onChange={value=>onSave({djBehaviour:{sleeveNotesCollectionPaused:value==='paused'}},value==='paused'?'Collection paused. Saved Sparks remain available.':'Collection resumed.')} />
        <p className="mt-3 text-[13px] text-muted">Pauses background matching, source collection and extraction. Saved jobs are kept for resumption. On-air links and segments retain access to cached Sparks while Sleeve Notes is enabled.</p>
      </Card>
      <SleeveNotesSegmentSettings key={JSON.stringify(values?.sleeveNotes?.segment)} config={values?.sleeveNotes?.segment} personas={values?.personas??[]} busy={busy||loading||!!settingsError} onSave={segment=>onSave({sleeveNotes:{segment}},'Sleeve Notes segment settings saved.')} />
            <Card title="Genius connections (optional)" sub={savedInSettings ? 'saved in Settings' : status?.providerConfigured ? 'using a server environment token' : 'not configured'}>
            <div className="field">
              <Label>Genius metadata collection</Label>
              <Seg value={geniusEnabled ? 'on' : 'off'} options={[
                { id: 'off', label: 'Off', title: 'Do not queue Genius metadata research' },
                { id: 'on', label: 'On', title: 'Collect Genius recording credits and musical connections when configured' },
              ]} disabled={busy || loading || !!settingsError} onChange={(value) => onSave({ sleeveNotes: { providers: { genius: { enabled: value === 'on' } } } }, `Genius metadata collection ${value === 'on' ? 'enabled' : 'disabled'}.`)} />
              <p className="mt-2 text-[13px] leading-[1.55] text-muted">Collect structured producer, writer and musical connection metadata only. Lyrics are not fetched or retained. The station-wide master switch must also be on.</p>
            </div>
        <p className="max-w-4xl text-[13px] leading-[1.55] text-muted">Create a Genius API client, then generate its Client Access Token. The saved token is masked and never returned to the browser. Saving one here makes it the station’s Settings-backed token.</p>
        <a href="https://genius.com/api-clients" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
          Open Genius API Clients <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
        <div className="mt-4 max-w-2xl">
          <Label htmlFor="genius-access-token">Genius Client Access Token</Label>
          <Input id="genius-access-token" type="password" autoComplete="new-password" value={tokenDraft} onChange={(event) => onTokenDraft(event.target.value)} placeholder={savedInSettings ? 'Saved token is hidden; enter a replacement' : 'Paste Client Access Token'} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy || loading || !!settingsError || !tokenDraft.trim()} onClick={() => onSave({ sleeveNotes: { providers: { genius: { accessToken: tokenDraft.trim() } } } }, 'Genius token saved.')} className="rounded-md bg-ink px-3 py-2 text-xs font-semibold text-bg disabled:opacity-50">Save token</button>
          {savedInSettings && <button type="button" disabled={busy || loading || !!settingsError} onClick={() => onSave({ sleeveNotes: { providers: { genius: { accessToken: '' } } } }, 'Saved Genius token cleared.')} className="rounded-md border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">Clear saved token</button>}
        </div>
        {status?.providerTokenSource === 'environment' && <p className="mt-3 text-xs text-muted">A server environment token is currently available. A token saved here takes priority over it.</p>}

      </Card>
      <MusicBrainzLists adminFetch={adminFetch} hydrated={hydrated} />
      <Card title="Collection preferences" sub="Switches save immediately · token, prompt and limits have their own Save buttons">
        {loading ? <p className="text-[13px] text-muted">Loading Settings…</p> : settingsError ? (
          <p className="text-[13px] text-muted">Could not read saved settings: {settingsError}</p>
        ) : (
          <div className="space-y-5">
            <div className="field">
              <Label>Research while the station is empty</Label>
              <Seg value={researchWhenEmpty ? 'on' : 'off'} options={[
                { id: 'off', label: 'Off', title: 'Pause non-airing Sleeve Notes research while the station is empty' },
                { id: 'on', label: 'On', title: 'Allow low-priority backfill while Icecast confirms zero listeners' },
              ]} disabled={busy || loading || !!settingsError} onChange={(value) => onSave({ djBehaviour: { sleeveNotesMaintenanceWhenEmpty: value === 'on' } }, `Empty-station research ${value === 'on' ? 'enabled' : 'disabled'}.`)} />
              <p className="mt-2 text-[13px] leading-[1.55] text-muted">This controls background research only. It does not resume DJ speech or picks, and work still yields to higher-priority station tasks.</p>
            </div>
          </div>
        )}
      </Card>
      <details onToggle={(event) => setAdvancedOpen(event.currentTarget.open)} className="rounded-md border border-border p-3"><summary className="cursor-pointer text-[13px] font-medium">Advanced · research prompt and limits</summary><div className="mt-3"><Card title="Wikipedia research prompt" sub={status?.wikipediaPromptIsCustom ? 'custom prompt active' : 'default prompt active'}>
        <p className="mb-3 max-w-4xl text-[13px] leading-[1.55] text-muted">Set the instructions used to choose and rank facts. Use <code>{'{wikiNumber}'}</code> where the prompt should state how many facts this article section may return. The code shares your Artist or Album limit across sections according to their text length; source checks may retain fewer. A refresh uses the saved Wikipedia text.</p>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="field"><span className="text-[13px] font-medium">Facts per artist article</span><Input type="number" min={1} max={20} step={1} value={artistClaimDraft} onChange={(event) => setArtistClaimDraft(event.target.value)} className="mt-1 w-28" /></label>
          <label className="field"><span className="text-[13px] font-medium">Facts per album article</span><Input type="number" min={1} max={20} step={1} value={albumClaimDraft} onChange={(event) => setAlbumClaimDraft(event.target.value)} className="mt-1 w-28" /></label>
          <button type="button" disabled={busy || loading || !!settingsError || !/^([1-9]|1\d|20)$/u.test(artistClaimDraft) || !/^([1-9]|1\d|20)$/u.test(albumClaimDraft) || (Number(artistClaimDraft) === artistClaimLimit && Number(albumClaimDraft) === albumClaimLimit)} onClick={() => onSave({ sleeveNotes: { wikipedia: { artistClaimLimit: Number(artistClaimDraft), albumClaimLimit: Number(albumClaimDraft) } } }, 'Wikipedia fact limits saved.')} className="rounded-md border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">Save fact limits</button>
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
            <button type="button" disabled={busy || loading || !!settingsError || wikiPromptDraft === (prompt || status?.wikipediaDefaultPrompt || '')} onClick={() => onSave({ sleeveNotes: { wikipedia: { extractPrompt: wikiPromptDraft } } }, 'Wikipedia research prompt saved.')} className="rounded-md bg-ink px-3 py-2 font-semibold text-bg disabled:opacity-50">Save prompt</button>
            <button type="button" disabled={busy || !prompt} onClick={() => { onWikiPromptDraft(''); onSave({ sleeveNotes: { wikipedia: { extractPrompt: '' } } }, 'Default Wikipedia research prompt restored.'); }} className="rounded-md border border-border px-3 py-2 font-medium disabled:opacity-50">Restore default</button>
          </div>
        </div>
        {effectivePrompt && <details className="mt-3"><summary className="cursor-pointer text-xs font-medium">Preview active prompt</summary><pre className="mt-2 rounded-md bg-muted/20 p-3 text-xs leading-[1.5] whitespace-pre-wrap">{effectivePrompt}</pre></details>}
        <div className="mt-5 border-t border-border/70 pt-4">
          {!status?.enabled && <p className="mb-3 text-xs text-muted">Enable Sleeve Notes before running a prompt test.</p>}
          <Label htmlFor="wikipedia-prompt-preview-artist">Test prompt against an encountered artist or album</Label>
          <p className="mt-1 mb-3 text-xs leading-[1.5] text-muted">Choose an artist, then preview either their artist article or one of their cached album articles. It runs one call on the first article chunk using the prompt currently in the editor; the result is not saved as facts.</p>
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
            <button type="button" disabled={!status?.enabled || previewBusy || !previewArtistId || wikiPromptDraft.length > 8000}
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
            <div className="text-xs text-muted">{previewOutput.subject} · {previewOutput.entityType === 'artist' ? 'artist' : 'album'} article · {previewOutput.section} · up to {previewOutput.wikiNumber} facts in this section · {(previewOutput.elapsedMs / 1000).toFixed(1)}s · {previewOutput.inputCharacters.toLocaleString('en-GB')} article characters</div>
            <pre className="mt-3 text-[13px] leading-[1.6] whitespace-pre-wrap">{previewOutput.output || '(The model returned no text.)'}</pre>
          </div>}
        </div>
      </Card>
      </div></details>
      <details className="rounded-md border border-border p-3"><summary className="cursor-pointer text-[13px] font-medium">Maintenance · refresh saved Wikipedia facts</summary><div className="mt-3"><Card title="Refresh Wikipedia facts" sub="keeps existing facts and queues each refresh on that artist or album’s next play">
        {!status?.enabled && <p className="mb-3 text-[13px] text-muted">Enable Sleeve Notes to use maintenance actions.</p>}
        <p className="max-w-4xl text-[13px] leading-[1.55] text-muted">Research is extracted from the cached article text. The keep-facts option adds work only as each artist or album is encountered; manually reviewed facts are preserved in both modes.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={wikiRefreshBusy || !status?.enabled} onClick={() => onWikiRefresh('replace')} className="rounded-md border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">{wikiRefreshBusy ? 'Working…' : 'Keep facts; refresh on next play'}</button>
          <button type="button" disabled={wikiRefreshBusy || !status?.enabled} onClick={() => onWikiRefresh('clear')} className="rounded-md border border-red-500/50 px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-50">Disable automatic facts and refresh</button>
        </div>
        {wikiRefreshMessage && <p role="status" className="mt-3 text-[13px] text-muted">{wikiRefreshMessage}</p>}
      </Card>

      </div></details>
      {message && <p role="status" className="text-[13px] text-muted">{message}</p>}
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
        <Metric label="Saved recognition facts" value={localClaims} detail="matched by canonical identity or library scan" />
        <Metric label="Genius items processed" value={geniusCoverage.processed ?? 0} detail={`${geniusCoverage.queued ?? 0} queued · ${geniusCoverage['retry-at'] ?? 0} retrying · ${geniusCoverage.failed ?? 0} failed`} />
      </div>

      <ReadoutTable title="MusicBrainz curated lists" sub="Curated list snapshots and matches in this library" empty="The Series catalogue has not been initialized yet." headings={['List', 'Level', 'Cache', 'Members', 'Local facts', 'Library albums', 'Last refreshed']} rows={seriesRows} />

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <ReadoutTable title="Provider activity" sub="Request outcomes grouped by source" empty="No provider requests have been recorded." headings={['Source', 'Work', 'Outcome', 'Calls', 'Latest']} rows={requestRows} />
      </div>

      <Card title="Genius collection" sub={!status?.enabled ? 'collection paused' : status?.providerEnabled ? (status.providerConfigured ? 'provider enabled and configured' : 'server token missing') : 'provider disabled'}>
        <p className="text-[13px] leading-[1.55] text-muted">Genius collection requires both its provider switch and a server-held access token. It stores approved metadata and relationships; lyric text is never collected.</p>
      </Card>

    </div>
  );
}
