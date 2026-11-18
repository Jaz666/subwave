import type { Metadata } from 'next';
import WaveformTest from '../../../../../components/admin/subbeats/WaveformTest';

export const metadata: Metadata = { title: 'WaveSurfer test · Sub/Beats' };

export default function WaveSurferTestPage() { return <WaveformTest />; }
