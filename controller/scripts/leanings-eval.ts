// Offline paired evaluation for Musical Leanings.
//
// This deliberately runs outside the broadcast pipeline. It uses a fresh
// STATE_DIR, frozen discovery-tool results, and the production Agentic schema
// and tool-loop. It never touches the queue, session, library, scrobbling, or
// the station's persistent telemetry.
//
// Usage (from controller/):
//   npm run leanings-eval -- --models openai:gpt-5.4-mini --iterations 8
//   npm run leanings-eval -- --models openai:gpt-5.4-mini,ollama:qwen3:8b --iterations 5
//
// The target model's normal credentials must be available in the environment
// (for example OPENAI_API_KEY). Reports default to
// scripts/leanings-eval/reports/, which is intentionally separate from state.

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';

// This must happen before any controller import: config.ts captures STATE_DIR
// at module evaluation time, and the LLM telemetry writer uses that config.
// The evaluator may leave disposable telemetry in this temporary directory,
// but cannot append to the live station's events or token budget.
const evaluationStateDir = mkdtempSync(join(tmpdir(), 'subwave-leanings-eval-'));
process.env.STATE_DIR = evaluationStateDir;

type Candidate = {
  id: string;
  title: string;
  artist: string;
  album: string;
  year: number;
  genre: string;
  moods: string[];
  energy: string;
  /** Explicit fixture evidence, available to the model through discovery. */
  editorialFit: string;
};

type Scenario = {
  name: string;
  current: { title: string; artist: string };
  hostLeanings: string;
  /** A badge would be a false positive in this scenario. */
  expectNoLeanings?: boolean;
  candidates: Candidate[];
};

type EditorialLeaningsContext = {
  host: string | null;
  guest: null;
  promptValue: string | null;
};

const SCENARIOS: Scenario[] = [
  {
    name: 'electronic-close-call',
    current: { title: 'Breathe', artist: 'The Prodigy' },
    hostLeanings: 'Favour electronic music, especially synth-pop, leftfield production, unusual textures and deeper discoveries.',
    candidates: [
      { id: 'eval-electronic-1', title: 'Circuit Bloom', artist: 'Signal Glass', album: 'Night Lines', year: 2019, genre: 'synth-pop', moods: ['night', 'driving'], energy: 'high', editorialFit: 'synth-pop with unusual electronic textures and a distinctive production' },
      { id: 'eval-electronic-2', title: 'Open Road', artist: 'Northbound', album: 'Headlights', year: 2020, genre: 'indie rock', moods: ['night', 'driving'], energy: 'high', editorialFit: 'driving guitars and a direct singalong chorus' },
      { id: 'eval-electronic-3', title: 'Soft Landing', artist: 'Halogen', album: 'Afterimage', year: 2018, genre: 'electronic', moods: ['night'], energy: 'medium', editorialFit: 'warm pads but a gentler energy drop' },
    ],
  },
  {
    name: 'warm-melody-close-call',
    current: { title: 'The Bitterest Pill', artist: 'The Jam' },
    hostLeanings: 'Favour warm voices, strong melodies, melodic post-punk and indie discoveries.',
    candidates: [
      { id: 'eval-melody-1', title: 'Gold Thread', artist: 'The Lanterns', album: 'Small Hours', year: 2021, genre: 'post-punk', moods: ['reflective'], energy: 'medium', editorialFit: 'warm lead vocal and a strong melodic post-punk hook' },
      { id: 'eval-melody-2', title: 'Grey Parade', artist: 'Static Youth', album: 'Side Streets', year: 2020, genre: 'post-punk', moods: ['reflective'], energy: 'medium', editorialFit: 'angular guitar lines and a detached vocal' },
      { id: 'eval-melody-3', title: 'Slow Signal', artist: 'Lowlight', album: 'Distant Rooms', year: 2022, genre: 'ambient', moods: ['reflective'], energy: 'low', editorialFit: 'atmospheric but noticeably lower energy' },
    ],
  },
  {
    name: 'obvious-flow-no-tie',
    current: { title: 'Lullaby', artist: 'The Cure' },
    hostLeanings: 'Favour electronic music, unusual textures and deep cuts.',
    expectNoLeanings: true,
    candidates: [
      { id: 'eval-obvious-1', title: 'Night Run', artist: 'Neon Field', album: 'Pulse', year: 2021, genre: 'electronic', moods: ['night'], energy: 'medium', editorialFit: 'an electronic fit, but it makes a sharp energy jump from the current track' },
      { id: 'eval-obvious-2', title: 'After the Rain', artist: 'Quiet Maps', album: 'Stillness', year: 2019, genre: 'dream pop', moods: ['night', 'reflective'], energy: 'low', editorialFit: 'the only candidate matching the current low-energy reflective flow' },
      { id: 'eval-obvious-3', title: 'Crowd Control', artist: 'Street Lamps', album: 'Friday', year: 2020, genre: 'punk', moods: ['energetic'], energy: 'high', editorialFit: 'a high-energy genre and mood clash' },
    ],
  },
];

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const match = argv[i].match(/^--([a-z-]+)$/);
    if (match) args[match[1]] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
  }
  return args;
}

function usage(message?: string): never {
  if (message) console.error(`error: ${message}\n`);
  console.error('Usage: npm run leanings-eval -- --models provider:model[,provider:model...] [--iterations N] [--dry-run] [--out report.json]');
  process.exit(2);
}

function modelSpecs(raw: string) {
  return raw.split(',').map((spec) => {
    const trimmed = spec.trim();
    const separator = trimmed.indexOf(':');
    if (separator < 1 || separator === trimmed.length - 1) usage(`bad model spec "${trimmed}" — expected provider:model`);
    return { label: trimmed, provider: trimmed.slice(0, separator), model: trimmed.slice(separator + 1) };
  });
}

function frozenTools(candidates: Candidate[]) {
  const seen = new Map<string, Candidate>();
  const reveal = () => {
    for (const candidate of candidates) seen.set(candidate.id, candidate);
    return candidates;
  };
  const tools = {
    tracksTowardJourney: tool({
      description: 'Frozen evaluation candidates that move naturally from the current track. Compare all eligible results before committing.',
      inputSchema: z.object({}),
      execute: async () => reveal(),
    }),
    tracksByMood: tool({
      description: 'Frozen evaluation candidates that fit a requested mood. Compare all eligible results before committing.',
      inputSchema: z.object({ mood: z.string() }),
      execute: async () => reveal(),
    }),
    randomSongs: tool({
      description: 'Frozen evaluation candidates. Use only as a final comparison source.',
      inputSchema: z.object({}),
      execute: async () => reveal(),
    }),
  };
  return { tools, seen };
}

function messagesFor(scenario: Scenario, reminder: string) {
  return [{
    role: 'user' as const,
    content: `Now playing "${scenario.current.title}" by ${scenario.current.artist}. Pick the track to play next. This is an offline evaluation: stay silent, make no listener-facing link, and select only a discovered candidate.${reminder}`,
  }];
}

function safeReason(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function fixtureSupport(candidate: Candidate | undefined, reason: string) {
  if (!candidate || !reason) return false;
  const words = candidate.editorialFit.toLowerCase().match(/[a-z]{4,}/g) || [];
  const lower = reason.toLowerCase();
  return words.some((word) => lower.includes(word));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.models) usage('--models is required');
  const iterations = Math.max(1, Number.parseInt(args.iterations || '5', 10) || 5);
  const models = modelSpecs(args.models);
  const defaultOut = join('scripts', 'leanings-eval', 'reports', `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const outPath = resolve(args.out || defaultOut);

  // Lets an operator inspect exactly what will be exercised, with no provider
  // request and no controller import. It also gives this CLI a cheap safety
  // test that is independent of credentials and network availability.
  if (args['dry-run'] === 'true') {
    const plan = {
      meta: {
        dryRun: true,
        stateIsolation: true,
        models: models.map((model) => model.label),
        iterations,
        scenarios: SCENARIOS.map(({ name, expectNoLeanings }) => ({ name, expected: expectNoLeanings ? 'no-leanings' : 'close-call' })),
      },
      plannedRuns: models.length * SCENARIOS.length * iterations * 2,
    };
    mkdirSync(resolve(outPath, '..'), { recursive: true });
    writeFileSync(outPath, JSON.stringify(plan, null, 2));
    console.log(`Dry run: ${plan.plannedRuns} paired-arm calls planned; no provider request made.`);
    console.log(`Plan: ${outPath}`);
    return;
  }

  // Dynamic imports happen only after STATE_DIR has been isolated above.
  const settings = await import('../src/settings.js');
  const { djAgent } = await import('../src/llm/sdk.js');
  const { pickSchema, pickSystem, musicalLeaningsPickReminder, resolvedMusicalLeaningsFlag } = await import('../src/broadcast/dj-agent/schemas.js');

  await settings.load();
  const cfg: any = settings.get();
  cfg.llm.fallback = { ...(cfg.llm.fallback || {}), enabled: false };

  const records: any[] = [];
  console.log(`\nLeanings evaluation: ${models.length} model(s) × ${SCENARIOS.length} scenarios × ${iterations} paired runs`);
  console.log(`Isolated STATE_DIR: ${evaluationStateDir}`);

  for (const target of models) {
    cfg.llm.provider = target.provider;
    cfg.llm.model = target.model;
    cfg.llm.reasoning = false;
    // The direct OpenAI provider reads apiKey from this in-memory config. Do
    // not write it to settings; a caller can instead provide it in the normal
    // environment used by the controller.
    if (target.provider === 'openai' && process.env.OPENAI_API_KEY) cfg.llm.apiKey = process.env.OPENAI_API_KEY;

    for (const scenario of SCENARIOS) {
      for (let iteration = 1; iteration <= iterations; iteration++) {
        for (const arm of ['control', 'leanings'] as const) {
          const context: EditorialLeaningsContext | null = arm === 'leanings'
            ? { host: scenario.hostLeanings, guest: null, promptValue: `Host: ${scenario.hostLeanings}` }
            : null;
          const reminder = context ? musicalLeaningsPickReminder(context) : '';
          const { tools, seen } = frozenTools(scenario.candidates);
          const started = Date.now();
          const record: any = {
            model: target.label,
            scenario: scenario.name,
            arm,
            iteration,
            expected: scenario.expectNoLeanings ? 'no-leanings' : 'close-call',
            outcome: 'ok',
            violations: [] as string[],
          };
          try {
            const result = await djAgent({
              system: pickSystem(null, true, false, context),
              messages: messagesFor(scenario, reminder),
              tools,
              schema: pickSchema(),
              maxSteps: 2,
              providerDiscoveryBudget: true,
              // This label makes accidental use easy to identify even inside
              // the evaluator's disposable telemetry.
              kind: 'leaningsEvalPick',
              validate: (object: any) => !!(object?.id && seen.has(object.id)),
            });
            const object: any = result.object;
            const selected = seen.get(object?.id);
            const reason = safeReason(object?.reason);
            const verifiedLeanings = resolvedMusicalLeaningsFlag(context, object?.usedMusicalLeanings, reason);
            record.selected = selected ? { id: selected.id, title: selected.title, artist: selected.artist, editorialFit: selected.editorialFit } : null;
            record.reason = reason;
            record.rawUsedMusicalLeanings = object?.usedMusicalLeanings ?? null;
            record.verifiedLeanings = verifiedLeanings;
            record.reasonSupportsSelectedFixture = fixtureSupport(selected, reason);
            record.steps = result.steps;
            record.toolCalls = result.toolCalls?.length ?? 0;
            if (!selected) record.violations.push('hallucinated-id');
            if (arm === 'control' && verifiedLeanings) record.violations.push('leanings-without-context');
            if (scenario.expectNoLeanings && verifiedLeanings) record.violations.push('leanings-without-close-call');
            if (verifiedLeanings && !record.reasonSupportsSelectedFixture) record.violations.push('unsupported-leanings-rationale');
            if (record.violations.length) record.outcome = 'violation';
          } catch (error: any) {
            record.outcome = 'thrown';
            record.error = String(error?.message || error);
          }
          record.ms = Date.now() - started;
          records.push(record);
          console.log(`  ${target.label}  ${scenario.name}/${arm} #${iteration}  ${record.outcome}  ${(record.ms / 1000).toFixed(1)}s`);
        }
      }
    }
  }

  const pairs = models.flatMap((target) => SCENARIOS.flatMap((scenario) => Array.from({ length: iterations }, (_, index) => {
    const iteration = index + 1;
    const control = records.find((r) => r.model === target.label && r.scenario === scenario.name && r.iteration === iteration && r.arm === 'control');
    const leanings = records.find((r) => r.model === target.label && r.scenario === scenario.name && r.iteration === iteration && r.arm === 'leanings');
    return {
      model: target.label,
      scenario: scenario.name,
      iteration,
      controlId: control?.selected?.id ?? null,
      leaningsId: leanings?.selected?.id ?? null,
      choiceChanged: !!control?.selected?.id && !!leanings?.selected?.id && control.selected.id !== leanings.selected.id,
      verifiedLeanings: leanings?.verifiedLeanings === true,
    };
  })));
  const verified = records.filter((r) => r.arm === 'leanings' && r.verifiedLeanings).length;
  const leaningsRuns = records.filter((r) => r.arm === 'leanings').length;
  const changed = pairs.filter((p) => p.choiceChanged).length;
  const completePairs = pairs.filter((p) => p.controlId && p.leaningsId).length;
  const report = {
    meta: {
      startedAt: new Date().toISOString(),
      stateIsolation: true,
      models: models.map((model) => model.label),
      iterations,
      scenarios: SCENARIOS.map(({ name, expectNoLeanings }) => ({ name, expected: expectNoLeanings ? 'no-leanings' : 'close-call' })),
    },
    summary: {
      verifiedLeanings: `${verified}/${leaningsRuns}`,
      changedChoices: `${changed}/${completePairs}`,
      violations: records.filter((r) => r.outcome === 'violation').length,
      failures: records.filter((r) => r.outcome === 'thrown').length,
    },
    records,
    pairs,
  };
  mkdirSync(resolve(outPath, '..'), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nVerified Leanings: ${report.summary.verifiedLeanings}; changed paired choices: ${report.summary.changedChoices}`);
  console.log(`Report: ${outPath}`);
}

await main();
