// Run the real show planner once and print its JSON result without saving or
// preparing a show. Defaults to the first configured DJ and a one-hour slot.
// Usage: npm run show-plan:preview -- [host-persona-id] [template] [direction...]
// Optional env: SHOW_PLAN_PREVIEW_MODEL, LLM_BASE_URL.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotEnv } from 'dotenv';

loadDotEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env'), quiet: true });

const { loadSecretsIntoEnv } = await import('../src/setup/secrets.js');
await loadSecretsIntoEnv().catch(() => {});

const settings = await import('../src/settings.js');
const { generateShowPlan, scheduledShowsForHost } = await import('../src/broadcast/show-generation.js');

async function main() {
  const [hostId, requestedTemplate, ...direction] = process.argv.slice(2);
  if (hostId === '--help' || hostId === '-h') {
    console.error('Usage: npm run show-plan:preview -- [host-persona-id] [dj-choice|deep-discovery] [planning direction...]');
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

  const startsAt = Date.now();
  const endsAt = startsAt + 60 * 60 * 1000;
  const existingShows = scheduledShowsForHost(host.id, 'show-plan-preview');
  const originalLog = console.log;
  let plan: Awaited<ReturnType<typeof generateShowPlan>>;
  try {
    console.log = (...args) => console.error(...args);
    plan = await generateShowPlan({
      occurrence: { id: `preview-${host.id}-${startsAt}`, startsAt, endsAt },
      template,
      planningPrompt: direction.join(' '),
      minimumCoverage: null,
      cast: { hostPersonaId: host.id, guestPersonaIds: [] },
      existingShows,
      show: { id: 'show-plan-preview' },
    });
  } finally {
    console.log = originalLog;
  }

  process.stdout.write(`${JSON.stringify({
    previewOnly: true,
    host: { id: host.id, name: host.name, hasMusicalLeanings: !!String(host.musicLean || '').trim() },
    template,
    model: stationSettings.llm.model,
    existingShows,
    plan,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
