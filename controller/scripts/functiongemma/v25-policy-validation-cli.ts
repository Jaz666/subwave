import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openAiTool } from './model-runner.js';

const output = resolve(process.argv[2] ?? 'scripts/functiongemma/training/data-router-v25-policy-validation');
const tool = (name: string, required: readonly string[] = []) => ({ name, required });
const semantic = [tool('searchByLyrics', ['query']), tool('searchBySound', ['query'])];
const complementary = [tool('tracksLikeThis', ['songId']), tool('tracksByMood', ['mood', 'energy']), tool('deepCuts')];
const seed = 'V25validation00000001';

const cases = [
  ['sound', 'searchBySound', { query: 'warm cello, muted trumpet and a slow brushed groove' }, 'Find music that sounds like warm cello, muted trumpet and a slow brushed groove. This is audio, not lyric meaning.'],
  ['lyrics', 'searchByLyrics', { query: 'songs about starting over after a long journey' }, 'Find a thematic next track through lyric meaning: songs about starting over after a long journey. Copy that lyric/theme query exactly.'],
  ['journey', 'tracksTowardJourney', {}, 'A sonic journey is active. Call tracksTowardJourney first.'],
] as const;

const rows = cases.map(([kind, first, arguments_, prompt]) => {
  const initial = kind === 'journey' ? [tool('tracksTowardJourney')] : semantic.filter(item => item.name === first);
  return {
    id: `v25.policy.${kind}-then-complements`, stage: 'recover' as const, split: 'validation' as const, maxRounds: 3,
    description: 'The controller pins the already-classified initial source; FunctionGemma then chooses distinct neutral complementary discovery sources.',
    prompt: `${prompt} Current track id: ${seed}.`, tools: [...semantic, tool('tracksTowardJourney'), ...complementary],
    decisionTools: [initial, complementary, complementary],
    mockResults: { [first]: { tracks: [{ id: 'one' }] } },
    followup: 'Controller policy requests one complementary discovery source. Choose one different offered function.',
    route: { firstCallOneOf: [first], arguments: arguments_ },
    recovery: { emptyTool: first, nextCallOneOf: complementary.map(item => item.name) },
  };
});

mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'validation.json'), `${JSON.stringify(rows.map(row => ({ ...row, openAiTools: row.tools.map(openAiTool), openAiDecisionTools: row.decisionTools.map(tools => tools.map(openAiTool)) })), null, 2)}\n`);
console.log(`V25 policy validation written to ${output} (${rows.length} scenarios)`);
