// Replays one frozen Agentic picker turn from a saved station session.
//
// It never reads or writes queue state, nor does it call Navidrome. Discovery
// tools return only the candidate results recorded in the original session.
// The fixture's verdict is deliberately about Leanings provenance, not whether
// a model happens to choose the same track as the live run.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import * as settings from '../src/settings.js';
import { djAgent, modelTolerant } from '../src/llm/sdk.js';
import { pickSchema, pickSchemaBase } from '../src/broadcast/dj-agent/schemas.js';

type Fixture = {
  name: string;
  sessionPath: string;
  eventAt: string;
  expected: { usedMusicalLeanings: boolean; tieBreakPatterns: string[]; note: string };
};

type SessionTurn = {
  t: string;
  role: string;
  kind: string;
  text: string;
  meta?: {
    promptSuffix?: string;
    toolCalls?: Array<{ name: string; args: Record<string, unknown>; result: unknown }>;
  };
};

function usage(): never {
  console.error('Usage: npm run leanings:replay -- [fixture-path] [iterations] [baseline|no-tie-break]');
  process.exit(2);
}

function schemaForTool(name: string) {
  if (name === 'tracksByMood') return z.object({ mood: z.string(), energy: z.string().optional() });
  if (name === 'tracksLikeThis') return z.object({ songId: z.string() });
  return z.object({});
}

function buildTools(calls: NonNullable<SessionTurn['meta']>['toolCalls']) {
  return Object.fromEntries(calls.map((call) => [call.name, tool({
    description: `Replay-only ${call.name}; returns the candidates captured in this station run.`,
    inputSchema: schemaForTool(call.name),
    execute: async () => call.result,
  })]));
}

function resultIds(calls: NonNullable<SessionTurn['meta']>['toolCalls']) {
  const ids = new Set<string>();
  for (const call of calls) {
    if (!Array.isArray(call.result)) continue;
    for (const candidate of call.result as Array<{ id?: unknown }>) {
      if (typeof candidate.id === 'string') ids.add(candidate.id);
    }
  }
  return ids;
}

async function main() {
  const [fixtureArg = 'scripts/fixtures/agentic-leanings/dante-porcupine-tree.json', iterationsArg = '5', variant = 'baseline'] = process.argv.slice(2);
  const iterations = Number.parseInt(iterationsArg, 10);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 50 || !['baseline', 'no-tie-break'].includes(variant)) usage();

  const fixture = JSON.parse(await readFile(resolve(fixtureArg), 'utf8')) as Fixture;
  const session = JSON.parse(await readFile(fixture.sessionPath, 'utf8')) as { persona?: { name?: string }; show?: { name?: string; topic?: string }; messages?: SessionTurn[]; turns?: SessionTurn[] };
  // Persisted station sessions use `messages`; retain `turns` as a fallback so
  // exported or older snapshots can be replayed too.
  const turns = session.messages ?? session.turns ?? [];
  const eventIndex = turns.findIndex((turn) => turn.t === fixture.eventAt && turn.role === 'event' && turn.kind === 'pick');
  const event = turns[eventIndex];
  const recordedPick = turns.slice(eventIndex + 1).find((turn) => turn.role === 'dj' && turn.kind === 'pick');
  const calls = recordedPick?.meta?.toolCalls;
  if (!event || !recordedPick || !calls?.length) throw new Error(`fixture event ${fixture.eventAt} is incomplete`);

  await settings.load();
  const candidateIds = resultIds(calls);
  const system = [
    `You are ${session.persona?.name ?? 'the station DJ'}, selecting a record for ${session.show?.name ?? 'the current show'}.`,
    'This is an internal picker decision. Choose only an id returned by a discovery tool. Do not invent ids.',
    session.show?.topic ?? '',
  ].filter(Boolean).join('\n\n');
  const noTieBreak = variant === 'no-tie-break';
  const tieBreakMarker = ' Musical Leanings are supplied for this pick as a soft tie-breaker.';
  const promptSuffix = event.meta?.promptSuffix ?? '';
  const replaySuffix = noTieBreak && promptSuffix.includes(tieBreakMarker)
    ? `${promptSuffix.slice(0, promptSuffix.indexOf(tieBreakMarker))}${tieBreakMarker} Always return "usedMusicalLeanings": default false; set true only when Leanings genuinely settle a close choice between otherwise eligible tracks. Do not return or explain a tie-break trait. Leanings never override show rules, rotation, safety, or musical flow.`
    : promptSuffix;
  const message = `${event.text}\n${replaySuffix}`;
  const schema = noTieBreak
    ? modelTolerant(pickSchemaBase().omit({ leaningsTieBreak: true }))
    : pickSchema();

  console.log(`\n=== Agentic Leanings replay: ${fixture.name} × ${iterations} (${variant}) ===`);
  console.log(`Expected provenance: usedMusicalLeanings=${fixture.expected.usedMusicalLeanings}`);
  console.log(`${fixture.expected.note}\n`);

  let valid = 0;
  let expectedProvenance = 0;
  let expectedEvidence = 0;
  let copiedExample = 0;
  for (let run = 1; run <= iterations; run += 1) {
    try {
      const result = await djAgent({
        system,
        messages: [{ role: 'user', content: message }],
        tools: buildTools(calls),
        schema,
        maxSteps: 4,
        timeoutMs: 90_000,
        kind: 'agenticLeaningsReplay',
      });
      const pick = result.object as { id?: unknown; usedMusicalLeanings?: unknown; leaningsTieBreak?: unknown } | undefined;
      const id = typeof pick?.id === 'string' ? pick.id : null;
      const used = pick?.usedMusicalLeanings === true;
      const tieBreak = typeof pick?.leaningsTieBreak === 'string' ? pick.leaningsTieBreak : null;
      const isValid = !!id && candidateIds.has(id);
      if (isValid) valid += 1;
      if (used === fixture.expected.usedMusicalLeanings) expectedProvenance += 1;
      const evidenceMatches = !noTieBreak && fixture.expected.usedMusicalLeanings
        ? !!tieBreak && fixture.expected.tieBreakPatterns.some((pattern) => new RegExp(pattern, 'i').test(tieBreak))
        : noTieBreak || tieBreak === null;
      if (evidenceMatches) expectedEvidence += 1;
      if (/warm vocal and melodic hook/i.test(tieBreak ?? '')) copiedExample += 1;
      const provenance = used === fixture.expected.usedMusicalLeanings ? 'match' : 'mismatch';
      const evidence = noTieBreak ? 'omitted' : evidenceMatches ? 'match' : 'mismatch';
      console.log(`${isValid ? 'OK  ' : 'BAD '} run ${run}: id=${id ?? '-'} leanings=${used} (${provenance}) evidence=${evidence} tieBreak=${JSON.stringify(tieBreak)}`);
    } catch (error) {
      console.log(`FAIL run ${run}: ${String(error).replace(/\s+/g, ' ').slice(0, 220)}`);
    }
  }

  console.log('\n=== summary ===');
  console.log(`valid picks: ${valid}/${iterations}`);
  console.log(`expected Leanings provenance: ${expectedProvenance}/${iterations}`);
  console.log(noTieBreak
    ? 'expected tie-break evidence: n/a (field omitted)'
    : `expected tie-break evidence: ${expectedEvidence}/${iterations}`);
  if (fixture.expected.usedMusicalLeanings) {
    console.log(`missing Leanings claims: ${iterations - expectedProvenance}/${iterations}`);
  } else {
    console.log(`false Leanings claims: ${iterations - expectedProvenance}/${iterations}`);
  }
  console.log(`copied schema example: ${copiedExample}/${iterations}`);
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exit(1);
});
