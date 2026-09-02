import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openAiTool } from './model-runner.js';
import { COMPLEMENT } from './v23-three-source.js';

const output = resolve(process.argv[2] ?? 'scripts/functiongemma/training/data-router-v23-three-source-correction');
const tool = (name: string, required: readonly string[] = []) => ({ name, required });
const base = [tool('tracksTowardJourney'), tool('searchByLyrics', ['query']), tool('searchBySound', ['query']), tool('tracksLikeThis', ['songId']), tool('tracksByMood', ['mood', 'energy']), tool('deepCuts')];
const seed = 'V23validation00000001';
const cases = [
  ['journey', 'tracksTowardJourney', {}, 'tracksByMood', { mood: 'reflective', energy: null }, 'deepCuts', {}],
  ['sound', 'searchBySound', { query: 'warm spacious guitar with a steady pulse' }, 'deepCuts', {}, 'tracksLikeThis', { songId: seed }],
  ['lyrics', 'searchByLyrics', { query: 'songs about starting over' }, 'tracksLikeThis', { songId: seed }, 'tracksByMood', { mood: 'reflective', energy: null }],
] as const;
const scenarios = cases.map(([kind, first, firstArgs, second, secondArgs, third, thirdArgs]) => ({
  id: `v23.station.${kind}-three-source`, stage: 'recover' as const, split: 'validation' as const, maxRounds: 3,
  description: 'Three controller decisions use distinct sources and each later decision sees only its remaining offered tools.',
  prompt: kind === 'sound' ? `Find music that sounds like warm spacious guitar with a steady pulse. This is audio, not lyric meaning. Current track id: ${seed}.` : `Choose the requested ${kind} discovery source. Current track id: ${seed}.`,
  tools: base, decisionTools: [base, base.filter(tool => tool.name !== first), base.filter(tool => tool.name !== first && tool.name !== second)],
  mockResults: { [first]: { tracks: [{ id: 'one' }] }, [second]: { tracks: [{ id: 'two' }] } }, followup: COMPLEMENT,
  route: { firstCallOneOf: [first], arguments: firstArgs }, recovery: { emptyTool: first, nextCallOneOf: [second] },
}));
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'validation.json'), `${JSON.stringify(scenarios.map(scenario => ({ ...scenario, openAiTools: scenario.tools.map(openAiTool), openAiDecisionTools: scenario.decisionTools.map(tools => tools.map(openAiTool)) })), null, 2)}\n`);
console.log(`V23 validation written to ${output} (${scenarios.length} scenarios)`);
