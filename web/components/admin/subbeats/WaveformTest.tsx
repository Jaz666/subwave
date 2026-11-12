'use client';

import MixingDesk from './wavesurfer-test/MixingDesk';

export default function WaveformTest() {
  return <main className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6">
    <header>
      <p className="text-[10px] font-bold tracking-[0.2em] text-muted uppercase">Sub/Beats · experiment</p>
      <h1 className="mt-2 font-display text-3xl font-bold">WaveSurfer Mixing Desk test</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">A separate Mixing Desk copy for performance experiments. The controller builds compact waveform outlines on first use, then reuses them from a small memory cache.</p>
    </header>
    <MixingDesk />
  </main>;
}
