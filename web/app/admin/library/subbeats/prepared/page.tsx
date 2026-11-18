import type { Metadata } from 'next';
import SubbeatsPanel from '../../../../../components/admin/SubbeatsPanel';

export const metadata: Metadata = { title: 'Prepared tracks · Sub/Beats' };

export default function SubbeatsPage() { return <SubbeatsPanel page="prepared" />; }
