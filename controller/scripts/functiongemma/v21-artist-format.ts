import { openAiTool } from './model-runner.js';
import type { ToolContract } from './contracts.js';

type Split = 'train' | 'development';

const DEVELOPER = 'You are a model that can do function calling with the following functions. You are the backstage Producer Router for a live personal radio station. Use exactly one offered function at each decision point. Never invent a track id. The current track is a discovery seed, not a valid pick.';
const EMPTY = 'That source returned no eligible candidates. Choose one different offered recovery source.';
const artists = ['Lunar Arcade', 'The Paper Satellites', 'Moss Signal', 'Violet Static', 'Northern Lights', 'Harbour Echo'];
const contracts: Record<string, ToolContract> = {
  topSongsByArtist: { name: 'topSongsByArtist', required: ['artist'] },
  recentByArtist: { name: 'recentByArtist', required: ['artist'] },
  searchLibrary: { name: 'searchLibrary', required: ['query'] },
  randomSongs: { name: 'randomSongs' },
};
const tools = (names: readonly string[]) => names.map(name => openAiTool(contracts[name]));
const call = (name: string, arguments_: Record<string, unknown>) => ({ role: 'assistant' as const, tool_calls: [{ type: 'function' as const, function: { name, arguments: arguments_ } }] });

/** Narrow Q8 correction: exact artist argument syntax after a controller empty result. */
export function generateV21ArtistFormatCorrections(split: Split) {
  const count = split === 'train' ? 12 : 4;
  return Array.from({ length: count }, (_, index) => {
    const artist = artists[index % artists.length];
    const initial = ['topSongsByArtist', 'recentByArtist', 'searchLibrary', 'randomSongs'];
    // Alternate a minimal recovery offer with the operational offer. Both have
    // the same target; the first makes the required artist field unmistakable.
    const recovery = index % 2 === 0 ? ['recentByArtist'] : ['recentByArtist', 'searchLibrary', 'randomSongs'];
    return {
      id: `${split}.v21-q8-artist-format.${index + 1}`,
      split,
      family: 'recover.v21-q8-artist-envelope',
      messages: [
        { role: 'developer' as const, content: DEVELOPER },
        { role: 'user' as const, content: `Stay near the exact current artist "${artist}". Call top songs first. If it is empty, call recent songs and copy the artist character-for-character. Controller case ${split}-${index + 1}.` },
        call('topSongsByArtist', { artist }),
        { role: 'tool' as const, content: { name: 'topSongsByArtist', response: { tracks: [] } } },
        { role: 'user' as const, content: EMPTY },
        call('recentByArtist', { artist }),
      ],
      tools: tools(initial),
      decisionTools: [tools(initial), tools(recovery)],
    };
  });
}
