'use client';

import { adminResponse, useAdminQuery, type AdminFetch } from '../../../lib/admin-query';
import { stemEnvelopePeaks, stemVolumes, waveformKeys, type StemName, type StemTransition } from './stem-preview';

type Props = {
  stem: StemName; transition: StemTransition; adminFetch: AdminFetch;
  markers: { at: number; label: string }[]; styles: Record<string, string>;
};

function useSourceWaveform(transition: StemTransition, stem: StemName,
  side: 'outgoing' | 'incoming', adminFetch: AdminFetch) {
  return useAdminQuery<number[]>({
    key: [...waveformKeys.stems(transition), stem, side], adminFetch,
    enabled: !!transition.outgoingId && !!transition.incomingId,
    staleTime: Infinity,
    request: async (fetcher, signal) => {
      const response = await adminResponse(fetcher,
        `/now-playing/stem-waveform-peaks?side=${side}&stem=${stem}&outgoingId=${encodeURIComponent(transition.outgoingId!)}`,
        undefined, signal);
      const envelope = await response.json() as { peaks: number[]; startSec: number; storageGain: number };
      signal.throwIfAborted();
      return stemEnvelopePeaks(envelope, transition, side, 240, stem);
    },
  });
}

/** Each source owns its timeout/cache: one slow stem cannot hide the other seven. */
export function StemWaveformRow({ stem, transition, adminFetch, markers, styles }: Props) {
  const outgoing = useSourceWaveform(transition, stem, 'outgoing', adminFetch);
  const incoming = useSourceWaveform(transition, stem, 'incoming', adminFetch);
  const maximum = Math.max(...(outgoing.data ?? []), ...(incoming.data ?? []), 0);
  const duration = transition.durationSec;
  const headroom = Math.max(1, 10 ** ((transition.gainsDb?.[0] ?? transition.outgoingGainDb ?? 0) / 20),
    10 ** ((transition.gainsDb?.[1] ?? transition.incomingGainDb ?? 0) / 20));
  const waveform = (values: number[] | undefined, y: number, side: 'outgoing' | 'incoming') => values && <path
    className={side === 'outgoing' ? styles.outgoingWave : styles.incomingWave}
    d={values.map((value, index) => {
      const x = (index + .5) / values.length * 1000;
      const volume = stemVolumes(transition, stem, (index + .5) / values.length * duration)[side];
      const amplitude = maximum > 0 ? Math.sqrt(value / maximum) * 15 * volume / headroom : 0;
      return amplitude > 0 ? `M${x},${y - amplitude}v${2 * amplitude}` : '';
    }).join(' ')} fill="none" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />;
  const failed = [outgoing.isError && 'outgoing', incoming.isError && 'incoming'].filter(Boolean).join(' and ');
  return <div className={styles.stemDetailRow}>
    <div className={styles.stemDetailName}>{stem}</div>
    <div className={styles.stemDetailChart}>
      <svg viewBox="0 0 1000 76" preserveAspectRatio="none" role="img"
        aria-label={`${stem}: outgoing above, incoming below; height follows predicted volume, not a live meter`}>
        <line x1="0" x2="1000" y1="19" y2="19" className={styles.chartRule} />
        <line x1="0" x2="1000" y1="57" y2="57" className={styles.chartRule} />
        {waveform(outgoing.data, 19, 'outgoing')}
        {waveform(incoming.data, 57, 'incoming')}
        {markers.filter(stage => stage.at > 0 && stage.at < duration).map((stage, index) =>
          <line key={`${stage.at}-${index}`} x1={stage.at / duration * 1000} x2={stage.at / duration * 1000}
            y1="0" y2="76" className={styles.chartMarker} />)}
      </svg>
      <div className={styles.stemLivePlayhead} aria-hidden="true" />
      {(outgoing.isPending || incoming.isPending || outgoing.isFetching || incoming.isFetching) &&
        <p className={styles.expandedStatus} role="status">Loading {stem} waveforms…</p>}
      {failed && <p className={styles.expandedStatus} role="status">Could not load {failed} {stem} waveform.{' '}
        <button type="button" disabled={outgoing.isFetching || incoming.isFetching} onClick={() => {
          if (outgoing.isError) void outgoing.refetch();
          if (incoming.isError) void incoming.refetch();
        }}>Retry</button></p>}
    </div>
  </div>;
}
