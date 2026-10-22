'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAdminAuth } from '../../lib/adminAuth';
import { errorMessage, notify } from '../../lib/notify';
import { useDynamicStyle } from '../../hooks/useDynamicStyle';
import { Button } from '../ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Card, MetaChip, Pill } from './ui';
import { ColorChip } from './schedule/bits';
import {
  GENERATED_SHOW_COLORS,
  GENERATED_SHOW_TEMPLATES,
  generatedShowColor,
  generatedShowLabel,
} from './schedule/lib';
import { hydrateShow, joinNames } from './shows/lib';
import { ShowAvatar } from './shows/ShowAvatar';
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
  const apiBase = (process.env.NEXT_PUBLIC_API_URL as string | undefined) || '/api';
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
          <div className="grid gap-0">
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
          <div className="grid gap-3 p-3">
            {history.data.slice(0, 12).map(episode => (
              <GeneratedEpisodeRow
                key={episode.occurrence.id}
                episode={episode}
                personas={personas}
                timezone={data.values?.timezone}
                apiBase={apiBase}
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
  const descriptionId = `sub-shows-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-description`;
  return (
    <fieldset aria-describedby={descriptionId} className="grid min-w-0 gap-0 border-b border-separator-soft py-4 first:pt-0 last:border-0 last:pb-0">
      <legend className="text-[11px] font-bold tracking-[0.22em] text-ink uppercase">{title}</legend>
      <div className="mt-3 flex flex-wrap gap-2.5">
        {items.length ? items.map(item => {
          const isSelected = selected === null || selected.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(item.id, !isSelected)}
              className={`inline-flex min-h-10 cursor-pointer items-center gap-2.5 border px-3.5 py-2 text-[13px] transition-colors ${
                isSelected
                  ? 'border-ink bg-ink font-semibold text-bg'
                  : 'border-separator-strong bg-transparent font-medium text-muted hover:border-ink hover:text-ink'
              }`}
            >
              <span
                aria-hidden="true"
                className={`size-[9px] shrink-0 border ${
                  isSelected ? 'border-vermilion bg-vermilion' : 'border-ink/40 bg-transparent'
                }`}
              />
              <span>{item.label}</span>
            </button>
          );
        }) : <span className="py-2 text-[10px] text-muted">{empty}</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <p id={descriptionId} className="max-w-[78ch] text-[12px] leading-[1.6] text-muted">{description}</p>
        <div className="flex shrink-0 gap-3 text-[10px]">
          <button type="button" className="text-accent hover:underline" onClick={onAll}>Everyone</button>
          <button type="button" className="text-muted hover:underline" onClick={onNone}>Clear</button>
        </div>
      </div>
    </fieldset>
  );
}

function GeneratedEpisodeRow({ episode, personas, timezone, apiBase }: {
  episode: GeneratedEpisodeHistory;
  personas: Persona[];
  timezone?: string;
  apiBase: string;
}) {
  const spineRef = useRef<HTMLSpanElement>(null);
  useDynamicStyle(spineRef, { background: generatedShowColor(episode.template) });

  const hostPersona = personas.find(persona => persona.id === episode.hostPersonaId) ?? null;
  const guestPersonas = episode.guestPersonaIds
    .map(id => personas.find(persona => persona.id === id) ?? null);
  const host = hostPersona?.name?.trim() || 'Unknown DJ';
  const guests = guestPersonas.map(persona => persona?.name?.trim() || 'Unknown DJ');
  const template = GENERATED_SHOW_TEMPLATES.find(item => item.id === episode.template)?.label || episode.template;
  const startsAt = new Date(episode.occurrence.startsAt);
  const when = new Intl.DateTimeFormat(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(startsAt);
  const plan = episode.plan;

  return (
    <article className="card group relative">
      <span ref={spineRef} aria-hidden="true" className="absolute inset-y-0 left-0 w-1" />
      <div className="card-body flex gap-3.5">
        <div className="flex flex-none flex-col items-center">
          <ShowAvatar persona={hostPersona} apiBase={apiBase} size="lg" />
          {guestPersonas.length > 0 && (
            <div className="mt-1 flex">
              {guestPersonas.map((persona, index) => (
                <ShowAvatar
                  key={episode.guestPersonaIds[index]}
                  persona={persona}
                  apiBase={apiBase}
                  size="sm"
                  className={index > 0 ? '-ml-2 ring-2 ring-[var(--card-bg)]' : ''}
                />
              ))}
            </div>
          )}
        </div>

        <div className="grid min-w-0 flex-1 gap-2.5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <Pill tone="solid" dot>Programme</Pill>
                <Pill>{template}</Pill>
              </div>
              <div className="truncate text-[17px] font-extrabold tracking-[-0.01em] text-ink">
                {plan?.name || (episode.status === 'failed' ? 'Plan generation failed' : template)}
              </div>
              <div className="mt-0.5 truncate text-[12px] text-muted">
                host · <span className="font-semibold text-ink">{host}</span>
                {guests.length > 0 && <> · with {joinNames(guests)}</>}
              </div>
            </div>

            <div className="flex flex-none flex-col items-end gap-1.5 text-right">
              <time dateTime={startsAt.toISOString()} className="text-[11px] font-semibold text-ink">{when}</time>
              <Pill tone={episode.status === 'failed' ? 'accent' : 'ink'}>
                {episode.status === 'failed' ? 'Generation failed' : 'Ready'}
              </Pill>
              <span className="caption uppercase">{episode.occurrence.source}</span>
            </div>
          </div>
          {plan ? (
            <>
              <div className="flex flex-wrap gap-1">
                {[...plan.moods, ...plan.genres, ...plan.energies].map((tag, index) => (
                  <MetaChip key={`${tag}-${index}`}>{tag}</MetaChip>
                ))}
                {plan.eras.map((era, index) => (
                  <MetaChip key={`era-${index}`}>
                    {era.fromYear ?? 'Earlier'}–{era.toYear ?? 'Now'}
                  </MetaChip>
                ))}
                <MetaChip accent={plan.filtersStrict}>
                  {plan.filtersStrict ? 'Strict filters' : 'Soft filters'}
                </MetaChip>
              </div>
              <p className="line-clamp-2 max-w-[90ch] text-[12px] leading-[1.55] text-muted italic">{plan.topic}</p>
              {plan.rationale && (
                <details className="text-[10px] text-muted">
                  <summary className="w-fit cursor-pointer hover:text-ink">Why these settings</summary>
                  <p className="mt-1 max-w-[90ch] leading-[1.5]">{plan.rationale}</p>
                </details>
              )}
            </>
          ) : <p className="text-[10px] text-muted">{episode.reason || 'The plan has not been generated yet.'}</p>}
        </div>
      </div>
    </article>
  );
}
