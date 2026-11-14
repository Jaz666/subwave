import type { Metadata } from 'next';
import SubbeatsPanel from '../../../../../components/admin/SubbeatsPanel';

export const metadata: Metadata = { title: 'Playlist Export · Sub/Beats' };

export default function SubbeatsPlaylistExportPage() { return <SubbeatsPanel page="playlist-export" />; }
