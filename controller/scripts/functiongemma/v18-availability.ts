import { openAiTool } from './model-runner.js';
import type { FunctionGemmaScenario, ToolContract } from './contracts.js';

type Split = 'train' | 'development';

const DEVELOPER = 'You are a model that can do function calling with the following functions. You are the backstage Producer Router for a live personal radio station. Use exactly one offered function at each decision point. Never invent a track id. The current track is a discovery seed, not a valid pick.';
const JOURNEY_CONFLICT = 'A sonic journey is active: call tracksTowardJourney and lean toward its current waypoint. Preserve a reflective medium-energy direction.';
const CONTROLLER_AUTHORITY = 'Controller authority: call only a function actually offered in this request. The sonic-journey waypoint function is unavailable for this pick. Do not call tracksTowardJourney; preserve its direction through an offered mood, genre, library, or other available discovery function.';

const contracts: Record<string, ToolContract> = {
  showPlaylistTracks: { name: 'showPlaylistTracks' },
  tracksByMood: { name: 'tracksByMood', required: ['mood', 'energy'], enums: { mood: ['energetic', 'calm', 'reflective', 'celebratory', 'romantic', 'spiritual', 'focus', 'workout', 'driving', 'cooking', 'rainy', 'sunny', 'night', 'morning', 'evening', 'festival', 'cultural'], energy: ['low', 'medium', 'high', null] } },
  tracksByEnergy: { name: 'tracksByEnergy', required: ['energy'], enums: { energy: ['low', 'medium', 'high'] } },
  songsByGenre: { name: 'songsByGenre', required: ['genre'] },
  searchLibrary: { name: 'searchLibrary', required: ['query'] },
  tracksLikeThis: { name: 'tracksLikeThis', required: ['songId'] },
  randomSongs: { name: 'randomSongs' },
};

const alternatives = [
  { name: 'tracksByMood', args: { mood: 'reflective', energy: 'medium' }, names: ['tracksByMood', 'tracksByEnergy', 'songsByGenre', 'searchLibrary'] },
  { name: 'tracksByEnergy', args: { energy: 'medium' }, names: ['tracksByEnergy', 'tracksByMood', 'searchLibrary', 'randomSongs'] },
  { name: 'searchLibrary', args: { query: 'reflective electronic' }, names: ['searchLibrary', 'tracksByMood', 'songsByGenre', 'randomSongs'] },
  { name: 'showPlaylistTracks', args: {}, names: ['showPlaylistTracks', 'tracksByMood', 'searchLibrary', 'randomSongs'] },
  { name: 'tracksLikeThis', args: { songId: 'V18seedTrack0000000001' }, names: ['tracksLikeThis', 'tracksByMood', 'songsByGenre', 'randomSongs'] },
] as const;

function prompt(id: string, strict = false) {
  return `${JOURNEY_CONFLICT}${strict ? ' This is a deliberately strict show with a likely exhausted eligible pool.' : ''}\n\n${JSON.stringify({ currentTrack: { id, title: 'Signal Path', artist: 'Glass Harbour' }, show: { name: strict ? 'Narrow Signal' : 'Wide Signal', genres: strict ? ['Alternative'] : ['Electronic', 'Art Rock'], moods: ['reflective'], energies: ['medium'], eras: [], filtersStrict: strict, playlistStrict: strict } }, null, 2)}\n\n${CONTROLLER_AUTHORITY}`;
}

function tools(names: readonly string[]) { return names.map(name => openAiTool(contracts[name])); }
function call(name: string, args: Record<string, unknown>) { return { role: 'assistant' as const, tool_calls: [{ type: 'function' as const, function: { name, arguments: args } }] }; }

/** The exact five off-air controller-path regression contexts. */
export const V18_CONTROLLER_PATH_FIXTURES: readonly FunctionGemmaScenario[] = [
  { id: 'controller-path.journey-withheld.1', stage: 'route', split: 'validation', description: 'Explicit journey instruction, waypoint absent.', prompt: prompt('V18journeyFixture000001'), tools: tools(alternatives[0].names).map(entry => ({ name: entry.function.name, required: entry.function.parameters.required, enums: undefined })), route: { firstCallOneOf: alternatives[0].names } },
  { id: 'controller-path.journey-withheld.2', stage: 'route', split: 'validation', description: 'Explicit journey instruction, energy alternative offered.', prompt: prompt('V18journeyFixture000002'), tools: tools(alternatives[1].names).map(entry => ({ name: entry.function.name, required: entry.function.parameters.required, enums: undefined })), route: { firstCallOneOf: alternatives[1].names } },
  { id: 'controller-path.journey-withheld.3', stage: 'route', split: 'validation', description: 'Explicit journey instruction, library alternative offered.', prompt: prompt('V18journeyFixture000003'), tools: tools(alternatives[2].names).map(entry => ({ name: entry.function.name, required: entry.function.parameters.required, enums: undefined })), route: { firstCallOneOf: alternatives[2].names } },
  { id: 'controller-path.journey-withheld.4', stage: 'route', split: 'validation', description: 'Explicit journey instruction, playlist alternative offered.', prompt: prompt('V18journeyFixture000004'), tools: tools(alternatives[3].names).map(entry => ({ name: entry.function.name, required: entry.function.parameters.required, enums: undefined })), route: { firstCallOneOf: alternatives[3].names } },
  { id: 'controller-path.journey-withheld.5', stage: 'route', split: 'validation', description: 'Explicit journey instruction, similarity alternative offered.', prompt: prompt('V18journeyFixture000005'), tools: tools(alternatives[4].names).map(entry => ({ name: entry.function.name, required: entry.function.parameters.required, enums: undefined })), route: { firstCallOneOf: alternatives[4].names } },
];

export function generateV18AvailabilityCorrections(split: Split) {
  const count = split === 'train' ? 10 : 5;
  return Array.from({ length: count }, (_, index) => {
    const recovery = index >= alternatives.length;
    const alternative = recovery && alternatives[index % alternatives.length].name === 'showPlaylistTracks'
      ? alternatives[0]
      : alternatives[index % alternatives.length];
    const id = `V18${split === 'train' ? 'train' : 'dev'}${String(index + 1).padStart(14, '0')}`.slice(0, 22);
    const nextArgs = alternative.name === 'tracksLikeThis' ? { songId: id } : alternative.args;
    const names = recovery ? ['showPlaylistTracks', ...alternative.names.filter(name => name !== 'showPlaylistTracks')] : alternative.names;
    return {
      id: `${split}.v18-availability.${index + 1}`, split, family: recovery ? 'recover.v18-journey-unavailable-strict-empty' : 'route.v18-journey-unavailable-explicit',
      messages: [
        { role: 'developer', content: DEVELOPER }, { role: 'user', content: prompt(id, recovery) },
        ...(recovery ? [call('showPlaylistTracks', {}), { role: 'tool' as const, content: { name: 'showPlaylistTracks', response: { tracks: [], note: 'No eligible strict-playlist candidates. Choose a different offered recovery source.' } } }, { role: 'user' as const, content: 'That source returned no eligible candidates. Choose one different offered recovery source.' }] : []),
        call(alternative.name, nextArgs),
      ], tools: tools(names),
    };
  });
}
