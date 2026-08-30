import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openAiTool } from './model-runner.js';
import {
  generateTrainingExamples,
  validateTrainingSets,
  type FunctionGemmaTrainingExample,
} from './training-data.js';
import type { ToolContract } from './contracts.js';

type Split = 'train' | 'development';

const SELECTOR_SYSTEM = [
  'You are a model that can do function calling with the following functions.',
  'You are the backstage Producer final selector for a live personal radio station.',
  'Choose exactly one surfaced candidate id. Call done with only id.',
  'Never invent a track id. The current track is not a valid pick.',
].join(' ');
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function id(next: () => number) {
  let value = '';
  for (let index = 0; index < 22; index++) value += alphabet[Math.floor(next() * alphabet.length)];
  return value;
}

function shuffle<T>(values: readonly T[], next: () => number) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(next() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function selectorExamples(
  split: Split,
  count: number,
  seed: number,
): FunctionGemmaTrainingExample[] {
  const next = random(seed);
  const examples: FunctionGemmaTrainingExample[] = [];
  for (let index = 0; index < count; index++) {
    const current = {
      id: id(next),
      title: `Current Signal ${index + 1}`,
      artist: `Current Artist ${index + 1}`,
      energy: index % 2 ? 'high' : 'medium',
    };
    const candidates = [
      {
        id: id(next),
        title: `Same Artist ${index + 1}`,
        artist: current.artist,
        energy: current.energy,
        style: 'familiar lead single',
        bpm: 128,
        unaired: false,
        play_count: 12,
        rotation: 'frequent',
      },
      {
        id: id(next),
        title: `Quiet Step ${index + 1}`,
        artist: `New Artist A ${index + 1}`,
        energy: 'low',
        style: 'reflective acoustic album track',
        bpm: 76,
        unaired: true,
        play_count: 0,
        rotation: 'never aired',
      },
      {
        id: id(next),
        title: `Steady Step ${index + 1}`,
        artist: `New Artist B ${index + 1}`,
        energy: 'medium',
        style: 'compatible album track',
        bpm: 104,
        unaired: true,
        play_count: 0,
        rotation: 'never aired',
      },
      {
        id: id(next),
        title: `Peak Step ${index + 1}`,
        artist: `New Artist C ${index + 1}`,
        energy: 'high',
        style: 'club pop lead single',
        bpm: 168,
        unaired: false,
        play_count: 7,
        rotation: 'frequent',
      },
    ];
    const family = index % 6;
    const target = family === 1 || family === 3 ? candidates[2] : candidates[1];
    const instruction = [
      'The current artist must not repeat. Choose a grounded different-artist candidate that deliberately lowers the energy.',
      'Keep a medium, steady flow. Choose a grounded different-artist candidate; do not jump to the high-energy club track.',
      'Preserve an intimate, low-energy acoustic flow. Choose the compatible quiet candidate, never the metal or club-style jump.',
      'Show brief: prefer overlooked album tracks to obvious singles. Choose a fresh compatible album track that has never aired.',
      'Controller veto: the initial same-artist choice is forbidden. Re-pick one eligible surfaced candidate; favour a fresh, lower-energy change.',
      'Artist variety and quiet continuity both matter. Do not choose the current artist or the high-energy candidate.',
    ][family];
    const done: ToolContract = {
      name: 'done',
      required: ['id'],
      enums: { id: candidates.map(candidate => candidate.id) },
    };
    examples.push({
      id: `${split}.select.${family === 2 ? 'veto-repick' : 'final'}.${index}`,
      split,
      family: family === 2 ? 'select.veto-repick' : 'select.final',
      messages: [
        { role: 'developer', content: SELECTOR_SYSTEM },
        {
          role: 'user',
          content: `${instruction}\n\n${JSON.stringify({ currentTrack: current, candidates }, null, 2)}`,
        },
        {
          role: 'assistant',
          tool_calls: [
            { type: 'function', function: { name: 'done', arguments: { id: target.id } } },
          ],
        },
      ],
      tools: [openAiTool(done)],
    });
  }
  return examples;
}

function hybrid(split: Split, count: number) {
  const selectionCount = Math.round(count * 0.25);
  const routing = generateTrainingExamples(split, count - selectionCount);
  const selection = selectorExamples(
    split,
    selectionCount,
    split === 'train' ? 0x91a7c3 : 0x1ec04d,
  );
  return shuffle([...routing, ...selection], random(split === 'train' ? 0xd11ce : 0xbee71));
}

function option(name: string, fallback: number) {
  const at = process.argv.indexOf(name);
  const value = at >= 0 ? Number(process.argv[at + 1]) : fallback;
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

const outAt = process.argv.indexOf('--out');
const output = resolve(
  outAt >= 0 ? process.argv[outAt + 1] : 'scripts/functiongemma/training/data/router-v11-hybrid',
);
const train = hybrid('train', option('--train-count', 3_000));
const development = hybrid('development', option('--development-count', 500));
const validation = validateTrainingSets(train, development);
mkdirSync(output, { recursive: true });
for (const [name, rows] of [
  ['train.jsonl', train],
  ['development.jsonl', development],
] as const) {
  writeFileSync(resolve(output, name), `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
}
writeFileSync(
  resolve(output, 'manifest.json'),
  `${JSON.stringify(
    {
      format: 'subwave.functiongemma-hybrid.v11',
      generatedAt: new Date().toISOString(),
      counts: { train: train.length, development: development.length },
      ...validation,
    },
    null,
    2,
  )}\n`,
);
console.log(`FunctionGemma hybrid data written to ${output}`);
for (const [family, count] of Object.entries(validation.families))
  console.log(`${family.padEnd(42)} ${count}`);
