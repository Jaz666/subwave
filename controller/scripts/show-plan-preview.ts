// Preview the production planner, an isolated single-call alternative, or both.
// Never saves plans or prepares scheduled shows; diagnostics are read-only. Defaults to the first configured DJ and a one-hour slot.
// Usage: npm run show-plan:preview -- [host-persona-id] [template] [direction...]
// Optional env: SHOW_PLAN_PREVIEW_MODEL, LLM_BASE_URL.

import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { config as loadDotEnv } from 'dotenv';

loadDotEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env'), quiet: true });

const { loadSecretsIntoEnv } = await import('../src/setup/secrets.js');
await loadSecretsIntoEnv().catch(() => {});
const { loadNavidromeConfig } = await import('../src/setup/config.js');
await loadNavidromeConfig();

const settings = await import('../src/settings.js');
const { recentCalls } = await import('../src/llm/log.js');
const { generateSingleCallPreview } = await import('./show-plan-single.js');
const { generateCompactTwoCallPreview } = await import('./show-plan-compact.js');
const { diagnoseShowCandidates } = await import('../src/music/show-candidates.js');
const { generateShowPlan, scheduledShowsForHost } = await import('../src/broadcast/show-generation.js');

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      planner: { type: 'string', default: 'current' },
      hours: { type: 'string', default: '1' },
      guests: { type: 'string', default: '' },
      runs: { type: 'string', default: '1' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [hostId, requestedTemplate, ...direction] = positionals;
  if (values.help) {
    console.error('Usage: npm run show-plan:preview -- [host-persona-id] [dj-choice|deep-discovery] [planning direction...] [--planner current|single|compact|compare|compare-compact] [--hours 2] [--guests id,id] [--runs 1]');
    return;
  }

  await settings.load();
  const stationSettings = settings.get();
  stationSettings.llm.provider = 'openai-compatible';
  stationSettings.llm.model = process.env.SHOW_PLAN_PREVIEW_MODEL || '/models/Meta-Llama-3.1-8B-Instruct-Q5_K_M.gguf';
  stationSettings.llm.baseUrl = process.env.LLM_BASE_URL || 'http://qwen-llama-cpp:8080/v1';
  stationSettings.llm.compatibleMode = 'local';
  const personas = settings.get().personas ?? [];
  const host = hostId
    ? personas.find((persona: any) => persona.id === hostId)
    : personas.find((persona: any) => typeof persona.soul === 'string' && persona.soul.trim());
  if (!host) {
    const available = personas.map((persona: any) => `${persona.name} (${persona.id})`).join(', ');
    throw new Error(hostId
      ? `Unknown host ${hostId}. Available DJs: ${available || '(none)'}`
      : 'No configured DJs have a Soul to plan from.');
  }

  const template = requestedTemplate || 'dj-choice';
  if (!['dj-choice', 'deep-discovery'].includes(template)) {
    throw new Error(`Unknown template ${template}`);
  }

  const hours = Number(values.hours);
  const runs = Number(values.runs);
  if (!['current', 'single', 'compact', 'compare', 'compare-compact'].includes(values.planner!)) throw new Error('planner must be current, single, compact, compare or compare-compact');
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) throw new Error('hours must be greater than 0 and at most 24');
  if (!Number.isInteger(runs) || runs < 1 || runs > 5) throw new Error('runs must be an integer from 1 to 5');
  const guestIds = [...new Set(values.guests!.split(',').filter(Boolean))];
  if (guestIds.length > 3 || guestIds.some(id => id === host.id || !personas.some(p => p.id === id))) throw new Error('guests must name up to three existing DJs other than the host');
  const startsAt = Date.now();
  const existingShows = scheduledShowsForHost(host.id, 'show-plan-preview');
  const input = {
    occurrence: { id: `preview-${host.id}-${startsAt}`, startsAt, endsAt: startsAt + hours * 3_600_000 },
    template, planningPrompt: direction.join(' '), minimumCoverage: null,
    cast: { hostPersonaId: host.id, guestPersonaIds: guestIds },
    existingShows, show: { id: 'show-plan-preview' },
  };
  const results: Array<{ ok: boolean } & Record<string, unknown>> = [];
  const originalLog = console.log;
  try {
    console.log = (...args) => console.error(...args);
    for (let run = 1; run <= runs; run++) {
      for (const planner of values.planner === 'compare' ? ['current', 'single']
        : values.planner === 'compare-compact' ? ['current', 'compact'] : [values.planner!]) {
        const before = recentCalls.length;
        const started = performance.now();
        let plan: Awaited<ReturnType<typeof generateShowPlan>> | undefined;
        let error: string | undefined;
        try {
          plan = await (planner === 'single' ? generateSingleCallPreview
            : planner === 'compact' ? generateCompactTwoCallPreview : generateShowPlan)(input);
        } catch (err) { error = err instanceof Error ? err.message : String(err); }
        const elapsedMs = Math.round(performance.now() - started);
        const calls = recentCalls.slice(0, recentCalls.length - before).reverse();
        const reported = calls.filter(c => Number.isFinite(c.usage?.input) && Number.isFinite(c.usage?.output));
        // SDK per-call meters already aggregate tool/JSON recovery attempts.
        const usage = {
          input: reported.reduce((n, c) => n + c.usage.input, 0),
          output: reported.reduce((n, c) => n + c.usage.output, 0),
          total: reported.reduce((n, c) => n + (c.usage.total ?? c.usage.input + c.usage.output), 0),
          complete: calls.length > 0 && reported.length === calls.length,
        };
        let coverage;
        let coverageError;
        if (plan) {
          try { coverage = await diagnoseShowCandidates({ ...input.show, ...plan }, { at: startsAt, showId: null }); }
          catch (err) { coverageError = err instanceof Error ? err.message : String(err); }
        }
        const coverageReliable = !!coverage && !coverage.warnings.some(warning => /could not resolve|not an active lock|not counted|could be resolved/i.test(warning));
        results.push({ run, planner, ok: !!plan, elapsedMs, usage,
          calls: calls.map(c => ({ kind: c.kind, ok: c.ok, via: c.via, model: c.model, usage: c.usage, error: c.error,
            ...(c.kind === 'generateShowPlan.previewCompactConcept' ? { response: c.response } : {}) })),
          ...(plan ? { plan } : { error }), coverage, coverageReliable, coverageError });
      }
    }
  } finally { console.log = originalLog; }
  process.stdout.write(`${JSON.stringify({
    previewOnly: true,
    host: { id: host.id, name: host.name, hasMusicalLeanings: !!String(host.musicLean || '').trim() },
    guests: guestIds, template, hours, model: stationSettings.llm.model, existingShows, results,
  }, null, 2)}\n`);
  if (results.some(result => !result.ok)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
