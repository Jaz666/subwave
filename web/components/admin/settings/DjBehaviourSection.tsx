'use client';

import { Label } from '../../ui/label';
import { Card, Seg } from '../ui';
import { SectionHeader, SaveBar, type SectionProps } from './shared';

/** Policy controls for native selection and future DJ conduct settings. */
export function DjBehaviourSection({ form, setForm, busy, saveSettings, fieldErrors }: SectionProps) {
  const save = async () => saveSettings({ picker: { shortlistPasses: form.picker.shortlistPasses } });

  return (
    <>
      <SectionHeader eyebrow="dj behaviour" title="Decide how the DJ selects tracks." sub="Selection policy belongs here; model and voice configuration stay in their own sections." />
      <Card title="Track selection" sub={form.picker.shortlistPasses ? `${form.picker.shortlistPasses} source passes` : 'automatic'}>
        <div className="field">
          <Label>Track Shortlist passes</Label>
          <Seg
            value={String(form.picker.shortlistPasses)}
            options={[
              { id: '0', label: 'Automatic', title: 'Use the existing provider and backup-compatible budget' },
              { id: '1', label: '1', title: 'One candidate-source pass' },
              { id: '2', label: '2', title: 'Two candidate-source passes' },
              { id: '3', label: '3', title: 'Three candidate-source passes' },
              { id: '4', label: '4', title: 'Four candidate-source passes' },
              { id: '5', label: '5', title: 'Five candidate-source passes' },
            ]}
            onChange={v => setForm(f => ({ ...f, picker: { ...f.picker, shortlistPasses: Number(v) } }))}
          />
          <p className="mt-2 text-[13px] leading-[1.55] text-muted">
            Each pass runs one controller-native candidate source. More passes widen the Track Shortlist and can improve variety, but increase the final DJ selection prompt. Automatic preserves the station&apos;s existing compatible budget. This does not change Agentic Segment tools.
          </p>
        </div>
      </Card>
      <SaveBar busy={busy} onSave={save} saveLabel="Save DJ behaviour" errors={fieldErrors} ownedKeys={['picker']} />
    </>
  );
}
