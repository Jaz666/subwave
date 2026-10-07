// Wrap each loaded skill tool as toolFn(ctx, state, services, config, input).
// All skills run with a hard timeout and error recovery; failed tools return no data.
// Built-ins and custom skills use the same state/skills loader path.

import { tool } from 'ai';
import { z } from 'zod';
import { buildStationServices } from './station-services.js';

// Stations seeded before a built-in tool changes retain their original tool.mjs.
// Repair known no-evidence shapes here, so an upgrade never has to replace an
// operator-owned skill file just to recover the Direct runtime's stand-down
// contract.
export function normalizeSegmentToolResult(cap: { kind?: unknown } | null | undefined, data: any, input: { query?: unknown } = {}): any {
  if (cap?.kind === 'web-search' && typeof input.query === 'string' && input.query.trim()) return data;
  if (String(cap?.kind || '') === 'news'
      && data?.available === undefined
      && Array.isArray(data?.headlines)
      && data.headlines.length === 0) {
    return { ...data, available: false };
  }
  // Older now-playing-dig and web-search tools accepted any search snippets as
  // usable even when none named the current artist. At 09:55 BST this produced
  // an empty answer plus unrelated results for “Missed the Boat”, then invited
  // the Direct model to air “I'm not aware of any facts”. A title alone is not
  // a safe relevance test — generic titles match unrelated pages — but the
  // exact artist must appear in at least one retained snippet.
  if ((String(cap?.kind || '') === 'now-playing-dig' || String(cap?.kind || '') === 'web-search')
      && data?.available === undefined
      && !String(data?.answer || '').trim()
      && typeof data?.artist === 'string'
      && Array.isArray(data?.sources)
      && !data.sources.some((source: unknown) => String(source).toLocaleLowerCase().includes(data.artist.toLocaleLowerCase()))) {
    return { ...data, available: false };
  }
  return data;
}

// `onResult(kind, data)` reports what each tool handed back, including the
// `{ error }` degradation. The forced segment path needs it because the AGENT
// calls the tool, not the caller: without it, "did this skill actually get
// anything to write from" could only be asserted in the prompt, and a model
// that speaks anyway would face no check (issue #1412). Optional — the
// autonomous director reads the same results in its own window and passes none.
export function buildSegmentTools(
  ctx: any,
  state: any,
  caps: any[],
  { onResult }: { onResult?: (kind: string, data: any) => void } = {},
) {
  const services = buildStationServices();
  const tools: any = {};

  for (const cap of caps as any[]) {
    if (typeof cap.toolFn !== 'function' || !cap.toolName) continue;
    // A skill's optional `inputs` export ({ name: description }) becomes
    // agent-steerable string parameters — nullable (required-but-null, the
    // same convention as the segment schema's sfx field, which small models
    // handle better than optional keys), so a model that passes null still
    // gets the skill's own default behaviour. No `inputs` → the historical
    // zero-arg tool.
    const shape: Record<string, any> = {};
    for (const [name, desc] of Object.entries(cap.toolInputs || {})) {
      shape[name] = z.string().nullable().describe(String(desc));
    }
    tools[cap.toolName] = tool({
      description: cap.toolDesc,
      inputSchema: z.object(shape),
      execute: async (input: any) => {
        let data: any;
        try {
          const p = Promise.resolve(cap.toolFn(ctx, state, services, cap.config, input || {}));
          data = await withTimeout(p, 8000);
        } catch (err: any) {
          data = { error: err?.message || String(err) };
        }
        // Reported inside execute, after the catch, so the observer sees the
        // degraded shape too — a tool that threw is exactly the case the
        // grounding check exists for. A throwing observer must not turn a
        // usable tool result into a tool error.
        data = normalizeSegmentToolResult(cap, data, input || {});
        try { onResult?.(cap.kind, data); } catch { /* observation is never fatal */ }
        return data;
      },
    });
  }

  return tools;
}

// Direct-call variant for the non-agentic segment path (pool mode, where the
// operator's model isn't trusted with tool loops): code invokes the chosen
// capability's data tool itself and inlines the result into a single
// structured-output prompt. Same timeout and same error-shape degradation as
// the agent-facing wrapper above, so a slow or throwing skill yields
// `{ error }` rather than hanging the tick. Inputs are the skill's own
// defaults ({} — the agent-steerable `inputs` params are a tool-loop nicety).
export async function fetchSegmentData(cap: any, ctx: any, state: any): Promise<any> {
  if (typeof cap?.toolFn !== 'function') return null;
  const services = buildStationServices();
  try {
    const p = Promise.resolve(cap.toolFn(ctx, state, services, cap.config, {}));
    return normalizeSegmentToolResult(cap, await withTimeout(p, 8000));
  } catch (err: any) {
    return { error: err?.message || String(err) };
  }
}

// The fetched tool data, rendered into the prompt. Compact but readable;
// capped so a fat feed can't crowd the system prompt out of a small context.
//
// Lives beside fetchSegmentData rather than in skills/_agent.ts because both
// code-driven (pool-mode) callers need it — the segment director and the
// co-hosted discussion path — and skills/cohosted.ts cannot import _agent.js
// without closing an eval-time cycle. _agent.ts re-exports it, so llm-bench
// and every other importer keep their existing path.
export function dataBlock(data: unknown) {
  if (data == null) return '';
  let body: string;
  try { body = JSON.stringify(data, null, 1); } catch { body = String(data); }
  if (body.length > 6000) body = body.slice(0, 6000) + '\n…(truncated)';
  return `\n\nSource data for this segment (write only from this and the current moment — do not invent facts):\n${body}`;
}

// Resolve `p`, or reject after `ms` — keeps any skill's tool.mjs from stalling
// the segment tick indefinitely.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`tool timed out after ${ms}ms`)), ms);
    p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
  });
}
