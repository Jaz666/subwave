'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAdminAuth } from '../../lib/adminAuth';
import { errorMessage, notify } from '../../lib/notify';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Card } from './ui';
import { ColorChip } from './schedule/bits';
import {
  GENERATED_SHOW_COLORS,
  GENERATED_SHOW_TEMPLATES,
  generatedShowLabel,
} from './schedule/lib';
import { hydrateShow } from './shows/lib';
import type { SettingsResponse } from './shows/types';
import {
  useGeneratedEpisodeHistoryQuery,
  useShowSkillsQuery,
} from './shows/queries';
import type { GeneratedEpisodeHistory } from './shows/queries';
import type { Persona } from './shows/types';
import {
  useSettingsMutation,
  useSettingsQuery,
} from './settings/queries';
import type { SubShowsSettings } from '@/lib/schemas.generated';

type PoolKey = 'eligibleHostPersonaIds' | 'eligibleGuestPersonaIds' | 'eligibleSkillNames';
type PoolItem = { id: string; label: string };

export default function TemplateShowsPanel() {
  const { adminFetch, needsAuth, hydrated } = useAdminAuth();
  const enabled = hydrated && !needsAuth;
  const query = useSettingsQuery<SettingsResponse>({ adminFetch, enabled });
  const history = useGeneratedEpisodeHistoryQuery(adminFetch, enabled);
  const skillsQuery = useShowSkillsQuery(adminFetch, enabled);
  const saveSettings = useSettingsMutation<SettingsResponse>({ adminFetch });
  const data = query.data;
  const personas = data?.values?.personas ?? [];
  const variants = useMemo(
    () => (data?.values?.shows ?? []).map(hydrateShow)
      .filter(show => show.generation?.mode === 'generated'),
    [data?.values?.shows],
  );
  const schedule = data?.values?.schedule ?? {};
  const [draft, setDraft] = useState<SubShowsSettings | null>(null);

  useEffect(() => {
    if (data) {
      setDraft(data.values?.subShows ?? {
        eligibleHostPersonaIds: null,
        eligibleGuestPersonaIds: null,
        eligibleSkillNames: null,
      });
    }
  }, [data]);

  const hostItems = personas.map(persona => ({ id: persona.id, label: persona.name || 'Unnamed DJ' }));
  const guestItems = hostItems;
  const skillItems = (skillsQuery.data ?? [])
    .filter(skill => skill.enabled !== false && skill.ready !== false && skill.name)
    .map(skill => ({ id: skill.name!, label: skill.label || skill.name! }));

  const hoursOf = (showId: string) => Object.values(schedule)
    .flat()
    .filter(id => id === showId)
    .length;

  const setPool = (key: PoolKey, selected: string[] | null) => {
    if (!draft) return;
    setDraft({ ...draft, [key]: selected } as SubShowsSettings);
  };

  const togglePool = (key: PoolKey, items: PoolItem[], id: string, checked: boolean) => {
    if (!draft) return;
    const current = draft[key];
    const selected = new Set(current ?? items.map(item => item.id));
    if (checked) selected.add(id);
    else selected.delete(id);
    const allSelected = selected.size === items.length && items.every(item => selected.has(item.id));
    setPool(key, allSelected ? null : [...selected]);
  };

  const savePools = async () => {
    if (!draft) return;
    if (draft.eligibleHostPersonaIds?.length === 0 && variants.some(show => show.generation?.hostMode === 'random')) {
      notify.err('Select at least one eligible host while a variant uses Random Host.');
      return;
    }
    if (draft.eligibleGuestPersonaIds?.length === 0 && variants.some(show =>
      show.generation?.guestMode === 'random' && show.generation.guestCount.min > 0,
    )) {
      notify.err('Select at least one eligible guest for variants that require guests.');
      return;
    }
    try {
      const receipt = await saveSettings.mutateAsync({ subShows: draft });
      if (receipt.refreshError) notify.err(`Saved Sub/Shows settings, but could not refresh them: ${receipt.refreshError}`);
      else notify.ok('Sub/Shows settings saved. Upcoming generated shows are being refreshed.');
    } catch (error) {
      notify.err(`Could not save Sub/Shows settings: ${errorMessage(error)}`);
    }
  };

  if (query.error && !data) {
    return (
      <div className="grid gap-4">
        <Card title="Sub/Shows">
          <ErrorState error={errorMessage(query.error)} onRetry={() => query.refetch()} retrying={query.isFetching} />
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid gap-4">
        <Card title="Sub/Shows">
          <SkeletonRows rows={4} />
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <section className="card">
        <div className="stack-mobile grid grid-cols-[1fr_auto] items-center gap-4 p-4">
          <div>
            <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">Sub/Shows</h1>
            <p className="mt-1 max-w-[68ch] text-[11px] leading-[1.6] text-muted">
              Each entry is a saved DJ’s Choice or Deep Discovery variant with its own host, guest and episode-name rules.
              Reuse a variant across schedule slots, or create another for a different setup. Changes apply to every slot
              that uses it. Click a scheduled block to edit its options.
            </p>
          </div>
          <Button asChild variant="accent" size="sm" className="min-h-9">
            <Link href="/admin/shows/schedule">Open the schedule →</Link>
          </Button>
        </div>
      </section>

      <Card
        title="Sub/Shows settings"
        sub="Used by every generated slot"
        right={(
          <Button size="sm" variant="accent" disabled={!draft || saveSettings.isPending} onClick={() => void savePools()}>
            {saveSettings.isPending ? 'Saving…' : 'Save settings'}
          </Button>
        )}
      >
        {draft && (
          <div className="grid gap-5 xl:grid-cols-3">
            <EligibilityPicker
              title="Random hosts"
              description="DJs available when a slot uses Random Host. Everyone is selected by default."
              items={hostItems}
              selected={draft.eligibleHostPersonaIds}
              onChange={(id, checked) => togglePool('eligibleHostPersonaIds', hostItems, id, checked)}
              onAll={() => setPool('eligibleHostPersonaIds', null)}
              onNone={() => setPool('eligibleHostPersonaIds', [])}
            />
            <EligibilityPicker
              title="Random guests"
              description="DJs available when a slot uses Random Guests. The selected host is always excluded."
              items={guestItems}
              selected={draft.eligibleGuestPersonaIds}
              onChange={(id, checked) => togglePool('eligibleGuestPersonaIds', guestItems, id, checked)}
              onAll={() => setPool('eligibleGuestPersonaIds', null)}
              onNone={() => setPool('eligibleGuestPersonaIds', [])}
            />
            <EligibilityPicker
              title="DJ Skills"
              description="Skills that Sub/Shows may use for programme features, when the host has the skill."
              items={skillItems}
              selected={draft.eligibleSkillNames}
              onChange={(id, checked) => togglePool('eligibleSkillNames', skillItems, id, checked)}
              onAll={() => setPool('eligibleSkillNames', null)}
              onNone={() => setPool('eligibleSkillNames', [])}
              empty={skillsQuery.isLoading
                ? 'Loading DJ Skills…'
                : skillsQuery.error
                  ? `Could not load DJ Skills: ${errorMessage(skillsQuery.error)}`
                  : 'No enabled, ready DJ Skills are available.'}
            />
          </div>
        )}
      </Card>

      {GENERATED_SHOW_TEMPLATES.map(template => {
        const rows = variants.filter(show => show.generation?.template === template.id);
        return (
          <Card
            key={template.id}
            title={template.label}
            sub={`${rows.length} variant${rows.length === 1 ? '' : 's'}`}
            bodyClass="p-0"
          >
            {rows.length === 0 ? (
              <EmptyState
                compact
                title="No variants yet"
                description={`Create a ${template.label} variant by dragging it from the Sub/Shows section of the schedule shelf.`}
              />
            ) : (
              <div className="divide-y divide-separator-soft">
                {rows.map(show => {
                  const hours = hoursOf(show.id);
                  return (
                    <div key={show.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <ColorChip color={GENERATED_SHOW_COLORS[template.id]} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-semibold text-ink">
                          {generatedShowLabel(show, personas)}
                        </div>
                        <div className="mt-1 text-[10px] text-muted">
              {hours} scheduled hour{hours === 1 ? '' : 's'} · {show.generation?.nameMode === 'custom'
                            ? `Custom episode name: ${show.generation.customName}`
                : 'Random episode name'} · Programme features enabled
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}

      <Card
        title="Generated episode plans"
        sub="Recent and upcoming · kept for 30 days"
        bodyClass="p-0"
      >
        {history.error && !history.data ? (
          <ErrorState error={errorMessage(history.error)} onRetry={() => history.refetch()} retrying={history.isFetching} />
        ) : !history.data ? (
          <div className="p-4"><SkeletonRows rows={3} /></div>
        ) : history.data.length === 0 ? (
          <EmptyState
            compact
            title="No generated episodes yet"
            description="A plan appears here after its scheduled Sub/Show has been prepared."
          />
        ) : (
          <div className="divide-y divide-separator-soft">
            {history.data.slice(0, 12).map(episode => (
              <GeneratedEpisodeRow
                key={episode.occurrence.id}
                episode={episode}
                personas={personas}
                timezone={data.values?.timezone}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function EligibilityPicker({
  title,
  description,
  items,
  selected,
  onChange,
  onAll,
  onNone,
  empty = 'No DJs are available.',
}: {
  title: string;
  description: string;
  items: PoolItem[];
  selected: string[] | null;
  onChange: (id: string, checked: boolean) => void;
  onAll: () => void;
  onNone: () => void;
  empty?: string;
}) {
  return (
    <fieldset className="grid min-w-0 content-start gap-2">
      <legend className="text-[12px] font-semibold text-ink">{title}</legend>
      <p className="min-h-8 text-[10px] leading-[1.5] text-muted">{description}</p>
      <div className="flex gap-2 text-[10px]">
        <button type="button" className="text-accent hover:underline" onClick={onAll}>Everyone</button>
        <button type="button" className="text-muted hover:underline" onClick={onNone}>Clear</button>
      </div>
      <div className="grid max-h-52 gap-1 overflow-y-auto rounded border border-separator-soft p-2">
        {items.length ? items.map(item => (
          <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[11px] text-ink hover:bg-panel-soft">
            <Checkbox
              checked={selected === null || selected.includes(item.id)}
              onCheckedChange={value => onChange(item.id, value === true)}
              aria-label={item.label}
            />
            <span className="truncate">{item.label}</span>
          </label>
        )) : <span className="py-2 text-[10px] text-muted">{empty}</span>}
      </div>
    </fieldset>
  );
}

function GeneratedEpisodeRow({ episode, personas, timezone }: {
  episode: GeneratedEpisodeHistory;
  personas: Persona[];
  timezone?: string;
}) {
  const host = personas.find(persona => persona.id === episode.hostPersonaId)?.name || 'Unknown DJ';
  const guests = episode.guestPersonaIds
    .map(id => personas.find(persona => persona.id === id)?.name || 'Unknown DJ');
  const template = GENERATED_SHOW_TEMPLATES.find(item => item.id === episode.template)?.label || episode.template;
  const when = new Intl.DateTimeFormat(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(new Date(episode.occurrence.startsAt));
  const plan = episode.plan;
  const label = episode.status === 'failed'
    ? 'Generation failed'
    : episode.occurrence.startsAt > Date.now()
      ? 'Upcoming'
      : episode.occurrence.endsAt > Date.now()
        ? 'In scheduled slot'
        : 'Past slot';

  return (
    <article className="grid gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[12px] font-semibold text-ink">
          {plan?.name || (episode.status === 'failed' ? 'Plan generation failed' : template)}
        </span>
        <span className="text-[10px] text-muted">{when} · {template}</span>
        <span className={`ml-auto text-[9px] uppercase tracking-wide ${episode.status === 'ready' ? 'text-accent' : 'text-muted'}`}>
          {label}
        </span>
      </div>
      <p className="text-[10px] text-muted">{host}{guests.length ? ` with ${guests.join(', ')}` : ''}</p>
      {plan ? (
        <>
          <p className="max-w-[90ch] text-[11px] leading-[1.55] text-ink">{plan.topic}</p>
          <div className="flex flex-wrap gap-1">
            {[...plan.genres, ...plan.moods, ...plan.energies].map((tag, index) => (
              <span key={`${tag}-${index}`} className="rounded border border-separator-soft px-1.5 py-0.5 text-[9px] text-muted">{tag}</span>
            ))}
            {plan.eras.map((era, index) => (
              <span key={`era-${index}`} className="rounded border border-separator-soft px-1.5 py-0.5 text-[9px] text-muted">
                {era.fromYear ?? 'Earlier'}–{era.toYear ?? 'Now'}
              </span>
            ))}
            <span className="rounded border border-separator-soft px-1.5 py-0.5 text-[9px] text-muted">
              {plan.filtersStrict ? 'Strict filters' : 'Soft filters'}
            </span>
          </div>
          {plan.rationale && (
            <details className="text-[10px] text-muted">
              <summary className="w-fit cursor-pointer hover:text-ink">Why these settings</summary>
              <p className="mt-1 max-w-[90ch] leading-[1.5]">{plan.rationale}</p>
            </details>
          )}
        </>
      ) : <p className="text-[10px] text-muted">{episode.reason || 'The plan has not been generated yet.'}</p>}
    </article>
  );
}
