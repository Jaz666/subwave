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
      <Card title="Track selection" sub={`${form.picker.shortlistPasses} source pass${form.picker.shortlistPasses === 1 ? '' : 'es'}`}>
        <div className="field">
          <Label>Track Shortlist passes</Label>
          <Seg
            value={String(form.picker.shortlistPasses)}
            options={[
              { id: '1', label: '1', title: 'Context only — the narrowest shortlist' },
              { id: '2', label: '2', title: 'Context and Continuity — no Exploration pass' },
              { id: '3', label: '3', title: 'Default: Context, Continuity, then Exploration' },
              { id: '4', label: '4', title: 'Repeats Context after the complete three-lane cycle' },
              { id: '5', label: '5', title: 'Repeats Context and Continuity for the broadest shortlist' },
            ]}
            onChange={v => setForm(f => ({ ...f, picker: { ...f.picker, shortlistPasses: Number(v) } }))}
          />
          <p className="mt-2 text-[13px] leading-[1.55] text-muted">
            Three passes are the default: <strong>Context</strong> grounds the show or journey, <strong>Continuity</strong> follows the track on air, and <strong>Exploration</strong> reaches beyond the familiar. Two passes omit Exploration; one uses Context only, for a deliberately narrow shortlist. Four and five repeat Context then Continuity, widening the candidate set and final DJ selection prompt. This does not change Agentic Segment tools.
          </p>
        </div>
      </Card>
      <SaveBar busy={busy} onSave={save} saveLabel="Save DJ behaviour" errors={fieldErrors} ownedKeys={['picker']} />
    </>
  );
}
