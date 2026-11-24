'use client';

import { useState } from 'react';
import { useAdminAuth } from '../../lib/adminAuth';
import { adminJson, useAdminQuery } from '../../lib/admin-query';
import { Button } from '../ui/button';
import { settingsKeys } from './settings/queries';
import type { SettingsResponse } from './library/types';

type RunProgress = {
  runId: string; createdAt: string; status: 'queued' | 'running' | 'complete' | 'paused' | 'failed';
  scope?: string; algorithmVersion: number; total: number; active?: boolean;
  counts: { queued: number; running: number; complete: number; failed: number; sourceChanged: number; incomingReady: number; outgoingReady: number };
  timing: { completedJobs: number; averagePrepMs: number | null; totalPrepMs: number };
};
const runKey = ['library', 'stembeats', 'runs'] as const;
const progressKey = (id: string | null) => ['library', 'stembeats', 'progress', id] as const;
const stateLabel: Record<RunProgress['status'], string> = {
  queued: 'Ready to start', running: 'Preparing', complete: 'Complete', paused: 'Paused', failed: 'Stopped with errors',
};
const scopeLabel: Record<string, string> = {
  library: 'Library analysis', track: 'One track', supported: 'V1 comparison', selected: 'Selected V1 comparison',
};

export default function StemBeatsPreparation() {
  const { adminFetch, hydrated, needsAuth } = useAdminAuth();
  const ready = hydrated && !needsAuth;
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const settings = useAdminQuery<SettingsResponse>({ key: settingsKeys.detail(), adminFetch, enabled: ready, refetchInterval: 3_000,
    request: (fetcher, signal) => adminJson(fetcher, '/settings', undefined, signal), toastOnError: false });
  const transitions = settings.data?.values?.transitions;
  const newStyleEnabled = transitions?.stemsEnabled !== false && transitions?.stemsStyle === 'new-style';
  const runs = useAdminQuery({ key: runKey, adminFetch, enabled: ready && newStyleEnabled,
    request: async (fetcher, signal) => (await adminJson<{ runs: RunProgress[] }>(fetcher, '/library/subbeats/prep-v2/runs', undefined, signal)).runs });
  const progress = useAdminQuery({ key: progressKey(selectedRun), adminFetch, enabled: ready && newStyleEnabled && !!selectedRun,
    refetchInterval: 3000,
    request: (fetcher, signal) => adminJson<RunProgress>(fetcher, `/library/subbeats/prep-v2/runs/${selectedRun}/progress`, undefined, signal) });
  const refresh = () => runs.refetch();

  const createAndStart = async () => {
    setBusy(true); setMessage('');
    try {
      const created = await adminJson<RunProgress & { runId: string }>(adminFetch, '/library/subbeats/prep-v2/runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'library' }),
      });
      setSelectedRun(created.runId);
      await adminJson(adminFetch, `/library/subbeats/prep-v2/runs/${created.runId}/start`, { method: 'POST' });
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Stem Beats preparation could not start.'); }
    finally { setBusy(false); }
  };

  const runAction = async (run: RunProgress, action: 'start' | 'pause' | 'retry-failed') => {
    setBusy(true); setMessage('');
    try {
      const path = `/library/subbeats/prep-v2/runs/${run.runId}/${action}`;
      const init = action === 'pause'
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused: true }) }
        : { method: 'POST' };
      await adminJson(adminFetch, path, init);
      setSelectedRun(run.runId);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The run could not be updated.'); }
    finally { setBusy(false); }
  };

  if (!ready || settings.isPending) return null;
  if (!newStyleEnabled) return <div className="mx-auto max-w-xl p-6 text-sm text-muted">
    This page is available when Stems is enabled in New Style. <a className="underline" href="/admin/library">Return to Library</a>.
  </div>;

  const allRuns = runs.data ?? [];
  const active = progress.data;
  return <div className="grid min-w-0 gap-5">
    <header className="max-w-3xl">
      <p className="text-xs font-bold tracking-[0.2em] text-muted uppercase">Stem preparation</p>
      <h1 className="mt-1 font-display text-3xl font-bold text-ink">Stem Beats</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">Prepare beat-matched transition cues for the first time. A library run checks the current Dance Candidates; it does not need or change the older Sub/Beats preparation list. The intended single-track path queues cue preparation from airplay; a later matching pick can then prepare the needed stems.</p>
    </header>

    <section className="grid gap-4 border border-ink p-4" aria-label="Start Stem Beats preparation">
      <div>
        <h2 className="font-display text-xl font-bold">Prepare the library</h2>
        <p className="mt-2 max-w-prose text-sm text-muted">Analyze tracks in the dance family between 90 and 180 BPM. This can take time; the run can be paused and resumed.</p>
        <Button className="mt-4 min-h-11" disabled={!ready || busy} onClick={() => void createAndStart()}>Start library analysis</Button>
      </div>
    </section>

    {message && <p className="text-sm" role="status">{message}</p>}
    <section className="grid gap-3" aria-labelledby="stembeats-runs">
      <div className="flex items-center justify-between gap-3"><h2 id="stembeats-runs" className="font-display text-xl font-bold">Preparation runs</h2><Button disabled={runs.isFetching} onClick={() => void refresh()}>Refresh</Button></div>
      {runs.isLoading && <p className="text-sm text-muted">Loading preparation runs…</p>}
      {!allRuns.length && !runs.isLoading && <p className="text-sm text-muted">No Stem Beats runs yet.</p>}
      {allRuns.map(run => <article key={run.runId} className="grid gap-3 border border-ink p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <button type="button" className="text-left" onClick={() => setSelectedRun(run.runId)} aria-pressed={selectedRun === run.runId}>
          <span className="block font-semibold">{(run.scope && scopeLabel[run.scope]) || 'Earlier V2 run'} · {stateLabel[run.status]}</span>
          <span className="mt-1 block text-sm text-muted">{run.counts.complete.toLocaleString()} / {run.total.toLocaleString()} complete · {run.counts.failed + run.counts.sourceChanged} need attention · {new Date(run.createdAt).toLocaleString()}</span>
          <span className="mt-1 block text-xs text-muted">Cue-ready: {run.counts.incomingReady.toLocaleString()} incoming · {run.counts.outgoingReady.toLocaleString()} outgoing · mean {run.timing.averagePrepMs == null ? '—' : `${(run.timing.averagePrepMs / 1000).toFixed(1)}s`}</span>
        </button>
        <div className="flex flex-wrap gap-2">
          {(run.status === 'queued' || run.status === 'paused') && <Button disabled={busy} onClick={() => void runAction(run, 'start')}>Resume</Button>}
          {run.status === 'running' && <Button disabled={busy} onClick={() => void runAction(run, 'pause')}>Pause</Button>}
          {(run.status === 'failed' || run.counts.failed > 0) && <Button disabled={busy} onClick={() => void runAction(run, 'retry-failed')}>Retry failed</Button>}
        </div>
      </article>)}
    </section>
    {active && <p className="text-xs text-muted" role="status">Selected run is {active.active ? 'running' : stateLabel[active.status].toLowerCase()}.</p>}
  </div>;
}
