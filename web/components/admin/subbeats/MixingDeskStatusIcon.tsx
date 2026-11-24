import { Check, Grid2X2, type LucideIcon } from 'lucide-react';

export type MixingDeskStatus = 'ready' | 'unavailable' | 'suitable' | 'verified' | 'unknown';

export function MixingDeskStatusIcon({ icon: Icon, label, state, grid = false }: {
  icon: LucideIcon;
  label: string;
  state: MixingDeskStatus;
  grid?: boolean;
}) {
  const active = state === 'ready' || state === 'suitable' || state === 'verified';
  return <span className={`relative inline-flex ${grid ? 'w-7' : 'w-5'} h-5 items-center justify-center ${active ? 'text-[var(--accent)]' : 'text-[var(--ink-faint)]'}`}
    role="img" aria-label={label} title={label}>
    {grid ? <><Grid2X2 size={14} strokeWidth={1.8} aria-hidden="true" /><Icon size={13} strokeWidth={1.8} aria-hidden="true" /></>
      : <Icon size={16} strokeWidth={1.8} aria-hidden="true" />}
    {state === 'verified' && <Check className="absolute -top-1 -right-1 rounded-full bg-[var(--card-bg)]" size={9} strokeWidth={3} aria-hidden="true" />}
  </span>;
}
