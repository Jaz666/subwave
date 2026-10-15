'use client';

import Link from 'next/link';
import { useState } from 'react';
import { z } from 'zod';
import { Card, Btn } from './ui';
import { adminJson, useAdminMutation, useAdminQuery, type AdminFetch } from '../../lib/admin-query';
import { useZodForm } from '../../lib/form';
import { SelectField, TextareaField } from '../../lib/form-fields';
import { sparkFeedbackSchema } from '../../lib/schemas.generated';

type Feedback = z.infer<typeof sparkFeedbackSchema>;
type AiredStory = {
  id: string; consumer?: string; claimId: string; localTrackId: string | null; entityType: string; entityId: string;
  airedAt: string; artist: string | null; title: string | null; offeredWording: string;
  spokenText: string; currentWording: string; wordingAtOffer: string; enabled: number; operatorState: string; sourceUrl: string; attribution: string; provider: string;
  story: Feedback['story']; delivery: Feedback['delivery']; note: string | null; feedbackAt: string | null;
  conversation?: {id:string;expectedLines:number|null;complete:boolean|null;
    lines:Array<{lineIndex:number;speakerId:string;speakerName:string;text:string;airedAt:string}>} | null;
};
type Shelf = { items: AiredStory[]; total: number; limit: number; offset: number; readOnly: boolean;
  feedbackTotals: { story: Array<{ value: string; count: number }>; delivery: Array<{ value: string; count: number }> } };
const STORY_LABELS: Record<string, string> = {
  good: 'Good story', routine: 'Too routine', unclear: 'Unclear wording', incorrect: 'Factually wrong', 'wrong-subject': 'Wrong story scope',
};
const DELIVERY_LABELS: Record<string, string> = { worked: 'Worked well', forced: 'Felt forced', 'wrong-subject': 'Wrong subject in speech' };

export default function HeardOnAir({ adminFetch }: { adminFetch: AdminFetch }) {
  const [offset, setOffset] = useState(0);
  const shelf = useAdminQuery<Shelf>({
    key: ['sleeve-notes', 'heard-on-air', offset], adminFetch,
    request: (fetcher, signal) => adminJson(fetcher, `/sleeve-notes/heard-on-air?offset=${offset}`, undefined, signal),
    staleTime: 10_000, refetchInterval: 30_000,
  });
  return <div className="space-y-4">
    <Card title="Heard on air" sub="Stories used in confirmed DJ links and Sleeve Notes segments">
      <p className="text-[13px] text-muted">Revisit the story, the words spoken and their source. Rate the story and delivery separately so a good fact does not lose out because of an awkward link.</p>
      {shelf.data?.readOnly && <p className="mt-2 text-[13px] text-muted">Saved airings remain available. Enable Sleeve Notes in Settings to leave feedback.</p>}
      {shelf.error && <p role="alert" className="mt-3 text-sm">{shelf.error instanceof Error ? shelf.error.message : 'Could not load aired stories'}</p>}
      {shelf.isLoading && <p role="status" className="mt-3 text-sm">Loading aired stories…</p>}
      {shelf.data && shelf.data.total === 0 && <p className="mt-3 text-sm">No confirmed aired stories yet. Offered Sparks and links that pass on the fact do not appear here.</p>}
      {shelf.data && <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
        <span>{shelf.data.total} aired {shelf.data.total === 1 ? 'story' : 'stories'}</span>
        <Btn sm onClick={() => setOffset(Math.max(0, offset - 20))} disabled={offset === 0}>Previous</Btn>
        <Btn sm onClick={() => setOffset(offset + 20)} disabled={offset + 20 >= shelf.data.total}>Next</Btn>
      </div>}
    </Card>
    {shelf.data?.items.map(item => <AiredStoryCard key={item.id} item={item} readOnly={shelf.data.readOnly} adminFetch={adminFetch} />)}
    {shelf.data && (shelf.data.feedbackTotals.story.length > 0 || shelf.data.feedbackTotals.delivery.length > 0) && <Card title="Feedback so far">
      <div className="grid gap-3 sm:grid-cols-2">{(['story', 'delivery'] as const).map(kind => <div key={kind}>
        <p className="text-sm font-medium">{kind === 'story' ? 'Story quality' : 'DJ delivery'}</p>
        <ul className="mt-2 space-y-1 text-[13px]">{shelf.data.feedbackTotals[kind].map(row => <li key={row.value}>{(kind === 'story' ? STORY_LABELS : DELIVERY_LABELS)[row.value]}: {row.count}</li>)}</ul>
      </div>)}</div>
      <p className="mt-3 text-xs text-muted">One saved rating per airing helps identify recurring problems. They do not automatically change research prompts or story preferences.</p>
    </Card>}
  </div>;
}

function AiredStoryCard({ item, readOnly, adminFetch }: { item: AiredStory; readOnly: boolean; adminFetch: AdminFetch }) {
  const [editing, setEditing] = useState(false);
  return <Card title={`${item.artist || 'Unknown artist'} · ${item.title || 'Saved track'}`} sub={new Date(item.airedAt).toLocaleString()}>
    <p className="text-[13px] font-medium">{item.consumer === 'sleeveNotesSegment' ? 'Sleeve Notes segment' : 'The DJ link'}</p>
    {item.conversation ? <div className="mt-2 space-y-3 border-l-2 border-primary/40 pl-3">
      {item.conversation.lines.map(line=><div key={line.lineIndex}>
        <p className="text-xs font-semibold">{line.speakerName}</p>
        <p className="mt-1 text-[13px] leading-relaxed break-words whitespace-pre-wrap">{line.text}</p>
      </div>)}
      {item.conversation.complete===false && <p className="text-xs text-muted">{item.conversation.lines.length} of {item.conversation.expectedLines} contributions confirmed on air.</p>}
    </div> : <blockquote className="mt-2 border-l-2 border-primary/40 pl-3 text-[13px] leading-relaxed whitespace-pre-wrap">{item.spokenText}</blockquote>}
    <details className="mt-4 text-[13px]"><summary className="cursor-pointer font-medium">Offered story and source</summary>
      <p className="mt-2">{item.offeredWording}</p>
      {item.currentWording !== (item.wordingAtOffer ?? item.offeredWording) && <p className="mt-2 text-muted">The saved story has since changed: {item.currentWording}</p>}
      <div className="mt-2 flex flex-wrap gap-3 text-primary">
        <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.attribution || item.provider} ↗</a>
        <Link href={`/admin/notes?tab=stories&storyType=${encodeURIComponent(item.entityType)}&storyId=${encodeURIComponent(item.entityId)}`}>Saved story context</Link>
      </div>
    </details>
    {!item.enabled && <p className="mt-3 text-xs text-muted">This story is currently withdrawn from Sparks. <Link href="/admin/notes?tab=moderation" className="text-primary">Open Review</Link></p>}
    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
      {item.story && <span>Story: {STORY_LABELS[item.story]}</span>}{item.delivery && <span>Delivery: {DELIVERY_LABELS[item.delivery]}</span>}
      {!readOnly && <Btn sm onClick={() => setEditing(value => !value)}>{editing ? 'Close feedback' : item.feedbackAt ? 'Edit feedback' : 'Leave feedback'}</Btn>}
    </div>
    {item.note && !editing && <p className="mt-2 text-xs whitespace-pre-wrap text-muted">{item.note}</p>}
    {editing && !readOnly && <FeedbackForm item={item} adminFetch={adminFetch} onDone={() => setEditing(false)} />}
  </Card>;
}

function FeedbackForm({ item, adminFetch, onDone }: { item: AiredStory; adminFetch: AdminFetch; onDone: () => void }) {
  const form = useZodForm(sparkFeedbackSchema, { story: item.story, delivery: item.delivery, note: item.note || '' });
  const flagged = ['unclear', 'incorrect', 'wrong-subject'].includes(form.watch('story') ?? '');
  const historicalOnly = item.operatorState === 'deleted' || item.currentWording !== (item.wordingAtOffer ?? item.offeredWording);
  const save = useAdminMutation<{ ok: boolean; review: boolean; changedStory: boolean }, Feedback>({
    adminFetch, request: (feedback, fetcher) => adminJson(fetcher, `/sleeve-notes/heard-on-air/${encodeURIComponent(item.id)}/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(feedback),
    }), onDone: async (_result, _vars, client) => { await client.invalidateQueries({ queryKey: ['sleeve-notes'] }); onDone(); },
  });
  return <form onSubmit={form.handleSubmit(value => save.mutate(value))} className="mt-4 space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField control={form.control} name="story" label="Story quality" disabled={save.isPending} options={[{ value: '__none__', label: 'No story rating' }, ...Object.entries(STORY_LABELS).map(([value, label]) => ({ value, label }))]} emptyValue="__none__" />
      <SelectField control={form.control} name="delivery" label="DJ delivery" disabled={save.isPending} options={[{ value: '__none__', label: 'No delivery rating' }, ...Object.entries(DELIVERY_LABELS).map(([value, label]) => ({ value, label }))]} emptyValue="__none__" />
    </div>
    <TextareaField control={form.control} name="note" label={flagged ? 'Specific story problem' : 'Optional note'} rows={3} disabled={save.isPending} />
    {flagged && <p className="text-xs text-muted">{historicalOnly ? 'This story has already been changed or removed. Feedback is saved against this historical airing.' : 'Describe what needs fixing. Saving withdraws this story from Sparks and sends it to Review.'}</p>}
    {!item.enabled && <p className="text-xs text-muted">Changing a rating does not restore a withdrawn story. Restore it through Review.</p>}
    {save.error && <p role="alert" className="text-xs">{save.error instanceof Error ? save.error.message : 'Could not save feedback'}</p>}
    <Btn type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : flagged && !historicalOnly ? 'Save and send to Review' : 'Save feedback'}</Btn>
  </form>;
}
