'use client';

import Link from 'next/link';
import { useState } from 'react';
import { V3AlertDialog } from '../../ui/alert-dialog';
import { adminJson, useAdminMutation, useAdminQuery } from '../../../lib/admin-query';
import { fmtSize } from '../../../lib/format';
import { useAdminAuth } from '../../../lib/adminAuth';
import { subbeatsCacheViewSchema, subbeatsCleanupStateSchema, subbeatsStemPolicySchema, type subbeatsStemPolicyPatchSchema } from '../../../lib/schemas.generated';
import type { z } from 'zod';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';

const cleanupKey = ['library', 'subbeats', 'cleanup'] as const;
const cacheKey = ['library', 'subbeats', 'cache'] as const;
export function useSubbeatsCache() {
  const { adminFetch, hydrated, needsAuth } = useAdminAuth();
  const query = useAdminQuery({ key: cacheKey, adminFetch, enabled: hydrated && !needsAuth, refetchInterval: 30000,
    request: async (fetcher, signal) => subbeatsCacheViewSchema.parse(await adminJson(fetcher, '/library/subbeats/cache', undefined, signal)),
  });
  const update = useAdminMutation({ adminFetch,
    request: async (patch: z.infer<typeof subbeatsStemPolicyPatchSchema>, fetcher) => subbeatsStemPolicySchema.parse(await adminJson(fetcher, '/library/subbeats/cache', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })),
    onDone: async (policy, _patch, client) => {
      await client.cancelQueries({ queryKey: cacheKey, exact: true });
      client.setQueryData<z.infer<typeof subbeatsCacheViewSchema>>(cacheKey, previous => previous && ({ ...previous, policy }));
      await client.invalidateQueries({ queryKey: cacheKey, exact: true });
      await client.invalidateQueries({ queryKey: cleanupKey, exact: true });
    },
  });
  return { query, update };
}
const space = (bytes: number) => bytes < 1024 ** 3 ? fmtSize(bytes) : `${(bytes / 1024 ** 3).toLocaleString(undefined, { maximumFractionDigits: 1 })} GiB`;
function SpaceBar({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = Math.min(100, Math.max(0, total > 0 ? value / total * 100 : 0));
  return <svg viewBox="0 0 100 4" preserveAspectRatio="none" role="meter" aria-label={label}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${space(value)} of ${space(total)}`}
    className="mt-3 h-4 w-full border border-ink bg-ink-soft text-ink">
    <rect width={percent} height={4} fill="currentColor" />
  </svg>;
}
export function SubbeatsCache({ cache }: { cache: ReturnType<typeof useSubbeatsCache> }) {
  const { query, update } = cache;
  const data = query.data;
  const [confirm, setConfirm] = useState(false);
  const { adminFetch, hydrated, needsAuth } = useAdminAuth();
  const cleanup = useAdminQuery({key:cleanupKey, adminFetch, enabled:hydrated && !needsAuth, refetchInterval:2000,
    request:async (fetcher, signal) => subbeatsCleanupStateSchema.parse(await adminJson(fetcher, '/library/subbeats/cache/cleanup', undefined, signal)),
  });
  const action = useAdminMutation({adminFetch,
    request:async (kind: 'estimate' | 'cleanup', fetcher) => subbeatsCleanupStateSchema.parse(await adminJson(fetcher, `/library/subbeats/cache/${kind}`, {method:'POST'})),
    onDone:async (state, _kind, client) => {
      await client.cancelQueries({queryKey:cleanupKey,exact:true});
      client.setQueryData(cleanupKey,state);
    },
  });
  const estimate = cleanup.data?.estimate;
  const busy = !!cleanup.data?.busy || action.isPending;
  const canEnable = !!estimate && !busy && !cleanup.data?.error && !cleanup.isError && !action.isError;
  return <section className="min-w-0 border border-ink p-4 sm:p-6" aria-labelledby="subbeats-cache-heading">
    <h2 id="subbeats-cache-heading" className="font-display text-xl font-bold">Stem cache</h2>
    {query.isLoading && <p role="status" className="mt-3 text-sm text-muted">Loading cache details…</p>}
    {query.isError && <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 text-sm">Could not read cache details. Saved choices have been kept.<Button className="min-h-11" onClick={() => void query.refetch()}>Retry</Button></div>}
    {data && <>
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div><h3 className="text-sm font-semibold">Regular stems · cache budget</h3>
          {data.usage ? <><p className="mt-2 text-sm tabular-nums">{space(data.usage.bytes)} used of {space(data.budgetBytes)} · {data.usage.dirs.toLocaleString()} tracks</p>
            <SpaceBar label="Regular stems against cache budget" value={data.usage.bytes} total={data.budgetBytes} />
            <p className="mt-2 text-xs leading-relaxed text-muted">Measured {new Date(data.usage.measuredAt).toLocaleString()}.{!data.usage.fresh && ' This estimate may be out of date.'}{data.usage.passRunning && ' Analysis is adding stems.'}</p>
            {data.usage.bytes > data.budgetBytes && <p className="mt-2 text-sm">Over budget by {space(data.usage.bytes - data.budgetBytes)}. The ordinary cache sweep removes lower-priority entries.</p>}
          </> : <p className="mt-2 text-sm text-muted">Usage has not been measured yet. The next analysis or cache sweep will update it. Budget: {space(data.budgetBytes)}.</p>}
          <p className="mt-2 text-xs leading-relaxed text-muted">Quarantined folders are outside this budget and still occupy disk space.</p>
        </div>
        <div><h3 className="text-sm font-semibold">Available on the stem-cache disk</h3>
          {data.disk ? <><p className="mt-2 text-sm tabular-nums">{space(data.disk.available)} available of {space(data.disk.total)}</p>
            <SpaceBar label="Available disk space" value={data.disk.available} total={data.disk.total} />
            <p className="mt-2 text-xs leading-relaxed text-muted">Shared with everything else on this disk, including quarantine.</p>
          </> : <p className="mt-2 text-sm text-muted">Disk space is unavailable. Check that the stem-cache disk is connected.</p>}
          <p className="mt-3 text-xs leading-relaxed text-muted">Extended Sub/Beats stems currently use a separate 5 GiB cache. Its usage is not included in the regular-stem measurement.</p>
        </div>
      </div>
      <div className="mt-6 border-t border-ink/20 pt-5">
        <h3 className="text-sm font-semibold">Free space for Stem Blends</h3>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">Enabling this marks cached tracks outside the Stem Blend criteria for deletion. Played or starred tracks are protected from this cleanup, along with prepared Sub/Beats tracks and your manual inclusions. Other tracks need a dance-related genre, 90–180 BPM and a measured bar grid.</p>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">After confirmation, unsuitable folders move into a seven-day quarantine. Disk space is freed only when that period ends and the folders are deleted. The same criteria apply to future automatic stem caching.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button className="min-h-11" disabled={busy || update.isPending} onClick={() => action.mutate('estimate')}>Calculate reclaimable space</Button>
          {data.policy.cleanupEnabled && <Button className="min-h-11" disabled={busy || update.isPending} onClick={() => action.mutate('cleanup')}>Run cleanup now</Button>}
        </div>
        {busy && <p role="status" className="mt-3 text-sm">{cleanup.data?.busy === 'cleanup' ? 'Updating quarantine and cleaning up expired folders…' : 'Checking cached folders… this can take several minutes.'}</p>}
        {estimate && <div className="mt-3 text-sm" role="status">
          <p className="font-semibold tabular-nums">{estimate.folders.toLocaleString()} {estimate.folders === 1 ? 'folder' : 'folders'} · about {space(estimate.bytes)} reclaimable after quarantine</p>
          <p className="mt-1 text-xs text-muted">Measured {new Date(estimate.measuredAt).toLocaleString()}. Already quarantined folders are excluded.{estimate.skipped > 0 && ` ${estimate.skipped.toLocaleString()} recently written folders skipped.`}</p>
        </div>}
        {cleanup.data?.report && !busy && <p role="status" className="mt-3 text-sm tabular-nums">Last cleanup: {cleanup.data.report.quarantined.toLocaleString()} folders quarantined · {cleanup.data.report.released.length.toLocaleString()} restored · {cleanup.data.report.deletedCount.toLocaleString()} expired folders deleted · {space(cleanup.data.report.freedBytes)} freed.{cleanup.data.report.failed > 0 && ` ${cleanup.data.report.failed.toLocaleString()} folders could not be processed; check cache permissions.`}</p>}
        {(cleanup.isError || action.isError || cleanup.data?.error) && <p role="alert" className="mt-3 text-sm">{cleanup.data?.error ?? 'Could not check cleanup progress. Retry shortly.'}</p>}
        {!estimate && !data.policy.cleanupEnabled && !busy && <p className="mt-3 text-sm text-muted">Calculate the folder count and space before enabling cleanup.</p>}
        <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
          <Checkbox checked={data.policy.cleanupEnabled} disabled={query.isError || update.isPending || (!data.policy.cleanupEnabled && !canEnable)}
            onCheckedChange={checked => checked === true ? setConfirm(true) : update.mutate({enabled:false})} />
          Free space by removing unsuitable stems
        </label>
        {data.policy.enabled && !data.policy.cleanupEnabled && <p className="mt-2 text-sm">Selective caching is already on. Deletion has not been authorised; confirm cleanup separately.</p>}
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">Cleanup is off by default. Turning it off stops further cleanup and restores quarantined folders where possible. Played/starred protection applies to this cleanup; the normal cache-budget eviction rule still applies.</p>
        <p className="mt-3 text-sm">{data.policy.regularIds.length.toLocaleString()} manual inclusions. In Explore, choose Entire library and mark “Include in regular stem caching” on any track.</p>
        <div className="mt-3 flex flex-wrap gap-x-6"><Link href="/admin/library/subbeats?scope=library" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Choose tracks</Link>
          <Link href="/admin/settings?section=stems" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Cache budget and orphan cleanup</Link></div>
        {update.isError && <p role="alert" className="mt-3 text-sm">Could not save. Your previous choice is still shown. Try again.</p>}
      </div>
    </>}
    <V3AlertDialog open={confirm} onOpenChange={setConfirm} title="Enable stem cleanup?"
      description={estimate ? `Mark ${estimate.folders.toLocaleString()} ${estimate.folders === 1 ? 'folder' : 'folders'} (about ${space(estimate.bytes)}) for deletion. Quarantine starts now; disk space is reclaimed after seven days. Played, starred, prepared and manually included tracks are protected from this cleanup.` : 'Calculate reclaimable space before enabling cleanup.'}
      confirmLabel="Enable and quarantine" danger
      onConfirm={() => { if (canEnable) update.mutate({enabled:true,confirmCleanup:true}); }} />
  </section>;
}
