import { openAiTool } from './model-runner.js';
import type { ToolContract } from './contracts.js';

type Split = 'train' | 'development';
type Target = 'tracksByMood' | 'tracksByEnergy' | 'searchLibrary' | 'showPlaylistTracks' | 'tracksLikeThis';

const DEVELOPER = 'You are a model that can do function calling with the following functions. You are the backstage Producer Router for a live personal radio station. Use exactly one offered function at each decision point. Never invent a track id. The current track is a discovery seed, not a valid pick.';
const AUTHORITY = 'Controller authority: call only a function actually offered in this request. The sonic-journey waypoint function is unavailable for this pick. Do not call tracksTowardJourney; preserve its direction through an offered mood, genre, library, or other available discovery function.';
const contracts: Record<string, ToolContract> = {
  showPlaylistTracks: { name: 'showPlaylistTracks' },
  tracksByMood: { name: 'tracksByMood', required: ['mood', 'energy'], enums: { mood: ['energetic', 'calm', 'reflective', 'celebratory', 'romantic', 'spiritual', 'focus', 'workout', 'driving', 'cooking', 'rainy', 'sunny', 'night', 'morning', 'evening', 'festival', 'cultural'], energy: ['low', 'medium', 'high', null] } },
  tracksByEnergy: { name: 'tracksByEnergy', required: ['energy'], enums: { energy: ['low', 'medium', 'high'] } },
  songsByGenre: { name: 'songsByGenre', required: ['genre'] }, searchLibrary: { name: 'searchLibrary', required: ['query'] }, tracksLikeThis: { name: 'tracksLikeThis', required: ['songId'] }, randomSongs: { name: 'randomSongs' },
};
const trainTargets: readonly Target[] = ['searchLibrary','tracksLikeThis','tracksByMood','tracksByEnergy','showPlaylistTracks','searchLibrary','tracksLikeThis','searchLibrary','tracksLikeThis','tracksByMood','tracksByEnergy','showPlaylistTracks','searchLibrary','tracksLikeThis','searchLibrary','tracksLikeThis','tracksByMood','tracksByEnergy','showPlaylistTracks','searchLibrary','tracksLikeThis','searchLibrary','tracksLikeThis','tracksByMood','tracksByEnergy','showPlaylistTracks','searchLibrary','tracksLikeThis','searchLibrary','tracksLikeThis'];
const developmentTargets: readonly Target[] = ['searchLibrary','tracksLikeThis','tracksByMood','tracksByEnergy','showPlaylistTracks','searchLibrary','tracksLikeThis','searchLibrary','tracksLikeThis','searchLibrary'];

function tools(names: readonly string[]) { return names.map(name => openAiTool(contracts[name])); }
function call(name: string, arguments_: Record<string, unknown>) { return { role: 'assistant' as const, tool_calls: [{ type: 'function' as const, function: { name, arguments: arguments_ } }] }; }
function targetArgs(target: Target, id: string) {
  if (target === 'tracksByMood') return { mood: 'reflective', energy: 'medium' };
  if (target === 'tracksByEnergy') return { energy: 'medium' };
  if (target === 'searchLibrary') return { query: 'reflective electronic' };
  if (target === 'tracksLikeThis') return { songId: id };
  return {};
}
function offered(target: Target, recovery: boolean) {
  const names = target === 'searchLibrary' ? ['searchLibrary', 'tracksByMood', 'tracksByEnergy', 'randomSongs']
    : target === 'tracksLikeThis' ? ['tracksLikeThis', 'tracksByMood', 'songsByGenre', 'randomSongs']
      : target === 'showPlaylistTracks' ? ['showPlaylistTracks', 'tracksByMood', 'searchLibrary', 'randomSongs']
        : target === 'tracksByEnergy' ? ['tracksByEnergy', 'tracksByMood', 'searchLibrary', 'randomSongs']
          : ['tracksByMood', 'tracksByEnergy', 'songsByGenre', 'searchLibrary'];
  return recovery ? ['showPlaylistTracks', ...names.filter(name => name !== 'showPlaylistTracks')] : names;
}

/** V19 strengthens only the unresolved offered-library and offered-similarity boundary. */
export function generateV19AvailabilityCorrections(split: Split) {
  const targets = split === 'train' ? trainTargets : developmentTargets;
  return targets.map((target, index) => {
    const recovery = target !== 'showPlaylistTracks' && index % 5 === 4;
    const id = `V19${split === 'train' ? 'train' : 'dev'}${String(index + 1).padStart(14, '0')}`.slice(0, 22);
    const wording = index % 2
      ? 'A sonic journey is active: call tracksTowardJourney and lean toward its current waypoint.'
      : 'The active journey says to call tracksTowardJourney for its next waypoint.';
    const prompt = `${wording} Preserve a reflective medium-energy direction.${recovery ? ' The strict eligible pool may be empty, so recover through a different offered source with its exact arguments.' : ''}\n\n${JSON.stringify({ currentTrack: { id, title: index % 2 ? 'Signal Path' : 'Wide Angle', artist: index % 2 ? 'Glass Harbour' : 'Signal Field' }, show: { name: recovery ? 'Narrow Signal' : 'Wide Signal', genres: recovery ? ['Alternative'] : ['Electronic', 'Art Rock'], moods: ['reflective'], energies: ['medium'], eras: [], filtersStrict: recovery, playlistStrict: recovery } }, null, 2)}\n\n${AUTHORITY}`;
    return {
      id: `${split}.v19-availability.${index + 1}`, split,
      family: recovery ? 'recover.v19-explicit-journey-unavailable' : 'route.v19-explicit-journey-unavailable',
      messages: [
        { role: 'developer', content: DEVELOPER }, { role: 'user', content: prompt },
        ...(recovery ? [call('showPlaylistTracks', {}), { role: 'tool' as const, content: { name: 'showPlaylistTracks', response: { tracks: [], note: 'No eligible strict-playlist candidates. Choose a different offered recovery source.' } } }, { role: 'user' as const, content: 'That source returned no eligible candidates. Choose one different offered recovery source.' }] : []),
        call(target, targetArgs(target, id)),
      ], tools: tools(offered(target, recovery)),
    };
  });
}
