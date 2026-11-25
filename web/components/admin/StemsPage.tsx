'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AudioLines, Disc3, Settings2, type LucideIcon } from 'lucide-react';
import { adminJson, useAdminQuery } from '../../lib/admin-query';
import { useAdminAuth } from '../../lib/adminAuth';
import { Button } from '../ui/button';
import { settingsHref } from './settings/settings-link';
import { settingsKeys } from './settings/queries';
import type { SettingsResponse } from './library/types';
import { stemBeatsRunsKey, type StemBeatsRun } from './stembeats/runs';
import StemBeatsCueReadyList, { type StemBeatsCandidate } from './StemBeatsCueReadyList';
import { MixingDeskStatusIcon, type MixingDeskStatus } from './subbeats/MixingDeskStatusIcon';

const runLabels: Record<StemBeatsRun['status'], string> = {
  queued: 'Waiting', running: 'Preparing', complete: 'Up to date', paused: 'Paused', failed: 'Needs attention',
};
const prepStageLabels = { downloading: 'downloading source', analyzing: 'measuring beat grid and cues', saving: 'saving prep data' } as const;
const extractionModeLabels = {
  'stem-blend': 'Stem Blend', 'stem-beats-8-8': 'Stem Beats · 8 bar → 8 bar',
  'stem-beats-8-16': 'Stem Beats · 8 bar → 16 bar', 'stem-beats-16-16': 'Stem Beats · 16 bar → 16 bar',
  'stem-beats-other': 'Stem Beats · other measured sizes',
} as const;
type ExtractionMode = keyof typeof extractionModeLabels;
type ExtractionSummary = { mode: ExtractionMode; samples: number; averageExtractionMs: number;
  averageSourceAcquisitionMs: number | null; averageRenderMs: number | null; averageOutgoingBars: number; averageIncomingBars: number };
const seconds = (milliseconds: number | null) => milliseconds == null ? '—' : `${(milliseconds / 1000).toFixed(1)}s`;

export default function StemsPage() {
  const { adminFetch, hydrated, needsAuth } = useAdminAuth();
  const ready = hydrated && !needsAuth;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const settings = useAdminQuery<SettingsResponse>({
    key: settingsKeys.detail(), adminFetch, enabled: ready, refetchInterval: 3_000,
    request: (fetcher, signal) => adminJson(fetcher, '/settings', undefined, signal), toastOnError: false,
  });
  const transitions = settings.data?.values?.transitions;
  const enabled = transitions?.stemsEnabled === true;
  const newStyle = transitions?.stemsStyle === 'new-style';
  const beatsEnabled = transitions?.newStyleStemBeats === true;
  const blendsEnabled = transitions?.newStyleStemBlends === true;
  const runs = useAdminQuery<StemBeatsRun[]>({
    key: stemBeatsRunsKey, adminFetch, enabled: ready && enabled && newStyle && beatsEnabled, refetchInterval: 4_000,
    request: async (fetcher, signal) => (await adminJson<{ runs: StemBeatsRun[] }>(
      fetcher, '/library/subbeats/prep-v2/runs', undefined, signal,
    )).runs,
  });
  const candidates = useAdminQuery<StemBeatsCandidate[]>({
    key: ['library', 'stembeats', 'candidates'], adminFetch, enabled: ready && enabled && newStyle && beatsEnabled,
    refetchInterval: 10_000,
    request: async (fetcher, signal) => (await adminJson<{ tracks: StemBeatsCandidate[] }>(
      fetcher, '/library/subbeats/prep-v2/candidates', undefined, signal,
    )).tracks,
  });
  const extractionMetrics = useAdminQuery<ExtractionSummary[]>({
    key: ['library', 'stems', 'pick-time-metrics'], adminFetch, enabled: ready && enabled && newStyle, refetchInterval: 10_000,
    request: async (fetcher, signal) => (await adminJson<{ summaries: ExtractionSummary[] }>(
      fetcher, '/library/stems/pick-time-metrics', undefined, signal,
    )).summaries,
  });
  const latestRun = runs.data?.filter(run => run.scope === 'library').at(-1);
  const activityRun = runs.data?.find(run => run.status === 'running')
    ?? runs.data?.find(run => run.waitingReason);
  const jobs = latestRun?.jobs ?? [];
  const completed = latestRun?.counts?.complete ?? jobs.filter(job => job.status === 'complete').length;
  const failed = latestRun?.counts?.failed ?? jobs.filter(job => job.status === 'failed').length;
  const sourceChanged = latestRun?.counts?.sourceChanged ?? jobs.filter(job => job.status === 'source-changed').length;
  const incomingReady = latestRun?.counts?.incomingReady ?? jobs.filter(job => job.roles.incoming.status === 'cue-ready').length;
  const outgoingReady = latestRun?.counts?.outgoingReady ?? jobs.filter(job => job.roles.outgoing.status === 'cue-ready').length;
  const total = latestRun?.total ?? jobs.length;
  const settingsUrl = settingsHref('stems', 'stems');

  const startPrep = async (mode: 'missing' | 'refresh') => {
    setBusy(true);
    setMessage('');
    try {
      const created = await adminJson<{ runId: string }>(adminFetch, '/library/subbeats/prep-v2/runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'library', mode }),
      });
      await adminJson(adminFetch, `/library/subbeats/prep-v2/runs/${created.runId}/start`, { method: 'POST' });
      await runs.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Stem Beats preparation could not start.');
    } finally {
      setBusy(false);
    }
  };

  const updateRun = async (run: StemBeatsRun, action: 'pause' | 'start' | 'retry-failed') => {
    setBusy(true);
    setMessage('');
    try {
      const init = action === 'pause'
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused: true }) }
        : { method: 'POST' };
      await adminJson(adminFetch, `/library/subbeats/prep-v2/runs/${run.runId}/${action}`, init);
      await runs.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The preparation run could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  if (!ready || settings.isPending) return null;

  return <div className="grid min-w-0 gap-5">
    <header className="max-w-3xl">
      <h1 className="font-display text-3xl font-bold text-ink">Stems</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Blend instruments between compatible songs or bring suitable songs together on the beat.
        If a pairing doesn’t suit stems, the usual transition plays.
      </p>
    </header>

    {!enabled ? <section className="grid gap-4 border border-ink p-4 sm:grid-cols-[1fr_auto] sm:items-center" aria-labelledby="stems-off-title">
      <div>
        <h2 id="stems-off-title" className="font-display text-xl font-bold">Stems are off</h2>
        <p className="mt-1 text-sm text-muted">Turn them on to try instrument blends and beat-matched transitions. You can switch them off again in Settings.</p>
      </div>
      <Button asChild className="min-h-11"><Link href={settingsUrl}><Settings2 size={16} />Turn on Stems</Link></Button>
      <FeatureLine icon={AudioLines} title="Stem Blend" description="Carries instruments from one song into another." />
      <FeatureLine icon={Disc3} title="Stem Beats" description="Matches compatible songs on the beat." />
    </section> : !newStyle ? <section className="grid gap-3 border border-ink p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <p className="text-sm text-muted">Legacy Stems are active. New Style adds beat-matched transitions and instrument blends.</p>
      <Button asChild variant="outline" className="min-h-11"><Link href={settingsUrl}>Open Stems settings</Link></Button>
    </section> : <div className="grid gap-3">
      <FeatureLine icon={AudioLines} title="Stem Blend" description="Blends instruments when the songs fit." status={blendsEnabled ? 'On' : 'Off'} iconState={blendsEnabled ? 'suitable' : 'unavailable'} />
      <section className="grid gap-3 border border-ink p-4" aria-labelledby="stem-beats-title">
        <div className="flex min-w-0 items-start gap-3">
          <MixingDeskStatusIcon icon={Disc3} label={`Stem Beats ${beatsEnabled ? 'on' : 'off'}`} state={beatsEnabled ? 'suitable' : 'unavailable'} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 id="stem-beats-title" className="font-display text-xl font-bold">Stem Beats</h2>
              <span className="text-xs text-muted">{beatsEnabled ? 'On' : 'Off'}</span>
            </div>
            <p className="mt-1 text-sm text-muted">Lines up compatible songs on the beat. Prepare the library in batches or as tracks play; extraction waits until a suitable pair is picked.</p>
          </div>
        </div>
        {beatsEnabled && <>
          {latestRun && <p className="text-sm text-muted" role="status">
            Latest run: {runLabels[latestRun.status]} · {completed.toLocaleString()} of {total.toLocaleString()} tracks · average {latestRun.timing?.averagePrepMs == null ? '—' : `${(latestRun.timing.averagePrepMs / 1000).toFixed(1)} sec`}
            {(failed + sourceChanged) > 0 && ` · ${failed + sourceChanged} need attention`}
          </p>}
          {latestRun && <p className="text-xs text-muted">Cue-ready: {incomingReady.toLocaleString()} incoming · {outgoingReady.toLocaleString()} outgoing</p>}
          {latestRun?.timing?.measuredJobs ? <p className="text-xs text-muted">
            Prep stages (averages across {latestRun.timing.measuredJobs} measured tracks): decode {seconds(latestRun.timing.averageDecodeMs ?? null)}
            {' · '}Beat This {seconds(latestRun.timing.averageGridMs ?? null)}
            {' · '}selected grid device: {latestRun.timing.selectedGpuGridJobs ?? 0} GPU / {latestRun.timing.selectedCpuGridJobs ?? 0} CPU
            {' · '}cue fit {seconds(latestRun.timing.averageCueFitMs ?? null)}
            {' · '}CPU rhythm fallback {seconds(latestRun.timing.averageIncomingFallbackMs ?? null)} on {latestRun.timing.incomingFallbackJobs ?? 0} tracks
          </p> : null}
          {activityRun && <p className="border border-ink/25 px-3 py-2 text-sm text-muted" role="status">
            {activityRun.waitingReason === 'pick-time' ? 'Waiting for Pick Time to finish'
              : activityRun.waitingReason === 'automatic-preparation' ? 'Prioritising preparation for a track in the live rotation' : 'Preparing'}
            {activityRun.airplay ? ' automatically' : activityRun.scope === 'library-selected' ? ' selected tracks' : ' library'}
            {activityRun.counts && activityRun.total != null && ` · ${activityRun.counts.complete + activityRun.counts.failed + activityRun.counts.sourceChanged} of ${activityRun.total} tracks done`}
            {activityRun.currentJob && ` · ${activityRun.waitingReason ? 'Next' : 'Now'}: ${activityRun.currentJob.title}${activityRun.currentJob.artist ? ` — ${activityRun.currentJob.artist}` : ''}${activityRun.currentJob.stage ? ` · ${prepStageLabels[activityRun.currentJob.stage]}` : ''}`}
          </p>}
          {!latestRun && !runs.isPending && <p className="text-sm text-muted">No library preparation run yet. Tracks can also prepare automatically as they play.</p>}
          {runs.isError && <p className="text-sm text-destructive" role="alert">Preparation status is unavailable.</p>}
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-10" disabled={busy || runs.isLoading} onClick={() => void startPrep('missing')}>Run missing</Button>
            <Button variant="outline" className="min-h-10" disabled={busy || runs.isLoading || !latestRun} onClick={() => void startPrep('refresh')}>Re-scan</Button>
            {latestRun?.status === 'running' && <Button variant="outline" className="min-h-10" disabled={busy} onClick={() => void updateRun(latestRun, 'pause')}>Pause</Button>}
            {latestRun?.status === 'paused' && <Button variant="outline" className="min-h-10" disabled={busy} onClick={() => void updateRun(latestRun, 'start')}>Resume</Button>}
            {latestRun && (latestRun.status === 'failed' || failed > 0) && <Button variant="outline" className="min-h-10" disabled={busy} onClick={() => void updateRun(latestRun, 'retry-failed')}>Retry failed</Button>}
          </div>
          <StemBeatsCueReadyList tracks={candidates.data ?? []} loading={candidates.isPending} error={candidates.isError}
            scanDisabled={runs.data?.some(run => run.status === 'running' || !!run.waitingReason) === true}
            adminFetch={adminFetch} onRunsChanged={() => Promise.all([runs.refetch(), candidates.refetch()])} />
        </>}
        {!beatsEnabled && <p className="text-sm text-muted">Turn on Stem Beats in <Link className="underline underline-offset-4" href={settingsUrl}>Stems settings</Link> to prepare the library.</p>}
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      </section>
      {!blendsEnabled && <p className="text-sm text-muted">Stem Blend is off. Both features can be changed in <Link className="underline underline-offset-4" href={settingsUrl}>Stems settings</Link>.</p>}
      <section className="grid gap-2 border border-ink/30 p-4" aria-labelledby="stem-extraction-times">
        <div><h2 id="stem-extraction-times" className="font-display text-lg font-bold">Pick-time extraction</h2>
          <p className="text-xs text-muted">Average separation time per completed extraction pair, using up to 100 recent samples. Source acquisition and rendering are separate; Stem Beats sizes use measured bar coverage.</p></div>
        {extractionMetrics.isLoading && <p className="text-sm text-muted">Loading extraction timings…</p>}
        {extractionMetrics.isError && <p className="text-sm text-destructive" role="alert">Extraction timings are unavailable.</p>}
        {extractionMetrics.data && <ul className="grid gap-1">{extractionMetrics.data.map(summary => <li key={summary.mode} className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold">{extractionModeLabels[summary.mode]}</span>
          <span className="text-muted">{summary.samples ? `${summary.samples} pair${summary.samples === 1 ? '' : 's'}` : 'No samples yet'}</span>
          {summary.samples > 0 && <span className="text-muted"> · {summary.averageOutgoingBars.toFixed(1)} → {summary.averageIncomingBars.toFixed(1)} bars · separation {seconds(summary.averageExtractionMs)} · source {seconds(summary.averageSourceAcquisitionMs)} · render {seconds(summary.averageRenderMs)}</span>}
        </li>)}</ul>}
      </section>
    </div>}
  </div>;
}

function FeatureLine({ icon: Icon, title, description, status, iconState = 'unknown' }: {
  icon: LucideIcon;
  title: string;
  description: string;
  status?: string;
  iconState?: MixingDeskStatus;
}) {
  return <div className="flex min-w-0 items-center gap-3 border-t border-ink/30 pt-3">
    <MixingDeskStatusIcon icon={Icon} label={`${title}: ${status ?? 'available'}`} state={iconState} />
    <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      <p className="text-xs text-muted">{description}</p>
    </div>
    {status && <span className="text-xs text-muted">{status}</span>}
  </div>;
}
