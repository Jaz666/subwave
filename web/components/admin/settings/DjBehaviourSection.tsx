'use client';

import type { ChangeEvent } from 'react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Card, Seg } from '../ui';
import { fieldAria } from '../../../lib/form';
import {
  SectionHeader, SaveBar, SettingsFieldError, settingsFieldAria,
  type SectionProps,
} from './shared';
import {
  DJ_RECAP_CHARS_BOUNDS,
  DJ_RECAP_LIMIT_BOUNDS,
  DJ_RECAP_MINUTES_BOUNDS,
  PICKER_MIN_TRACK_LENGTH_BOUNDS,
} from '@/lib/schemas.generated';

/**
 * Home for decisions about WHEN and HOW the DJ speaks, rather than the engine
 * which renders that speech. Keep policy controls here as they are introduced
 * so the TTS panel remains concerned solely with voice configuration.
 */
export function DjBehaviourSection({ data, form, setForm, busy, saveSettings, fieldErrors }: SectionProps) {
  const talkPlacementAria = fieldAria('dj-talk-placement', undefined, { hasDescription: true });
  const linkStyleAria = fieldAria('dj-link-release-year', undefined, { hasDescription: true });
  const pauseTalkAria = settingsFieldAria(
    'pause-talk-min-seconds',
    fieldErrors.pauseTalkMinSeconds,
  );
  const recapLimitAria = settingsFieldAria(
    'dj-recap-limit',
    fieldErrors['djBehaviour.recapLimit'],
  );
  const recapMinutesAria = settingsFieldAria(
    'dj-recap-minutes',
    fieldErrors['djBehaviour.recapMinutes'],
  );
  const recapCharsAria = settingsFieldAria(
    'dj-recap-chars',
    fieldErrors['djBehaviour.recapChars'],
  );
  const save = async () => {
    await saveSettings({
      djTalkOnlyBetweenTracks: form.djTalkOnlyBetweenTracks,
      pauseTalkMinSeconds: Number(form.pauseTalkMinSeconds),
      djBehaviour: {
        ...form.djBehaviour,
        recapLimit: Number(form.djBehaviour.recapLimit),
        recapMinutes: Number(form.djBehaviour.recapMinutes),
        recapChars: Number(form.djBehaviour.recapChars),
      },
      llm: {
        trackSelection: form.llm.trackSelection,
        shortlistPasses: form.llm.shortlistPasses,
        requestMatching: form.llm.requestMatching,
        segmentRuntime: form.llm.segmentRuntime,
        noRepeatWindow: Math.max(0, parseInt(form.llm.noRepeatWindow, 10) || 0),
        artistVarietyWindow: Math.max(0, parseInt(form.llm.artistVarietyWindow, 10) || 0),
        discoverySteps: form.llm.discoverySteps,
        agentTimeoutMs: form.llm.agentTimeoutMs,
        // Compatibility bridge for pre-choice settings files. The three explicit
        // runtime choices above remain independent at runtime.
        pickerAgent: form.llm.trackSelection === 'agentic',
      },
      picker: {
        albumHours: Number(form.picker.albumHours),
        minTrackLengthSeconds: Number(form.picker.minTrackLengthSeconds),
      },
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
          <Label {...talkPlacementAria.labelledByProps}>Scheduled speech</Label>
          <Seg
            {...talkPlacementAria.groupProps}
            value={form.djTalkOnlyBetweenTracks ? 'between' : 'any'}
            options={[
              { id: 'any', label: 'Any time', title: 'Scheduled segments air on the minute they are written' },
              { id: 'between', label: 'Between tracks', title: 'Scheduled segments wait for the next track boundary' },
            ]}
            onChange={v => setForm(f => ({ ...f, djTalkOnlyBetweenTracks: v === 'between' }))}
          />
          <p {...talkPlacementAria.descriptionProps} className="mt-2 text-[13px] leading-[1.55] text-muted">
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

      <Card title="Segments & Skills" sub={form.llm.segmentRuntime === 'agentic' ? 'Agentic runtime' : 'Direct runtime'}>
        <div className="field">
          <Label>How the DJ prepares scheduled segments</Label>
          <Seg
            accent
            value={form.llm.segmentRuntime}
            options={[
              { id: 'direct', label: 'Direct runtime', title: 'The controller fetches evidence, then the DJ writes one bounded response' },
              { id: 'agentic', label: 'Agentic runtime', title: 'The DJ may use its tools to research and prepare a segment' },
            ]}
            onChange={v => setForm(f => ({
              ...f,
              llm: { ...f.llm, segmentRuntime: v as 'agentic' | 'direct' },
            }))}
          />
          <p className="mt-2 text-[13px] leading-[1.55] text-muted">
            Both runtimes use the same briefs, schedules, cooldowns and evidence rules. Direct runtime
            fetches the selected evidence in the controller and makes one bounded writing call; Agentic
            runtime lets a tool-capable model decide how to use the available tools.
          </p>
        </div>
      </Card>

      <Card title="Request matching" sub={form.llm.requestMatching === 'agentic' ? 'Agent-assisted' : 'Direct'}>
        <div className="field">
          <Label>How listener requests are matched</Label>
          <Seg
            accent
            value={form.llm.requestMatching}
            options={[
              { id: 'direct', label: 'Direct matching', title: 'Fast, tool-free matching for straightforward requests' },
              { id: 'agentic', label: 'Agent-assisted', title: 'Uses music-search tools for detailed or compound requests' },
            ]}
            onChange={v => setForm(f => ({
              ...f,
              llm: { ...f.llm, requestMatching: v as 'agentic' | 'direct' },
            }))}
          />
          <p className="mt-2 text-[13px] leading-[1.55] text-muted">
            Direct matching covers the majority of artist, title, genre and simple-mood requests.
            Agent-assisted matching can interpret more detailed or compound requests, but needs a
            tool-capable model and may take longer or use more LLM resources.
          </p>
          {form.llm.trackSelection === 'shortlist' && form.llm.requestMatching === 'agentic' && (
            <p className="mt-2 text-[13px] leading-[1.55] text-muted">
              Track Shortlist remains tool-free. This setting affects listener requests only.
            </p>
          )}
        </div>
      </Card>

      <Card title="Track selection" sub={form.llm.trackSelection === 'agentic' ? 'Agentic Tools' : 'Track Shortlist'}>
        <div className="field">
          <Label>How the DJ finds its next track</Label>
          <Seg
            accent
            value={form.llm.trackSelection}
            options={[
              { id: 'agentic', label: 'Agentic Tools', title: 'The DJ explores the library with its tools before choosing' },
              { id: 'shortlist', label: 'Track Shortlist', title: 'The controller builds eligible choices, then the DJ selects from them' },
            ]}
            onChange={v => setForm(f => ({
              ...f,
              llm: { ...f.llm, trackSelection: v as 'agentic' | 'shortlist' },
            }))}
          />
          <p className="mt-2 text-[13px] leading-[1.55] text-muted">
            Both routes apply the same show rules, recency protections, requests and Musical Leanings.
            Agentic Tools suit an open-ended, exploratory process. Track Shortlist is a bounded,
            tool-free route that can suit local models and cloud stations reducing LLM work.
          </p>
        </div>

        {form.llm.trackSelection === 'agentic' ? (
          <>
            <div className="field mt-5">
              <Label>Agent deadline (seconds)</Label>
              <Input
                type="number" min={5} max={300} step={5}
                value={Math.round(form.llm.agentTimeoutMs / 1000)}
                onChange={e => setForm(f => ({ ...f, llm: { ...f.llm, agentTimeoutMs: Number(e.target.value) * 1000 } }))}
                className="max-w-[200px]"
              />
              <p className="mt-2 text-[13px] leading-[1.55] text-muted">
                How long an Agentic pick may run before the station uses its safe fallback. 5–300 seconds.
              </p>
            </div>
            <div className="field mt-5">
              <Label>Discovery rounds per pick</Label>
              <Input
                type="number" min={0} max={5} step={1} value={form.llm.discoverySteps}
                onChange={e => setForm(f => ({ ...f, llm: { ...f.llm, discoverySteps: Number(e.target.value) } }))}
                className="max-w-[200px]"
              />
              <p className="mt-2 text-[13px] leading-[1.55] text-muted">
                How many library searches the agent may make before choosing. Zero follows the provider default.
              </p>
            </div>
          </>
        ) : (
          <div className="field mt-5">
            <Label>Shortlist passes</Label>
            <Input
              type="number" min={1} max={5} step={1} value={form.llm.shortlistPasses}
              onChange={e => setForm(f => ({ ...f, llm: { ...f.llm, shortlistPasses: Number(e.target.value) } }))}
              className="max-w-[200px]"
            />
            <p className="mt-2 text-[13px] leading-[1.55] text-muted">
              How many controller-led discovery passes build the shortlist before the DJ chooses one eligible track.
            </p>
          </div>
        )}
      </Card>

      <Card title="Track selection policy" sub="shared rules">
        <div className="field mt-4">
          <Label>No-repeat window (tracks)</Label>
          <Input
            type="number" min={0} max={1000} step={10}
            value={form.llm.noRepeatWindow}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setForm(f => ({ ...f, llm: { ...f.llm, noRepeatWindow: e.target.value } }))}
            placeholder="250"
            className="max-w-[200px]"
          />
          <div className="field-hint">
            The last N <strong>distinct</strong> tracks can never be re-picked: a hard
            guard on both selection paths, on top of the time-based window. It scales down
            on a small library so it never blocks everything. <strong>0 = off</strong>.
            Listener requests stay exempt. 0&ndash;1000.
          </div>
        </div>

        <div className="field mt-4">
          <Label>Artist spacing (slots)</Label>
          <Input
            type="number" min={0} max={25} step={1}
            value={form.llm.artistVarietyWindow}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setForm(f => ({ ...f, llm: { ...f.llm, artistVarietyWindow: e.target.value } }))}
            placeholder="5"
            className="max-w-[200px]"
          />
          <div className="field-hint">
            How many slots the DJ waits before returning to an artist. A pick inside the
            window is re-taken from the run&apos;s other eligible tracks, and quietly stands
            only if nothing fresher turned up. <strong>0 = off</strong>, though an artist
            can never follow itself. 0&ndash;25.
          </div>
        </div>

        <div className="field mt-4">
          <Label>Album cooldown (hours)</Label>
          <Input
            type="number" min={0} max={72} step={0.5}
            value={form.picker.albumHours}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setForm(f => ({ ...f, picker: { ...f.picker, albumHours: e.target.value } }))}
            placeholder="0"
            className="max-w-[200px]"
          />
          <div className="field-hint">
            How long a <strong>record</strong> rests after one of its tracks airs. It
            yields rather than starving selection, and compilations and various-artists
            albums are exempt. <strong>0 = off</strong> (the default). 0&ndash;72.
          </div>
        </div>

        <div className="field mt-4">
          <Label>Minimum track length (seconds)</Label>
          <Input
            type="number" min={0} max={PICKER_MIN_TRACK_LENGTH_BOUNDS.max} step={1}
            value={form.picker.minTrackLengthSeconds}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setForm(f => ({ ...f, picker: { ...f.picker, minTrackLengthSeconds: e.target.value } }))}
            placeholder="0"
            className="max-w-[200px]"
          />
          <div className="field-hint">
            The shortest a track can be to get picked, on both selection paths and the
            offline fallback playlist. A show can set its own; listener requests are
            always exempt. <strong>0 = off</strong> (the default). A non-zero value must
            be at least {data?.values?.minTrackSeconds ?? 30}s.
          </div>
        </div>
      </Card>

      <Card title="Pause-and-talk" sub={`${form.pauseTalkMinSeconds}s minimum`}>
        <div className="field" data-invalid={pauseTalkAria.invalid || undefined}>
          <Label {...pauseTalkAria.labelProps}>Minimum segment length</Label>
          <Input
            {...pauseTalkAria.controlProps}
            type="number"
            min="5"
            max="90"
            step="1"
            value={form.pauseTalkMinSeconds}
            onChange={e => setForm(f => ({ ...f, pauseTalkMinSeconds: e.target.value }))}
          />
          <p className="mt-2 text-[13px] leading-[1.55] text-muted">
            On shows with Pause-and-talk enabled, eligible skill segments at least
            this long pause the music and speak in the clear. Shorter segments keep
            the usual ducked delivery.
          </p>
          <SettingsFieldError
            path="pauseTalkMinSeconds"
            errors={fieldErrors}
            {...pauseTalkAria.errorProps}
          />
        </div>
      </Card>

      <Card title="Prompt memory" sub={`${form.djBehaviour.recapLimit} lines · ${form.djBehaviour.recapMinutes} min`}>
        <div className="grid gap-5 sm:grid-cols-3">
          <div className="field" data-invalid={recapLimitAria.invalid || undefined}>
            <Label {...recapLimitAria.labelProps}>Recent lines</Label>
            <Input
              {...recapLimitAria.controlProps}
              type="number"
              min={DJ_RECAP_LIMIT_BOUNDS.min}
              max={DJ_RECAP_LIMIT_BOUNDS.max}
              step="1"
              value={form.djBehaviour.recapLimit}
              onChange={e => setForm(f => ({
                ...f,
                djBehaviour: { ...f.djBehaviour, recapLimit: e.target.value },
              }))}
            />
            <SettingsFieldError
              path="djBehaviour.recapLimit"
              errors={fieldErrors}
              {...recapLimitAria.errorProps}
            />
          </div>
          <div className="field" data-invalid={recapMinutesAria.invalid || undefined}>
            <Label {...recapMinutesAria.labelProps}>Lookback window (minutes)</Label>
            <Input
              {...recapMinutesAria.controlProps}
              type="number"
              min={DJ_RECAP_MINUTES_BOUNDS.min}
              max={DJ_RECAP_MINUTES_BOUNDS.max}
              step="1"
              value={form.djBehaviour.recapMinutes}
              onChange={e => setForm(f => ({
                ...f,
                djBehaviour: { ...f.djBehaviour, recapMinutes: e.target.value },
              }))}
            />
            <SettingsFieldError
              path="djBehaviour.recapMinutes"
              errors={fieldErrors}
              {...recapMinutesAria.errorProps}
            />
          </div>
          <div className="field" data-invalid={recapCharsAria.invalid || undefined}>
            <Label {...recapCharsAria.labelProps}>Characters per line</Label>
            <Input
              {...recapCharsAria.controlProps}
              type="number"
              min={DJ_RECAP_CHARS_BOUNDS.min}
              max={DJ_RECAP_CHARS_BOUNDS.max}
              step="1"
              value={form.djBehaviour.recapChars}
              onChange={e => setForm(f => ({
                ...f,
                djBehaviour: { ...f.djBehaviour, recapChars: e.target.value },
              }))}
            />
            <SettingsFieldError
              path="djBehaviour.recapChars"
              errors={fieldErrors}
              {...recapCharsAria.errorProps}
            />
          </div>
        </div>
        <p className="mt-3 text-[13px] leading-[1.55] text-muted">
          Every DJ script carries this much recent aired speech so the host can avoid
          repeating topics and phrasing. Larger values use more model context. The
          session rolls after four hours; extended and storyteller segments keep their
          longer per-line detail automatically.
        </p>
      </Card>

      <Card title="Show changes" sub={form.djBehaviour.showWelcome ? 'welcome at the hour' : 'quiet'}>
        <div className="field">
          <Label>Welcome the new show</Label>
          <Seg
            value={form.djBehaviour.showWelcome ? 'on' : 'off'}
            options={[
              { id: 'off', label: 'Off', title: 'Keep the normal hourly time check' },
              { id: 'on', label: 'On', title: 'Extend the first hourly check with a welcome to the new show' },
            ]}
            onChange={v => setForm(f => ({ ...f, djBehaviour: { ...f.djBehaviour, showWelcome: v === 'on' } }))}
          />
          <p className="mt-2 text-[13px] leading-[1.55] text-muted">
            At a scheduled show change, the incoming DJ’s first hourly time check adds a
            short natural welcome to the new show. It does not replace a presenter handoff,
            and ordinary hourly checks stay unchanged.
          </p>
        </div>
        <div className="field mt-5">
          <Label>Acknowledge a same-host change</Label>
          <Seg
            value={form.djBehaviour.sameHostAcknowledgement ? 'on' : 'off'}
            options={[
              { id: 'off', label: 'Off', title: 'Keep adjacent shows by the same DJ quiet' },
              { id: 'on', label: 'On', title: 'Let the DJ briefly acknowledge moving into their next show' },
            ]}
            onChange={v => setForm(f => ({ ...f, djBehaviour: { ...f.djBehaviour, sameHostAcknowledgement: v === 'on' } }))}
          />
          <p className="mt-2 text-[13px] leading-[1.55] text-muted">
            When the same DJ hosts two adjacent scheduled shows, add one brief spoken
            acknowledgement of the new show. Different-DJ handoffs keep their normal
            sign-off and greeting.
          </p>
        </div>
      </Card>

      <Card title="Link style" sub={form.djBehaviour.releaseYearMentions + ' release-year mentions'}>
        <div className="field">
          <Label {...linkStyleAria.labelledByProps}>Release-year mentions</Label>
          <Seg
            {...linkStyleAria.groupProps}
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
          <p {...linkStyleAria.descriptionProps} className="mt-2 text-[13px] leading-[1.55] text-muted">
            Release years stay verified in the library. This controls how often one is supplied
            to the DJ for a link, keeping factual grounding intact without making every link sound like metadata.
          </p>
        </div>
      </Card>

      <Card title="Extended Sleeve Notes" sub={form.djBehaviour.extendedSleeveNotes ? 'enabled' : 'off'}>
        <div className="field">
          <Label>Station-wide extended collection</Label>
          <Seg
            value={form.djBehaviour.extendedSleeveNotes ? 'on' : 'off'}
            options={[
              { id: 'off', label: 'Off', title: 'Make no provider calls or background jobs' },
              { id: 'on', label: 'On', title: 'Allow Extended Sleeve Notes collection when a provider is configured' },
            ]}
            onChange={v => setForm(f => ({ ...f, djBehaviour: { ...f.djBehaviour, extendedSleeveNotes: v === 'on' } }))}
          />
        </div>
        <p className="text-[13px] leading-[1.55] text-muted">
          Default Sleeve Notes remain local Verified Facts. Extended Sleeve Notes adds optional
          provider-backed context and does not alter links until its later on-air projection phase.
          While it is off, it starts no provider work.
        </p>
      </Card>

      <SaveBar
        note="DJ behaviour applies to newly scheduled speech straight away · no mixer restart."
        busy={busy}
        onSave={save}
        saveLabel="Save DJ behaviour"
        errors={fieldErrors}
        ownedKeys={['djTalkOnlyBetweenTracks', 'pauseTalkMinSeconds', 'djBehaviour', 'llm']}
      />
    </>
  );
}
