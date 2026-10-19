'use client';
import { useId } from 'react';
import NotesHelp from './NotesHelp';
import { Controller } from 'react-hook-form';
import { useZodForm, fieldAria } from '../../lib/form';
import { TextField, SwitchField } from '../../lib/form-fields';
import { sleeveNotesSegmentSchema, DEFAULT_SLEEVE_NOTES_SEGMENT, type SleeveNotesSegmentConfig } from '../../lib/schemas.generated';
import { FieldError } from '../ui/field';
import { Card, Btn, Pill } from './ui';

export default function SleeveNotesSegmentSettings({config,personas,busy,onSave}:{
  config?:SleeveNotesSegmentConfig;personas:Array<{id:string;name:string}>;busy:boolean;
  onSave:(config:SleeveNotesSegmentConfig)=>void;
}) {
  const uid=useId();
  const form=useZodForm(sleeveNotesSegmentSchema,{...DEFAULT_SLEEVE_NOTES_SEGMENT,...config});
  return <Card headingLevel={2} title="Sleeve Notes segment" right={<NotesHelp text="A segment is a longer solo story or a discussion with guests. Automatic segments use the normal broadcast slots; the selected host DJs can run them when enough suitable Sparks are available." />} sub="A longer observation or discussion from saved Story Sparks">
    <form className="space-y-4" onSubmit={form.handleSubmit(onSave)}>
      <SwitchField control={form.control} name="enabled" label="Enable Sleeve Notes segment" disabled={busy}
        description="Shares the existing segment slots with DJ skills. It waits for at least two usable Sparks about a track that has aired, its album or artist." />
      <TextField control={form.control} name="cooldownMinutes" label="Cooldown time (minutes)" numeric min={5} max={1440} step={1} disabled={busy}
        description="Minimum time between Sleeve Notes segments. The station’s speech frequency and placement settings still apply." />
      <SwitchField control={form.control} name="cohosts" label="Co-hosted discussion" disabled={busy}
        description="When the show has guests, let them discuss the stories with the host. Otherwise the host speaks alone." />
      <Controller control={form.control} name="personaIds" render={({field,fieldState})=>{
        const aria=fieldAria(`${uid}-djs`,fieldState.error,{hasDescription:true});
        const selected=field.value??personas.map(p=>p.id);
        return <div className="space-y-2">
          <p {...aria.labelledByProps} className="text-[13px] font-medium">Which DJs run it</p>
          <div {...aria.groupProps} role="group" className="flex flex-wrap gap-2.5">
            {personas.map(persona=>{
              const on=selected.includes(persona.id);
              return <Pill key={persona.id} pressed={on} tone={on?'solid':undefined} disabled={busy}
                className="gap-2.5 px-3.5 py-[9px] text-[13px] tracking-[0.01em] normal-case select-none aria-pressed:font-semibold aria-[pressed=false]:font-medium"
                onClick={()=>field.onChange(on?selected.filter(id=>id!==persona.id):[...selected,persona.id])}>
                <span aria-hidden="true" className={`size-[9px] shrink-0 border ${on?'border-accent bg-accent':'border-[color:var(--separator-strong)]'}`} />
                {persona.name}
              </Pill>;
            })}
          </div>
          <p {...aria.descriptionProps} className="text-xs leading-5 text-muted">Click a DJ’s name to turn them on or off. Applies to the host DJ; guests come from the show’s roster.{field.value?.length===0?' No host DJs are selected, so the segment will not run.':''}</p>
          <FieldError {...aria.errorProps} errors={fieldState.error?[fieldState.error]:undefined} />
        </div>;
      }} />
      <Btn type="submit" disabled={busy||!form.formState.isDirty}>{busy?'Saving…':'Save segment settings'}</Btn>
    </form>
  </Card>;
}
