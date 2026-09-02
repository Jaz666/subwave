import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openAiTool } from './model-runner.js';

const output = resolve(process.argv[2] ?? 'scripts/functiongemma/training/data-router-v20-controller-transition-correction');
const tool = (name: string, required: readonly string[] = []) => ({ name, required });
const prompt = (id: string) => `A sonic journey is active: call tracksTowardJourney and lean toward its current waypoint. Preserve a reflective medium-energy direction.\n\n${JSON.stringify({ currentTrack: { id, title: 'Signal Path', artist: 'Glass Harbour' }, show: { name: 'Wide Signal', moods: ['reflective'], energies: ['medium'] } }, null, 2)}\n\nController authority: call only a function actually offered in this request. The sonic-journey waypoint function is unavailable for this pick. Do not call tracksTowardJourney; preserve its direction through an offered mood, genre, library, or other available discovery function.`;
const alternatives = [
  ['tracksByMood', [tool('tracksByMood', ['mood', 'energy']), tool('tracksByEnergy', ['energy']), tool('songsByGenre', ['genre']), tool('searchLibrary', ['query'])]],
  ['tracksByEnergy', [tool('tracksByEnergy', ['energy']), tool('tracksByMood', ['mood', 'energy']), tool('searchLibrary', ['query']), tool('randomSongs')]],
  ['searchLibrary', [tool('searchLibrary', ['query']), tool('tracksByMood', ['mood', 'energy']), tool('songsByGenre', ['genre']), tool('randomSongs')]],
  ['showPlaylistTracks', [tool('showPlaylistTracks'), tool('tracksByMood', ['mood', 'energy']), tool('searchLibrary', ['query']), tool('randomSongs')]],
  ['tracksLikeThis', [tool('tracksLikeThis', ['songId']), tool('tracksByMood', ['mood', 'energy']), tool('songsByGenre', ['genre']), tool('randomSongs')]],
] as const;
const validation = [
  ...alternatives.map(([expected, tools], index) => ({
    id: `controller-path.journey-withheld.${index + 1}`, stage: 'route', split: 'validation',
    description: 'Explicit journey instruction with waypoint unavailable.',
    prompt: prompt(`V18journeyFixture${String(index + 1).padStart(6, '0')}`), tools,
    route: { firstCallOneOf: [expected] },
  })),
  {
    id: 'v20.recover.sound-description', stage: 'recover', split: 'validation',
    description: 'Generic controller recovery after empty sound-description search.', prompt: 'Find warm spacious guitar.',
    tools: [tool('searchBySound', ['query']), tool('tracksByMood', ['mood', 'energy']), tool('randomSongs')],
    mockResults: { searchBySound: { tracks: [] } },
    recovery: { emptyTool: 'searchBySound', nextCallOneOf: ['tracksByMood', 'randomSongs'] },
  },
  {
    id: 'v20.recover.artist-copy', stage: 'recover', split: 'validation',
    description: 'Exact artist recovery after empty top songs.', prompt: 'Stay near the exact current artist "Lunar Arcade".',
    tools: [tool('topSongsByArtist', ['artist']), tool('recentByArtist', ['artist']), tool('searchLibrary', ['query']), tool('randomSongs')],
    mockResults: { topSongsByArtist: { tracks: [] } },
    recovery: { emptyTool: 'topSongsByArtist', nextCallOneOf: ['recentByArtist', 'searchLibrary', 'randomSongs'] },
  },
];
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'validation.json'), `${JSON.stringify(validation.map(scenario => ({ ...scenario, openAiTools: scenario.tools.map(openAiTool) })), null, 2)}\n`);
console.log(`V20 validation written to ${output} (${validation.length} scenarios)`);
