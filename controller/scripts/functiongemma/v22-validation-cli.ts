import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openAiTool } from './model-runner.js';
import { COMPLEMENT } from './v22-search-routing.js';
const output = resolve(process.argv[2] ?? 'scripts/functiongemma/training/data-router-v22-search-routing-correction');
const tool = (name: string, required: readonly string[] = []) => ({ name, required });
const base = [tool('tracksTowardJourney'), tool('searchByLyrics', ['query']), tool('searchBySound', ['query']), tool('tracksLikeThis', ['songId']), tool('tracksByMood', ['mood', 'energy']), tool('deepCuts')];
const seed = 'V22validation00000001';
const scenarios = [
  {
    id: 'v22.station.journey-complement', stage: 'recover', split: 'validation', maxRounds: 2,
    description: 'Successful journey discovery must be followed by a different offered complementary source.',
    prompt: `Operational pick request: a sonic journey is active. Call tracksTowardJourney and lean toward its current waypoint. Current track id: ${seed}.`,
    tools: base, mockResults: { tracksTowardJourney: { tracks: [{ id: 'journey-1' }] } }, followup: COMPLEMENT,
    route: { firstCallOneOf: ['tracksTowardJourney'] }, recovery: { emptyTool: 'tracksTowardJourney', nextCallOneOf: ['tracksLikeThis'] },
  },
  {
    id: 'v22.station.sound-not-lyrics', stage: 'recover', split: 'validation', maxRounds: 2,
    description: 'A sound description uses searchBySound, never searchByLyrics, then changes offered tool.',
    prompt: `Operational pick request: find music that sounds like warm spacious guitar with a steady pulse. This is an audio description, not a lyric theme. Current track id: ${seed}.`,
    tools: base, mockResults: { searchBySound: { tracks: [{ id: 'sound-1' }] } }, followup: COMPLEMENT,
    route: { firstCallOneOf: ['searchBySound'], arguments: { query: 'warm spacious guitar with a steady pulse' } }, recovery: { emptyTool: 'searchBySound', nextCallOneOf: ['tracksLikeThis'] },
  },
  {
    id: 'v22.station.lyrics-not-sound', stage: 'recover', split: 'validation', maxRounds: 2,
    description: 'A lyric-theme request retains valid searchByLyrics use, then changes offered tool.',
    prompt: `Operational pick request: find a thematic next track through lyric meaning: songs about starting over. This is a lyric/theme request, not an audio description. Current track id: ${seed}.`,
    tools: base, mockResults: { searchByLyrics: { tracks: [{ id: 'lyric-1' }] } }, followup: COMPLEMENT,
    route: { firstCallOneOf: ['searchByLyrics'], arguments: { query: 'songs about starting over' } }, recovery: { emptyTool: 'searchByLyrics', nextCallOneOf: ['tracksLikeThis'] },
  },
];
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'validation.json'), `${JSON.stringify(scenarios.map(scenario => ({ ...scenario, openAiTools: scenario.tools.map(openAiTool) })), null, 2)}\n`);
console.log(`V22 validation written to ${output} (${scenarios.length} scenarios)`);
