'use client';

import { useEffect, useRef } from 'react';
import { adminResponse, useAdminQuery, type AdminFetch } from '../../../lib/admin-query';
import { STEM_NAMES, stemEnvelopePeaks, stemVolumes, waveformKeys, type StemLanes, type StemTransition } from './stem-preview';
import styles from './NowPlayingWaveform.module.css';

export function LiveStemPreview({transition, startAt, nowMs, adminFetch, colors, outgoing, incoming}: {
  transition: StemTransition; startAt: number | null; nowMs: number; adminFetch: AdminFetch;
  colors: {current:string;next:string}; outgoing: string; incoming: string;
}) {
  const chart = useRef<HTMLDivElement>(null);
  const query = useAdminQuery<StemLanes>({
    key:waveformKeys.stems(transition),adminFetch,
    enabled:!!transition.outgoingId && !!transition.incomingId,
    staleTime:Infinity,
    request:async (fetcher,signal) => {
      const lanes = {} as StemLanes;
      for (const stem of STEM_NAMES) {
        const responses = await Promise.all([
          adminResponse(fetcher,`/now-playing/stem-waveform-peaks?side=outgoing&stem=${stem}&outgoingId=${encodeURIComponent(transition.outgoingId!)}`,undefined,signal),
          adminResponse(fetcher,`/now-playing/stem-waveform-peaks?side=incoming&stem=${stem}&outgoingId=${encodeURIComponent(transition.outgoingId!)}`,undefined,signal),
        ]);
        const [outgoing,incoming] = await Promise.all(responses.map(async (response,index) => {
          const envelope = await response.json() as { peaks:number[]; startSec:number; storageGain:number };
          signal.throwIfAborted();
          return stemEnvelopePeaks(envelope,transition,index === 0 ? 'outgoing' : 'incoming',240,stem);
        }));
        lanes[stem] = {outgoing:outgoing!,incoming:incoming!};
      }
      return lanes;
    },
  });
  const duration = transition.durationSec;
  const markers = [{at:transition.incomingAtSec,label:'Incoming entry'},
    {at:transition.timing ? transition.timing.handoverFrame/transition.timing.sampleRate
      : (transition.incomingAtSec+transition.outgoingUntilSec)/2,label:'Handover'},
    {at:duration,label:'Complete'}];
  const position = startAt == null ? null : (nowMs-startAt)/1000;
  const active = position != null && position >= 0 && position < duration;
  useEffect(() => {
    if (startAt == null) return;
    let frame = 0;
    const tick = () => {
      chart.current?.style.setProperty('--stem-progress',`${Math.max(0,Math.min(100,(Date.now()-startAt)/1000/duration*100))}%`);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  },[startAt,duration]);

  const gain = (side: 'outgoing' | 'incoming') => {
    const db = transition.gainsDb?.[side === 'outgoing' ? 0 : 1]
      ?? (side === 'outgoing' ? transition.outgoingGainDb : transition.incomingGainDb);
    return db == null ? '' : ` · ${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
  };
  return <div className={styles.expandedLanes} ref={element => {
    element?.style.setProperty('--outgoing-color',colors.current);
    element?.style.setProperty('--incoming-color',colors.next);
  }}>
    <div className={styles.expandedLegend}>
      <span className={styles.outgoingLegend}>Outgoing: {outgoing}{gain('outgoing')}</span>
      <span className={styles.incomingLegend}>Incoming: {incoming}{gain('incoming')}</span>
      <span className={styles.expandedDuration}>{position == null ? '' : position < 0 ? 'Prepared · '
        : position >= duration ? 'Completed · ' : `${position.toFixed(0)}s / `}{duration.toFixed(1)}s</span>
    </div>
    <p className={styles.sourceNote}>Waveform height follows predicted mix volume and track gain. Detail boosted per stem · not a live level meter.
      {!transition.timing && ' Regular drum handover timing is estimated.'}</p>
    <div className={styles.stageLegend}>
      {markers.map(stage => <span key={stage.label}>{stage.at.toFixed(1)}s {stage.label}</span>)}
    </div>
    <div ref={chart} className={styles.expandedPlot} data-active={active}>
      <div className={styles.stemRuler} aria-label="Seconds from mix start">
        {[0,.25,.5,.75,1].map(fraction => <span key={fraction}>{(fraction*duration).toFixed(1)}s</span>)}
      </div>
      {STEM_NAMES.map(stem => {
        const data = query.data?.[stem];
        const maximum = data ? Math.max(...data.outgoing,...data.incoming) : 0;
        const headroom = Math.max(1,10**((transition.gainsDb?.[0] ?? transition.outgoingGainDb ?? 0)/20),
          10**((transition.gainsDb?.[1] ?? transition.incomingGainDb ?? 0)/20));
        const waveform = (values: number[], y: number, side: 'outgoing' | 'incoming') => <path
          className={side === 'outgoing' ? styles.outgoingWave : styles.incomingWave}
          d={values.map((value,index) => {
            const x = (index+.5)/values.length*1000;
            const volume = stemVolumes(transition,stem,(index+.5)/values.length*duration)[side];
            const amplitude = maximum > 0 ? Math.sqrt(value/maximum)*15*volume/headroom : 0;
            return amplitude > 0 ? `M${x},${y-amplitude}v${2*amplitude}` : '';
          }).join(' ')} fill="none" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />;
        return <div className={styles.stemDetailRow} key={stem}>
          <div className={styles.stemDetailName}>{stem}</div>
          <div className={styles.stemDetailChart}>
            <svg viewBox="0 0 1000 76" preserveAspectRatio="none" role="img" aria-label={`${stem}: outgoing above, incoming below; height follows predicted volume, not a live meter`}>
              <line x1="0" x2="1000" y1="19" y2="19" className={styles.chartRule} />
              <line x1="0" x2="1000" y1="57" y2="57" className={styles.chartRule} />
              {data && waveform(data.outgoing,19,'outgoing')}
              {data && waveform(data.incoming,57,'incoming')}
              {markers.filter(stage => stage.at > 0 && stage.at < duration).map((stage,index) =>
                <line key={`${stage.at}-${index}`} x1={stage.at/duration*1000} x2={stage.at/duration*1000}
                  y1="0" y2="76" className={styles.chartMarker} />)}
            </svg>
            <div className={styles.stemLivePlayhead} aria-hidden="true" />
          </div>
        </div>;
      })}
    </div>
    {query.isPending && <p className={styles.expandedStatus} role="status">Loading source waveforms…</p>}
    {query.isError && <p className={styles.expandedStatus} role="status">Could not load source waveforms. <button type="button" onClick={() => { void query.refetch(); }}>Retry</button></p>}
  </div>;
}
