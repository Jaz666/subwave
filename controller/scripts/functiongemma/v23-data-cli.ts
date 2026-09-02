import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateV23ThreeSourceCorrections } from './v23-three-source.js';

const output = resolve(process.argv[2] ?? 'scripts/functiongemma/training/data-router-v23-three-source-correction');
const train = generateV23ThreeSourceCorrections('train');
const development = generateV23ThreeSourceCorrections('development');
mkdirSync(output, { recursive: true });
for (const [name, rows] of [['train.jsonl', train], ['development.jsonl', development]] as const) writeFileSync(resolve(output, name), `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
writeFileSync(resolve(output, 'manifest.json'), `${JSON.stringify({ format: 'subwave.functiongemma-routing.v23-three-source-correction', counts: { train: train.length, development: development.length }, purpose: 'Train vanilla-compatible initial plus two distinct complementary discovery calls with exact reduced offers per decision.' }, null, 2)}\n`);
console.log(`V23 correction corpus written to ${output}`);
console.log(`train=${train.length} development=${development.length}`);
