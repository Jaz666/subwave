import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openAiTool } from './model-runner.js';

const output = resolve(process.argv[2] ?? 'scripts/functiongemma/training/data-router-v26-controller-initial-validation');
const tool = (name: string, required: readonly string[] = []) => ({ name, required });
const semantic = [tool('searchByLyrics', ['query']), tool('searchBySound', ['query'])];
const complementary = [tool('tracksLikeThis', ['songId']), tool('tracksByMood', ['mood', 'energy']), tool('deepCuts')];
const allTools = [...semantic, tool('tracksTowardJourney'), ...complementary];
const seed = 'V26validation00000001';

const cases = [
  ['sound', 'searchBySound', { query: 'warm cello, muted trumpet and a slow brushed groove' }, 'Find music that sounds like warm cello, muted trumpet and a slow brushed groove. This is audio, not lyric meaning.'],
  ['lyrics', 'searchByLyrics', { query: 'songs about starting over after a long journey' }, 'Find a thematic next track through lyric meaning: songs about starting over after a long journey.'],
  ['journey', 'tracksTowardJourney', {}, 'A sonic journey is active.'],
] as const;

const rows = cases.map(([kind, initialName, initialArguments, request]) => ({
  id: `v26.controller-initial.${kind}-then-complements`,
  stage: 'recover' as const,
  split: 'validation' as const,
  maxRounds: 2,
  description: 'The controller executes the classified initial source with the original request; FunctionGemma chooses two distinct complementary discovery sources.',
  prompt: `${request} The controller has completed that initial lookup. Current track id: ${seed}. Choose a complementary discovery source.`,
  tools: allTools,
  decisionTools: [complementary, complementary],
  controllerInitial: { name: initialName, arguments: initialArguments },
  controllerInitialFollowup: 'Controller policy requests one complementary discovery source. Choose one offered function.',
  mockResults: {
    [initialName]: { tracks: [{ id: 'initial-candidate' }] },
    tracksLikeThis: { tracks: [{ id: 'similar-candidate' }] },
    tracksByMood: { tracks: [{ id: 'mood-candidate' }] },
    deepCuts: { tracks: [{ id: 'deep-candidate' }] },
  },
  followup: 'The first complementary source has returned candidates. Choose one different offered complementary discovery source.',
  route: { firstCallOneOf: [initialName], arguments: initialArguments },
  recovery: { emptyTool: initialName, nextCallOneOf: complementary.map(item => item.name) },
}));

mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'validation.json'), `${JSON.stringify(rows.map(row => ({
  ...row,
  openAiTools: row.tools.map(openAiTool),
  openAiDecisionTools: row.decisionTools.map(tools => tools.map(openAiTool)),
})), null, 2)}\n`);
console.log(`V26 controller-initial validation written to ${output} (${rows.length} scenarios)`);
