import { openAiTool } from './model-runner.js';
import type { ToolContract } from './contracts.js';

type Split = 'train' | 'development';
const DEVELOPER = 'You are a model that can do function calling with the following functions. You are the backstage Producer Router for a live personal radio station. Use exactly one offered function at each decision point. Never invent a track id. The current track is a discovery seed, not a valid pick.';
export const COMPLEMENT = 'Controller policy requests one complementary discovery source. Choose one different offered function.';
const contracts: Record<string, ToolContract> = {
  tracksTowardJourney: { name: 'tracksTowardJourney' },
  searchByLyrics: { name: 'searchByLyrics', required: ['query'] },
  searchBySound: { name: 'searchBySound', required: ['query'] },
  tracksLikeThis: { name: 'tracksLikeThis', required: ['songId'] },
  tracksByMood: { name: 'tracksByMood', required: ['mood', 'energy'], enums: { energy: ['low', 'medium', 'high', null] } },
  deepCuts: { name: 'deepCuts' },
};
const tools = (names: readonly string[]) => names.map(name => openAiTool(contracts[name]));
const call = (name: string, arguments_: Record<string, unknown> = {}) => ({ role: 'assistant' as const, tool_calls: [{ type: 'function' as const, function: { name, arguments: arguments_ } }] });
const soundQueries = ['warm spacious guitar with a steady pulse', 'dry electric guitar and a measured pulse', 'bright jangling guitars with a driving beat'];
const lyricQueries = ['songs about starting over', 'a hopeful lyric about leaving home', 'music about long-distance love'];

/** Station-shaped two-decision correction: preserve axis meaning and never replay a used tool. */
export function generateV22SearchRoutingCorrections(split: Split) {
  const count = split === 'train' ? 18 : 6;
  return Array.from({ length: count }, (_, index) => {
    const kind = index % 3;
    const seed = `V22${split === "train" ? "T" : "D"}${String(index + 1).padStart(18, "0")}`;
    const initial = ['tracksTowardJourney', 'searchByLyrics', 'searchBySound', 'tracksLikeThis', 'tracksByMood', 'deepCuts'];
    let prompt: string;
    let first: string;
    let firstArgs: Record<string, unknown>;
    if (kind === 0) {
      prompt = `Operational pick request: a sonic journey is active. Call tracksTowardJourney and lean toward its current waypoint. Current track id: ${seed}.`;
      first = 'tracksTowardJourney'; firstArgs = {};
    } else if (kind === 1) {
      const query = soundQueries[index % soundQueries.length];
      prompt = `Operational pick request: find music that sounds like ${query}. This is an audio description, not a lyric theme. Current track id: ${seed}.`;
      first = 'searchBySound'; firstArgs = { query };
    } else {
      const query = lyricQueries[index % lyricQueries.length];
      prompt = `Operational pick request: find a thematic next track through lyric meaning: ${query}. This is a lyric/theme request, not an audio description. Current track id: ${seed}.`;
      first = 'searchByLyrics'; firstArgs = { query };
    }
    const second = 'tracksLikeThis';
    const later = initial.filter(name => name !== first);
    return {
      id: `${split}.v22-search-routing.${index + 1}`,
      split,
      family: kind === 0 ? 'controller.v22-journey-complement' : kind === 1 ? 'controller.v22-sound-not-lyrics' : 'controller.v22-lyrics-not-sound',
      messages: [
        { role: 'developer' as const, content: DEVELOPER },
        { role: 'user' as const, content: prompt },
        call(first, firstArgs),
        { role: 'tool' as const, content: { name: first, response: { tracks: [{ id: `${seed}-candidate` }] } } },
        { role: 'user' as const, content: COMPLEMENT },
        call(second, { songId: seed }),
      ],
      tools: tools(initial),
      decisionTools: [tools(initial), tools(later)],
    };
  });
}
