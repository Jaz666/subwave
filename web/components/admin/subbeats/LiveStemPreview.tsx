'use client';

import { useEffect, useRef } from 'react';
import { type AdminFetch } from '../../../lib/admin-query';
import { STEM_NAMES, type StemTransition } from './stem-preview';
import { StemWaveformRow } from './StemWaveformRow';
import styles from './NowPlayingWaveform.module.css';

export function LiveStemPreview({transition, startAt, nowMs, adminFetch, colors, outgoing, incoming}: {
  transition: StemTransition; startAt: number | null; nowMs: number; adminFetch: AdminFetch;
  colors: {current:string;next:string}; outgoing: string; incoming: string;
}) {
  const chart = useRef<HTMLDivElement>(null);
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
      {STEM_NAMES.map(stem => <StemWaveformRow key={stem} stem={stem} transition={transition}
        adminFetch={adminFetch} markers={markers} styles={styles} />)}
    </div>

  </div>;
}
