'use client';

import { useAdminAuth } from '../../lib/adminAuth';
import { adminJson, useAdminQuery } from '../../lib/admin-query';
import { regularStemStatusSchema, type RegularStemStatus } from '../../lib/schemas.generated';
import { Card } from './ui';

const stateLabels = {
  pending: 'Waiting', running: 'Processing', ready: 'Prepared',
  failed: 'Unavailable', absent: 'Deadline passed',
} as const;

export function RegularStemStatusView({ data, error = false }: {
  data?: RegularStemStatus; error?: boolean;
}) {
  return <Card title="Regular Stem Blend preparation">
    {error ? <p role="status">Preparation status is unavailable. Transition readiness is unknown.</p>
      : !data ? <p role="status">Loading preparation status…</p>
        : !data.audition ? <p>The new preparation method is not enabled for audition pairs. Existing stem settings still apply.</p>
          : <>
            <p>{data.workingCache ? 'Regular Stem Blends use CPU preparation:' : 'Audition pairs use CPU preparation:'} outgoing tails first, incoming heads only for an eligible pairing.
              The working cache keeps the current track and up to eight queued tracks. Existing stem files are retained.</p>
            <p className="field-hint">These are live preparation results. Prepared stems do not mean a transition is armed;
              pair checks and rendering still have to succeed.{' '}
              {data.workingCache ? 'Legacy pick-time caching, regular library stem filling and automatic cache deletion are on hold. Saved values and existing files are retained. Sub/Beats preparation still uses its saved cache and byte budget.'
                : 'Other tracks still use the existing stem settings.'}</p>
            {data.windows.length === 0 ? <p role="status">No current queue preparation requests. Earlier work may still be finishing; this does not establish whether a track is suitable.</p>
              : <dl aria-label="Current queue preparation windows" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(Object.keys(stateLabels) as Array<keyof typeof stateLabels>).map(state => <div key={state}>
                  <dt>{stateLabels[state]}</dt>
                  <dd>{data.windows.filter(window => window.state === state).length}</dd>
                </div>)}
              </dl>}
          </>}
  </Card>;
}

export function useRegularStemStatus(enabled = true) {
  const { adminFetch, needsAuth, hydrated } = useAdminAuth();
  return useAdminQuery<RegularStemStatus>({
    key: ['stems', 'regular', 'status'], adminFetch,
    enabled: enabled && hydrated && !needsAuth, refetchInterval: 5000, toastOnError: false,
    request: async (fetcher, signal) => regularStemStatusSchema.parse(
      await adminJson<unknown>(fetcher, '/stems/regular/status', undefined, signal)),
  });
}
