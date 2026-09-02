import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateV19AvailabilityCorrections } from './v19-availability.js';

const output = resolve(process.argv[2] ?? 'scripts/functiongemma/training/data-router-v19-availability-correction');
const train = generateV19AvailabilityCorrections('train');
const development = generateV19AvailabilityCorrections('development');
mkdirSync(output, { recursive: true });
for (const [name, rows] of [['train.jsonl', train], ['development.jsonl', development]] as const) writeFileSync(resolve(output, name), `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
writeFileSync(resolve(output, 'manifest.json'), `${JSON.stringify({ format: 'subwave.functiongemma-routing.v19-availability-correction', counts: { train: train.length, development: development.length } }, null, 2)}\n`);
console.log(`V19 availability correction corpus written to ${output}`);
