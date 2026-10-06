'use client';

import { useState } from 'react';
import { adminJson, useAdminQuery, type AdminFetch } from '../../lib/admin-query';
import { Card, Pill } from './ui';

type Item = {
  id: string;
  sourceDocumentId: string;
  entityName: string | null;
  artistName: string | null;
  provider: string;
  sourceUrl: string;
  attribution: string;
  rejectionReason: string;
  reasonDetail: string;
  rejectionOrigin: string;
  binEnteredAt: string | null;
  djRejectionCount: number;
  status: string;
  category: string;
  topic: string;
  wording: string;
  shortWording: string;
  evidence: string;
  originalJson: string;
  claimId: string | null;
  updatedAt: string;
};
type Page = { items: Item[]; total: number; counts: Record<string, number> };
type Draft = Pick<Item, 'category' | 'topic' | 'wording' | 'shortWording' | 'evidence'>;

const categories = ['artist-stories', 'release-stories', 'track-stories',
  'musical-connections', 'milestones', 'credits', 'recognition'];
const reasons = ['category', 'shape', 'incomplete', 'short-shape', 'unsupported',
  'short-unsupported', 'semantic-review', 'bare-milestone', 'editorial', 'dj-quality', 'topic', 'duplicate', 'limit'];
const reasonDetails: Record<string, string> = {
  category: 'The proposed category did not fit the fact or this source.',
  shape: 'One of the proposed fields did not fit the required format or length.',
  incomplete: 'The Full story may need clearer names or context.',
  'short-shape': 'The Short anchors were missing or too long.',
  unsupported: 'The automated evidence check could not confirm the wording. Check it against the saved source.',
  'short-unsupported': 'The Short anchors may change or lose a fact from the Full story.',
  'semantic-review': 'The model review did not confirm every detail. Check the source yourself.',
  'bare-milestone': 'A routine release fact was judged too thin for a story.',
  editorial: 'The proposal was judged too thin for airtime.',
  'dj-quality': 'Three aired DJ links explicitly rejected this spark for its own quality.',
  topic: 'The topic needs a clearer, more specific label.',
  duplicate: 'Another proposal from this research batch expressed the same fact.',
  limit: 'The research batch already had its maximum number of accepted claims.',
};

export default function SleeveNotesModeration({ adminFetch, hydrated }: {
  adminFetch: AdminFetch; hydrated: boolean;
}) {
  const [status, setStatus] = useState<'pending' | 'approved' | 'deleted' | 'retained'>('pending');
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('');
  const [reason, setReason] = useState('');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const params = new URLSearchParams({ status, search, provider, reason,
    limit: '25', offset: String(page * 25) });
  const query = useAdminQuery<Page>({
    key: ['sleeve-notes', 'moderation', status, search, provider, reason, page],
    adminFetch, enabled: hydrated,
    request: (fetcher, signal) => adminJson(fetcher, `/sleeve-notes/moderation?${params.toString()}`, undefined, signal),
    staleTime: 5_000,
  });
  const selected = query.data?.items.find((item) => item.id === selectedId) ?? null;
  const source = useAdminQuery<{ content: string; sourceUrl: string; provider: string }>({
    key: ['sleeve-notes', 'moderation-source', selected?.sourceDocumentId],
    adminFetch, enabled: hydrated && !!selected?.sourceDocumentId,
    request: (fetcher, signal) => adminJson(fetcher,
      `/sleeve-notes/moderation/source/${encodeURIComponent(selected!.sourceDocumentId)}`, undefined, signal),
    staleTime: 60_000,
  });

  function changeFilter(next: () => void) {
    next(); setPage(0); setSelectedId(null); setDraft(null); setMessage('');
  }
  function select(item: Item) {
    setSelectedId(item.id);
    setDraft({ category: item.category, topic: item.topic, wording: item.wording,
      shortWording: item.shortWording, evidence: item.evidence });
    setMessage('');
  }
  async function decide(action: 'approved' | 'deleted') {
    if (!selected || !draft) return;
    setBusy(true); setMessage('');
    try {
      const path = selected.status === 'approved' && selected.claimId
        ? `/sleeve-notes/claims/${encodeURIComponent(selected.claimId)}/${action}`
        : `/sleeve-notes/moderation/${encodeURIComponent(selected.id)}/${action}`;
      await adminJson(adminFetch, path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
      });
      setSelectedId(null); setDraft(null);
      setMessage(action === 'approved' ? 'Claim saved. It can be selected when Extended Sleeve Notes is on.' : 'Claim deleted. It will not return on a replay.');
      await query.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the decision.');
    } finally { setBusy(false); }
  }

  return <div className="space-y-5">
    <Card title="Recycle Bin" sub="DJ-rejected sparks stay off air and expire after 30 days unless you intervene">
      <div className="flex flex-wrap gap-2">
        {(['pending', 'approved', 'deleted', 'retained'] as const).map((value) =>
          <button key={value} type="button" onClick={() => changeFilter(() => setStatus(value))}
            className={`rounded-md border px-3 py-2 text-xs capitalize ${status === value ? 'border-primary text-primary' : 'border-border text-muted'}`}>
            {value} ({query.data?.counts[value] ?? 0})
          </button>)}
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_10rem_12rem]">
        <input value={search} onChange={(event) => changeFilter(() => setSearch(event.target.value))}
          placeholder="Search claim, artist or album…" className="rounded-md border border-border bg-transparent px-3 py-2 text-[13px]" />
        <select value={provider} onChange={(event) => changeFilter(() => setProvider(event.target.value))}
          className="rounded-md border border-border bg-card px-2 py-2 text-[13px]">
          <option value="">All sources</option><option value="wikipedia">Wikipedia</option><option value="genius">Genius</option>
        </select>
        <select value={reason} onChange={(event) => changeFilter(() => setReason(event.target.value))}
          className="rounded-md border border-border bg-card px-2 py-2 text-[13px]">
          <option value="">All reasons</option>{reasons.map((value) => <option key={value} value={value}>{value.replaceAll('-', ' ')}</option>)}
        </select>
      </div>
      {message && <p role="status" className="mt-3 text-xs text-muted">{message}</p>}
      {query.error && <p className="mt-3 text-xs text-vermilion">Could not load the review queue.</p>}
      {query.isLoading && <p className="mt-3 text-xs text-muted">Loading proposals…</p>}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(15rem,0.9fr)_minmax(0,1.6fr)]">
        <div className="max-h-[45rem] space-y-2 overflow-y-auto pr-1">
          {query.data?.items.map((item) => <button type="button" key={item.id} onClick={() => select(item)}
            className={`w-full rounded-md border p-3 text-left ${selectedId === item.id ? 'border-primary' : 'border-border/70'}`}>
            <span className="text-[13px] font-semibold">{item.entityName || item.artistName || 'Unknown subject'}</span>
            {item.artistName && item.artistName !== item.entityName && <span className="block text-xs text-muted">{item.artistName}</span>}
            <span className="mt-1 line-clamp-2 block text-xs">{item.wording}</span>
            <span className="mt-2 flex gap-2 text-[11px] text-muted"><span>{item.provider}</span><span>·</span><span>{item.rejectionOrigin.replaceAll('-', ' ')}</span>
              {item.binEnteredAt && <><span>·</span><span>{new Date(item.binEnteredAt).toLocaleDateString('en-GB')}</span></>}</span>
          </button>)}
          {query.data?.items.length === 0 && <p className="text-xs text-muted">No proposals match these filters.</p>}
        </div>
        {selected && draft ? <div className="space-y-3 rounded-md border border-border/70 p-4">
          <div className="flex flex-wrap items-center gap-2">{selected.rejectionReason && <Pill tone="ink">{selected.rejectionReason.replaceAll('-', ' ')}</Pill>}
            <span className="text-xs text-muted">{selected.provider} · {selected.attribution}</span></div>
          {selected.rejectionReason && <p className="text-xs text-muted">{selected.reasonDetail || reasonDetails[selected.rejectionReason] || 'Review the proposed fact against its source.'}</p>}
          {selected.status === 'pending' && selected.binEnteredAt && <p className="text-xs text-muted">
            Entered the bin {new Date(selected.binEnteredAt).toLocaleDateString('en-GB')} · expires {new Date(Date.parse(selected.binEnteredAt) + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB')}
            {selected.djRejectionCount > 0 ? ` · ${selected.djRejectionCount} DJ quality rejections` : ''}
          </p>}
          <p className="text-xs text-muted">Approve confirms that you checked every fact against the saved source. You can correct an automated rejection; the supporting passage must remain an exact excerpt.</p>
          <label className="block text-xs">Category
            <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}
              className="mt-1 w-full rounded-md border border-border bg-card p-2 text-[13px]">
              {categories.map((value) => <option key={value} value={value}>{value.replaceAll('-', ' ')}</option>)}
            </select>
          </label>
          <label className="block text-xs">Topic
            <input value={draft.topic} onChange={(event) => setDraft({ ...draft, topic: event.target.value })}
              className="mt-1 w-full rounded-md border border-border bg-transparent p-2 text-[13px]" />
          </label>
          <label className="block text-xs">Full story
            <textarea rows={4} value={draft.wording} onChange={(event) => setDraft({ ...draft, wording: event.target.value })}
              className="mt-1 w-full rounded-md border border-border bg-transparent p-2 text-[13px]" />
          </label>
          <label className="block text-xs">Short anchors
            <textarea rows={2} value={draft.shortWording} onChange={(event) => setDraft({ ...draft, shortWording: event.target.value })}
              className="mt-1 w-full rounded-md border border-border bg-transparent p-2 text-[13px]" />
          </label>
          <label className="block text-xs">Supporting passage
            <textarea rows={5} value={draft.evidence} onChange={(event) => setDraft({ ...draft, evidence: event.target.value })}
              className="mt-1 w-full rounded-md border border-border bg-transparent p-2 text-[13px]" />
          </label>
          <a href={selected.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Open original source ↗</a>
          <details className="rounded-md border border-border/70 p-2 text-xs">
            <summary className="cursor-pointer">Saved source text</summary>
            <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-muted">{source.data?.content ?? (source.isLoading ? 'Loading…' : 'Source unavailable.')}</p>
          </details>
          <div className="flex flex-wrap gap-2 border-t border-border/70 pt-3">
            {(selected.status === 'pending' || (selected.status === 'approved' && selected.claimId)) && <>
              <button type="button" disabled={busy} onClick={() => void decide('approved')}
                className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{selected.status === 'pending' ? 'Approve' : 'Save correction'}</button>
              <button type="button" disabled={busy} onClick={() => void decide('deleted')}
                className="rounded-md border border-border px-3 py-2 text-xs disabled:opacity-50">{selected.status === 'pending' ? 'Delete proposal' : 'Delete claim'}</button>
            </>}
          </div>
        </div> : <div className="rounded-md border border-dashed border-border p-5 text-[13px] text-muted">Select a proposal to review its source and wording.</div>}
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-muted">
        <span>{query.data ? `${query.data.total.toLocaleString('en-GB')} matching proposals` : ''}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page === 0} onClick={() => { setPage(page - 1); setSelectedId(null); }} className="disabled:opacity-40">Previous</button>
          <span>Page {page + 1}</span>
          <button type="button" disabled={!query.data || (page + 1) * 25 >= query.data.total}
            onClick={() => { setPage(page + 1); setSelectedId(null); }} className="disabled:opacity-40">Next</button>
        </div>
      </div>
    </Card>
  </div>;
}
