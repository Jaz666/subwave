import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateV18AvailabilityCorrections, V18_CONTROLLER_PATH_FIXTURES } from './v18-availability.js';

const output = resolve(process.argv[2] ?? 'scripts/functiongemma/training/data-router-v18-availability-correction');
const train = generateV18AvailabilityCorrections('train');
const development = generateV18AvailabilityCorrections('development');
mkdirSync(output, { recursive: true });
for (const [name, rows] of [['train.jsonl', train], ['development.jsonl', development]] as const) writeFileSync(resolve(output, name), `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
writeFileSync(resolve(output, 'validation.json'), `${JSON.stringify(V18_CONTROLLER_PATH_FIXTURES, null, 2)}\n`);
writeFileSync(resolve(output, 'manifest.json'), `${JSON.stringify({ format: 'subwave.functiongemma-routing.v18-availability-correction', counts: { train: train.length, development: development.length, controllerPathFixtures: V18_CONTROLLER_PATH_FIXTURES.length } }, null, 2)}\n`);
console.log(`V18 availability correction corpus written to ${output}`);
