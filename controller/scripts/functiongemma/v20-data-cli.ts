import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateV20RecoveryCorrections } from './v20-recovery.js';

const output = resolve(process.argv[2] ?? 'scripts/functiongemma/training/data-router-v20-controller-transition-correction');
const train = generateV20RecoveryCorrections('train');
const development = generateV20RecoveryCorrections('development');
mkdirSync(output, { recursive: true });
for (const [name, rows] of [['train.jsonl', train], ['development.jsonl', development]] as const) {
  writeFileSync(resolve(output, name), `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
}
writeFileSync(resolve(output, 'manifest.json'), `${JSON.stringify({
  format: 'subwave.functiongemma-routing.v20-controller-transition-correction',
  counts: { train: train.length, development: development.length },
  purpose: 'Train post-empty controller transitions with the used tool removed from later offered-tool lists.',
}, null, 2)}\n`);
console.log(`V20 correction corpus written to ${output}`);
console.log(`train=${train.length} development=${development.length}`);
