'use client';

import { Label } from '../../ui/label';
import { Card, Seg } from '../ui';
import {
  SectionHeader, SaveBar,
  type SectionProps,
} from './shared';

/**
 * Home for decisions about WHEN and HOW the DJ speaks, rather than the engine
 * which renders that speech. Keep policy controls here as they are introduced
 * so the TTS panel remains concerned solely with voice configuration.
 */
export function DjBehaviourSection({ form, setForm, busy, saveSettings, fieldErrors }: SectionProps) {
  const save = async () => {
    await saveSettings({
      djTalkOnlyBetweenTracks: form.djTalkOnlyBetweenTracks,
      djBehaviour: form.djBehaviour,
    });
  };

  return (
    <>
      <SectionHeader
        eyebrow="dj behaviour"
        title="Decide how the DJ occupies the station."
        sub="These controls shape speech placement and show-boundary behaviour. Voice engines and voices stay under TTS voice."
      />

      <Card title="Talk placement" sub={form.djTalkOnlyBetweenTracks ? 'between tracks' : 'any time'}>
        <div className="field">
          <Label>Scheduled speech</Label>
          <Seg
            value={form.djTalkOnlyBetweenTracks ? 'between' : 'any'}
            options={[
              { id: 'any', label: 'Any time', title: 'Scheduled segments air on the minute they are written' },
              { id: 'between', label: 'Between tracks', title: 'Scheduled segments wait for the next track boundary' },
            ]}
            onChange={v => setForm(f => ({ ...f, djTalkOnlyBetweenTracks: v === 'between' }))}
          />
          <p className="mt-2 text-[13px] leading-[1.55] text-muted">
            {form.djTalkOnlyBetweenTracks ? (
              <>
                Every <strong>scheduled</strong> segment — station IDs, the hourly time
                check, banter, programme beats and between-track segments — is written
                ahead of time and held for the <strong>next track boundary</strong>, so the
                DJ never ducks a song mid-play. A segment can therefore air a track later
                than its scheduled minute; stale time-sensitive speech is dropped.
              </>
            ) : (
              <>
                Scheduled segments air on the minute they are written, ducking the current
                song. <strong>Station IDs are the exception</strong> and always wait for the
                next track boundary. Turn this on to give every scheduled segment the same
                between-track treatment.
              </>
            )}
          </p>
        </div>
      </Card>

      <Card title="Show changes" sub="more controls coming here">
        <p className="text-[13px] leading-[1.55] text-muted">
          Presenter handoffs are automatic when the active DJ changes. A future
          same-presenter show acknowledgement will live here, alongside its
          boundary-speech safeguards.
        </p>
      </Card>

      <Card title="Link style" sub={form.djBehaviour.releaseYearMentions + ' release-year mentions'}>
        <div className="field">
          <Label>Release-year mentions</Label>
          <Seg
            value={form.djBehaviour.releaseYearMentions}
            options={[
              { id: 'regular', label: 'Regular', title: 'Keep release years available on every eligible link' },
              { id: 'occasional', label: 'Occasional', title: 'Make release years available on roughly one in four eligible links' },
              { id: 'rare', label: 'Rare', title: 'Make release years available on roughly one in six eligible links' },
            ]}
            onChange={v => setForm(f => ({
              ...f,
              djBehaviour: { ...f.djBehaviour, releaseYearMentions: v as typeof f.djBehaviour.releaseYearMentions },
            }))}
          />
          <p className="mt-2 text-[13px] leading-[1.55] text-muted">
            Release years stay verified in the library. This controls how often one is supplied
            to the DJ for a link, keeping factual grounding intact without making every link sound like metadata.
          </p>
        </div>
      </Card>

      <Card title="Extended Sleeve Notes" sub="coming soon">
        <p className="text-[13px] leading-[1.55] text-muted">
          Soon, the DJ will be able to use a fuller packet of verified track facts—such as
          album, trusted release year and station-play history—when writing links. This will
          remain separate from show steering and other editorial context.
        </p>
      </Card>

      <SaveBar
        note="Talk placement applies to newly scheduled speech straight away · no mixer restart."
        busy={busy}
        onSave={save}
        saveLabel="Save DJ behaviour"
        errors={fieldErrors}
        ownedKeys={['djTalkOnlyBetweenTracks', 'djBehaviour']}
      />
    </>
  );
}
