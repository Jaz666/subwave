import type { z } from 'zod';
import type { subbeatsSuitabilitySchema } from '../../../lib/schemas.generated';

type Suitability = z.infer<typeof subbeatsSuitabilitySchema>;
export const MIX_LABEL = { unassessed: 'Not assessed', regular: 'Regular transition fallback', beat: 'Beat-grid support', subbeat: 'Sub/Beat support' };
const CUE_LABEL = { regular: 'No usable phrase cue for this role', beat: 'Beat grid available', subbeat: 'Phrase cue + vocal coverage available' };
const LEGACY_LABEL = { regular: 'No 16-bar beat window', beat: '16-bar beat window', subbeat: 'Legacy 16-bar stem window' };
export function mixingLevel(value?: Suitability): keyof typeof MIX_LABEL {
  if (!value) return 'unassessed';
  const levels = [value.incoming.level, value.outgoing.level];
  return levels.includes('subbeat') ? 'subbeat' : levels.includes('beat') ? 'beat' : 'regular';
}
export function SuitabilityDetails({ value, cueBased = false }: { value?: Suitability; cueBased?: boolean }) {
  if (!value) return <p className="mt-2 text-xs text-muted">Mixing suitability: Not assessed</p>;
  const level = mixingLevel(value);
  const detailLevel = level === 'unassessed' ? 'regular' : level;
  const labels = cueBased ? CUE_LABEL : LEGACY_LABEL;
  return <details className="mt-2 text-xs lg:col-span-3">
    <summary className="min-h-11 cursor-pointer py-3">{cueBased ? labels[detailLevel] : `Legacy 16-bar check · ${labels[detailLevel]}`} · show incoming/outgoing evidence</summary>
    {(['incoming', 'outgoing'] as const).map(role => <p key={role} className="mb-2 max-w-prose leading-relaxed break-words">
      <strong>{role === 'incoming' ? 'Incoming' : 'Outgoing'}: {labels[value[role].level]}</strong>
      {value[role].bpm !== null && ` · ${value[role].bpm.toFixed(1)} BPM`}. {value[role].reason}
    </p>)}
  </details>;
}
