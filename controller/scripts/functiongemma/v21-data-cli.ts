import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateV21ArtistFormatCorrections } from './v21-artist-format.js';

const output = resolve(process.argv[2] ?? 'scripts/functiongemma/training/data-router-v21-q8-artist-format-correction');
const train = generateV21ArtistFormatCorrections('train');
const development = generateV21ArtistFormatCorrections('development');
mkdirSync(output, { recursive: true });
for (const [name, rows] of [['train.jsonl', train], ['development.jsonl', development]] as const) {
  writeFileSync(resolve(output, name), `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
}
writeFileSync(resolve(output, 'manifest.json'), `${JSON.stringify({
  format: 'subwave.functiongemma-routing.v21-q8-artist-format-correction',
  counts: { train: train.length, development: development.length },
  purpose: 'Repair malformed Q8 artist argument envelopes after empty top-songs recovery.',
}, null, 2)}\n`);
console.log(`V21 correction corpus written to ${output}`);
console.log(`train=${train.length} development=${development.length}`);
