'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useAdminAuth } from '../../lib/adminAuth';
import { errorMessage } from '../../lib/notify';
import { Button } from '../ui/button';
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
import { useSettingsQuery } from './settings/queries';

export default function TemplateShowsPanel() {
  const { adminFetch, needsAuth, hydrated } = useAdminAuth();
  const query = useSettingsQuery<SettingsResponse>({
    adminFetch,
    enabled: hydrated && !needsAuth,
  });
  const data = query.data;
  const personas = data?.values?.personas ?? [];
  const variants = useMemo(
    () => (data?.values?.shows ?? []).map(hydrateShow)
      .filter(show => show.generation?.mode === 'generated'),
    [data?.values?.shows],
  );
  const schedule = data?.values?.schedule ?? {};
  const hoursOf = (showId: string) => Object.values(schedule)
    .flat()
    .filter(id => id === showId)
    .length;

  if (query.error && !data) {
    return (
      <div className="grid gap-4">
        <Card title="Template shows">
          <ErrorState error={errorMessage(query.error)} onRetry={() => query.refetch()} retrying={query.isFetching} />
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid gap-4">
        <Card title="Template shows">
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
            <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">Template shows</h1>
            <p className="mt-1 max-w-[68ch] text-[11px] leading-[1.6] text-muted">
              Each entry is a saved variant with its own host and guest rules. Reuse one variant across
              several schedule slots, or create another for a different setup. Changes to a variant
              apply to every slot that uses it. Click any scheduled block to edit its host and guest rules.
            </p>
          </div>
          <Button asChild variant="accent" size="sm" className="min-h-9">
            <Link href="/admin/shows/schedule">Open the schedule →</Link>
          </Button>
        </div>
      </section>

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
                description={`Create a ${template.label} variant by dragging it from the Template shows section of the schedule shelf.`}
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
                          {hours} scheduled hour{hours === 1 ? '' : 's'}
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
    </div>
  );
}
