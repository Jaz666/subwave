import { openAiTool } from './model-runner.js';
import type { ToolContract } from './contracts.js';

type Split = 'train' | 'development';
type Family = 'sound-description' | 'sound-similarity' | 'artist-copy' | 'artist-route' | 'playlist-complement';

const DEVELOPER = 'You are a model that can do function calling with the following functions. You are the backstage Producer Router for a live personal radio station. Use exactly one offered function at each decision point. Never invent a track id. The current track is a discovery seed, not a valid pick.';
const EMPTY = 'That source returned no eligible candidates. Choose one different offered recovery source.';
const contracts: Record<string, ToolContract> = {
  searchBySound: { name: 'searchBySound', required: ['query'] },
  tracksThatSoundLikeThis: { name: 'tracksThatSoundLikeThis', required: ['songId'] },
  tracksByMood: { name: 'tracksByMood', required: ['mood', 'energy'], enums: { mood: ['calm', 'reflective', 'focus', 'driving'], energy: ['low', 'medium', 'high', null] } },
  tracksByEnergy: { name: 'tracksByEnergy', required: ['energy'], enums: { energy: ['low', 'medium', 'high'] } },
  topSongsByArtist: { name: 'topSongsByArtist', required: ['artist'] },
  recentByArtist: { name: 'recentByArtist', required: ['artist'] },
  showPlaylistTracks: { name: 'showPlaylistTracks' },
  searchLibrary: { name: 'searchLibrary', required: ['query'] },
  randomSongs: { name: 'randomSongs' },
};
const artists = ['Lunar Arcade', 'The Paper Satellites', 'Moss Signal', 'Violet Static', 'Northern Lights'];
const trainFamilies: Family[] = ['sound-description', 'sound-description', 'sound-description', 'sound-similarity', 'sound-similarity', 'sound-similarity', 'artist-copy', 'artist-copy', 'artist-copy', 'artist-copy', 'artist-copy', 'artist-copy', 'artist-route', 'artist-route', 'artist-route', 'artist-route', 'playlist-complement', 'playlist-complement', 'playlist-complement', 'playlist-complement', 'sound-description', 'sound-similarity', 'artist-copy', 'playlist-complement'];
const developmentFamilies: Family[] = ['sound-description', 'sound-similarity', 'sound-description', 'artist-copy', 'artist-copy', 'artist-route', 'artist-route', 'playlist-complement', 'playlist-complement', 'sound-similarity'];
const tools = (names: readonly string[]) => names.map(name => openAiTool(contracts[name]));
const call = (name: string, arguments_: Record<string, unknown> = {}) => ({ role: 'assistant' as const, tool_calls: [{ type: 'function' as const, function: { name, arguments: arguments_ } }] });

/** Exact controller transitions for the V19 Q8 soak failure families. */
export function generateV20RecoveryCorrections(split: Split) {
  const families = split === 'train' ? trainFamilies : developmentFamilies;
  return families.map((family, index) => {
    const artist = artists[index % artists.length];
    const seed = `V20${split === 'train' ? 'T' : 'D'}${String(index + 1).padStart(18, '0')}`;
    const base = [{ role: 'developer' as const, content: DEVELOPER }];
    let prompt = '';
    let first = '';
    let firstArgs: Record<string, unknown> = {};
    let next = '';
    let nextArgs: Record<string, unknown> = {};
    let initialNames: string[] = [];
    let recoveryNames: string[] = [];
    if (family === 'sound-description') {
      prompt = 'Find music with a warm spacious guitar and steady pulse. If sound-description search is empty, change axis to the exact calm mood with null energy.';
      first = 'searchBySound'; firstArgs = { query: 'warm spacious guitar with a steady pulse' };
      next = 'tracksByMood'; nextArgs = { mood: 'calm', energy: null };
      initialNames = ['searchBySound', 'tracksByMood', 'randomSongs']; recoveryNames = ['tracksByMood', 'randomSongs'];
    } else if (family === 'sound-similarity') {
      prompt = `Try audio similarity from the current seed ${seed}. If it is empty, do not repeat audio similarity; recover through calm mood with null energy.`;
      first = 'tracksThatSoundLikeThis'; firstArgs = { songId: seed };
      next = 'tracksByMood'; nextArgs = { mood: 'calm', energy: null };
      initialNames = ['tracksThatSoundLikeThis', 'tracksByMood', 'searchLibrary', 'randomSongs']; recoveryNames = ['tracksByMood', 'searchLibrary', 'randomSongs'];
    } else if (family === 'artist-copy' || family === 'artist-route') {
      prompt = `Stay near the exact current artist "${artist}". Copy that artist name character-for-character into top songs, then use recent songs if top songs is empty.`;
      first = 'topSongsByArtist'; firstArgs = { artist };
      next = 'recentByArtist'; nextArgs = { artist };
      initialNames = ['topSongsByArtist', 'recentByArtist', 'searchLibrary', 'randomSongs']; recoveryNames = ['recentByArtist', 'searchLibrary', 'randomSongs'];
    } else {
      prompt = 'Begin inside the preferred show playlist, then choose one complementary calm low-energy source when that playlist is empty. Do not repeat the playlist tool.';
      first = 'showPlaylistTracks';
      next = 'tracksByMood'; nextArgs = { mood: 'calm', energy: 'low' };
      initialNames = ['showPlaylistTracks', 'tracksByMood', 'tracksByEnergy', 'randomSongs']; recoveryNames = ['tracksByMood', 'tracksByEnergy', 'randomSongs'];
    }
    prompt += `\n\nController regression case ${split}-${index + 1}.`;
    // Artist-route rows protect the initial exact-argument call separately;
    // recovery rows train the real tool-removal transition and controller text.
    const routeOnly = family === 'artist-route';
    const messages = routeOnly
      ? [...base, { role: 'user' as const, content: prompt }, call(first, firstArgs)]
      : [...base, { role: 'user' as const, content: prompt }, call(first, firstArgs), { role: 'tool' as const, content: { name: first, response: { tracks: [] } } }, { role: 'user' as const, content: EMPTY }, call(next, nextArgs)];
    return {
      id: `${split}.v20-controller-transition.${index + 1}`,
      split,
      family: routeOnly ? 'route.v20-artist-exact-copy' : `recover.v20-${family}`,
      messages,
      tools: tools(initialNames),
      decisionTools: routeOnly ? [tools(initialNames)] : [tools(initialNames), tools(recoveryNames)],
    };
  });
}
