import type { z } from 'zod';
import type { subbeatsSuitabilitySchema } from '../../../lib/schemas.generated';

type Suitability = z.infer<typeof subbeatsSuitabilitySchema>;
export const MIX_LABEL = { unassessed: 'Not assessed', regular: 'Regular transitions only', beat: 'Basic beat matching', subbeat: 'Sub/Beat · stems + beat matching' };
export function mixingLevel(value?: Suitability): keyof typeof MIX_LABEL {
  if (!value) return 'unassessed';
  const levels = [value.incoming.level, value.outgoing.level];
  return levels.includes('subbeat') ? 'subbeat' : levels.includes('beat') ? 'beat' : 'regular';
}
export function SuitabilityDetails({ value }: { value?: Suitability }) {
  if (!value) return <p className="mt-2 text-xs text-muted">Mixing suitability: Not assessed</p>;
  return <details className="mt-2 text-xs lg:col-span-3">
    <summary className="min-h-11 cursor-pointer py-3">{MIX_LABEL[mixingLevel(value)]} · show incoming/outgoing evidence</summary>
    {(['incoming', 'outgoing'] as const).map(role => <p key={role} className="mb-2 max-w-prose leading-relaxed break-words">
      <strong>{role === 'incoming' ? 'Incoming' : 'Outgoing'}: {MIX_LABEL[value[role].level]}</strong>
      {value[role].bpm !== null && ` · ${value[role].bpm.toFixed(1)} BPM`}. {value[role].reason}
    </p>)}
  </details>;
}
