import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateV24SemanticThreeSourceCorrections } from './v24-semantic-three-source.js';

const output = resolve(process.argv[2] ?? 'scripts/functiongemma/training/data-router-v24-semantic-three-source-correction');
const train = generateV24SemanticThreeSourceCorrections('train');
const development = generateV24SemanticThreeSourceCorrections('development');
mkdirSync(output, { recursive: true });
for (const [name, rows] of [['train.jsonl', train], ['development.jsonl', development]] as const) writeFileSync(resolve(output, name), `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
writeFileSync(resolve(output, 'manifest.json'), `${JSON.stringify({ format: 'subwave.functiongemma-routing.v24-semantic-three-source-correction', counts: { train: train.length, development: development.length }, purpose: 'Preserve shrinking vanilla offers while repairing sound-versus-lyric routing and exact lyric-query copying.' }, null, 2)}\n`);
console.log(`V24 correction corpus written to ${output}`);
console.log(`train=${train.length} development=${development.length}`);
