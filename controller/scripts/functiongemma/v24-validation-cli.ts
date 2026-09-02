import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openAiTool } from './model-runner.js';
import { COMPLEMENT } from './v24-semantic-three-source.js';

const output = resolve(process.argv[2] ?? 'scripts/functiongemma/training/data-router-v24-semantic-three-source-correction');
const tool = (name: string, required: readonly string[] = []) => ({ name, required });
const base = [tool('tracksTowardJourney'), tool('searchByLyrics', ['query']), tool('searchBySound', ['query']), tool('tracksLikeThis', ['songId']), tool('tracksByMood', ['mood', 'energy']), tool('deepCuts')];
const seed = 'V24validation00000001';
const scenarios = [
  ['sound', 'searchBySound', { query: 'warm cello, muted trumpet and a slow brushed groove' }, 'tracksByMood', 'deepCuts'],
  ['lyrics', 'searchByLyrics', { query: 'songs about starting over after a long journey' }, 'deepCuts', 'tracksLikeThis'],
  ['journey', 'tracksTowardJourney', {}, 'tracksLikeThis', 'tracksByMood'],
] as const;
const policyTools = (kind: string) => kind === 'sound'
  ? base.filter(tool => tool.name !== 'searchByLyrics')
  : kind === 'lyrics'
    ? base.filter(tool => tool.name !== 'searchBySound')
    : base;
const rows = scenarios.map(([kind, first, arguments_, second, third]) => ({
  id: `v24.station.${kind}-three-source`, stage: 'recover' as const, split: 'validation' as const, maxRounds: 3,
  description: 'A three-call controller sequence must retain the requested first source and use two distinct complementary sources from the reduced later offers.',
  prompt: kind === 'sound' ? `Find music that sounds like warm cello, muted trumpet and a slow brushed groove. This is audio, not lyric meaning. Current track id: ${seed}.` : kind === 'lyrics' ? `Find a thematic next track through lyric meaning: songs about starting over after a long journey. Copy that lyric/theme query exactly. Current track id: ${seed}.` : `A sonic journey is active. Call tracksTowardJourney first. Current track id: ${seed}.`,
  tools: base, decisionTools: [policyTools(kind), policyTools(kind).filter(tool => tool.name !== first), policyTools(kind).filter(tool => tool.name !== first)],
  mockResults: { [first]: { tracks: [{ id: 'one' }] } }, followup: COMPLEMENT,
  route: { firstCallOneOf: [first], arguments: arguments_ }, recovery: { emptyTool: first, nextCallOneOf: ['tracksLikeThis', 'tracksByMood', 'deepCuts'] },
}));
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'validation.json'), `${JSON.stringify(rows.map(row => ({ ...row, openAiTools: row.tools.map(openAiTool), openAiDecisionTools: row.decisionTools.map(tools => tools.map(openAiTool)) })), null, 2)}\n`);
console.log(`V24 validation written to ${output} (${rows.length} scenarios)`);
