// One optional, tool-free text call prepares bounded queries for a show airing.
// Query execution stays in music/shortlist.ts; this module never picks a track,
// sees persona Leanings/listener chat, or changes speech context.
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { config } from '../config.js';
import { djText, extractJson, stripThinking } from '../llm/sdk.js';
import { instruction } from '../llm/internal/prompts/instructions.js';
import { shortlistSearchSchema, type ShortlistSearch } from '../music/shortlist-search.js';
import { createSerialFileWriter } from '../util/atomic-file.js';
import { logEvent } from '../observability/events.js';

export type ShortlistSearchBrief = {
  occurrenceId: string;
  expiresAt: number;
  topic: string;
  editorial?: string;
};

const recordSchema = z.object({
  key: z.string(), expiresAt: z.number().finite(),
  status: z.enum(['ready', 'failed']),
  searches: shortlistSearchSchema.shape.searches,
  attempts: z.number().int().min(1).max(2), retryAt: z.number().finite(),
});
const storeSchema = z.object({ version: z.literal(1), records: z.array(recordSchema).max(64) });
type SearchRecord = z.infer<typeof recordSchema>;

export function shortlistSearchPrompt(brief: ShortlistSearchBrief): string {
  return JSON.stringify({ topic: brief.topic.trim().slice(0, 2000), editorial: brief.editorial?.trim().slice(0, 2000) || '' });
}

export function createShortlistSearchPreparation({ file, generate, now = Date.now }: {
  file: string;
  generate: (prompt: string) => Promise<string>;
  now?: () => number;
}) {
  let recovered: Promise<void> | null = null;
  const records = new Map<string, SearchRecord>();
  const pending = new Map<string, Promise<ShortlistSearch[]>>();
  const write = createSerialFileWriter(file);
  const report = (error: unknown, stage: string) => logEvent('shortlist.searchPreparation', {
    stage, error: error instanceof Error ? error.message : String(error),
  });
  const recover = () => recovered ??= (async () => {
    try {
      const store = storeSchema.parse(JSON.parse(await readFile(file, 'utf8')));
      for (const record of store.records) if (record.expiresAt > now()) records.set(record.key, record);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) report(error, 'recovery');
    }
  })();
  async function save(record: SearchRecord) {
    for (const [key, value] of records) if (value.expiresAt <= now()) records.delete(key);
    records.delete(record.key);
    records.set(record.key, record);
    while (records.size > 64) records.delete(records.keys().next().value!);
    try {
      await mkdir(dirname(file), { recursive: true });
      await write(JSON.stringify({ version: 1, records: [...records.values()] }));
    } catch (error) { report(error, 'save'); } // Retain the in-memory result even if disk is unavailable.
  }
  async function prepare(key: string, brief: ShortlistSearchBrief, prompt: string): Promise<ShortlistSearch[]> {
    await recover();
    const previous = records.get(key);
    if (previous?.status === 'ready' && previous.expiresAt > now()) return previous.searches;
    if (previous?.status === 'failed' && previous.expiresAt > now()
      && (previous.attempts >= 2 || previous.retryAt > now())) return [];
    try {
      const raw = await generate(prompt);
      const { searches } = shortlistSearchSchema.parse(JSON.parse(extractJson(stripThinking(raw))));
      if (brief.expiresAt <= now()) return [];
      const distinct = searches.filter((search, index) => searches.findIndex(other =>
        other.kind === search.kind && other.query.toLowerCase() === search.query.toLowerCase()) === index);
      await save({ key, expiresAt: brief.expiresAt, status: 'ready', searches: distinct, attempts: 1, retryAt: 0 });
      logEvent('shortlist.searchPreparation', { stage: 'ready', occurrenceId: brief.occurrenceId, searches: distinct });
      return distinct;
    } catch (error) {
      report(error, 'generate');
      if (brief.expiresAt > now()) await save({ key, expiresAt: brief.expiresAt, status: 'failed', searches: [],
        attempts: previous?.status === 'failed' ? Math.min(2, previous.attempts + 1) : 1, retryAt: now() + 5 * 60_000 });
      return [];
    }
  }
  function ensure(brief: ShortlistSearchBrief): Promise<ShortlistSearch[]> {
    if (!brief.occurrenceId || !Number.isFinite(brief.expiresAt) || brief.expiresAt <= now() || !(brief.topic.trim() || brief.editorial?.trim())) return Promise.resolve([]);
    const prompt = shortlistSearchPrompt(brief);
    const key = createHash('sha256').update(JSON.stringify([1, brief.occurrenceId, brief.expiresAt, prompt])).digest('hex');
    const running = pending.get(key);
    if (running) return running;
    const operation = prepare(key, brief, prompt).finally(() => pending.delete(key));
    pending.set(key, operation);
    return operation;
  }
  return { ensure };
}

export const shortlistSearchPreparation = createShortlistSearchPreparation({
  file: `${config.stateDir}/shortlist-search-preparations.json`,
  generate: prompt => djText({
    system: instruction('picker', 'shortlist-search-preparation'), prompt,
    temperature: 0.1, maxOutputTokens: 384, kind: 'djShortlistSearchPreparation',
  }),
});
