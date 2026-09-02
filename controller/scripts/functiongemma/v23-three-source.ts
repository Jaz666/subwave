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

const names = Object.keys(contracts);
const tools = (offered: readonly string[]) => offered.map(name => openAiTool(contracts[name]));
const call = (name: string, arguments_: Record<string, unknown> = {}) => ({ role: 'assistant' as const, tool_calls: [{ type: 'function' as const, function: { name, arguments: arguments_ } }] });
const without = (offered: readonly string[], used: readonly string[]) => offered.filter(name => !used.includes(name));

/**
 * The smallest controller-shaped repair for native V22 failures. It teaches
 * three sequential source decisions, with every used source removed before
 * the next call and rotating valid complementary axes.
 */
export function generateV23ThreeSourceCorrections(split: Split) {
  const count = split === 'train' ? 18 : 6;
  return Array.from({ length: count }, (_, index) => {
    const kind = index % 3;
    const seed = `V23${split === 'train' ? 'T' : 'D'}${String(index + 1).padStart(18, '0')}`;
    const complements = ['tracksLikeThis', 'tracksByMood', 'deepCuts'];
    const second = complements[index % complements.length];
    const third = complements[(index + 1) % complements.length];
    let prompt: string;
    let first: string;
    let firstArgs: Record<string, unknown>;
    if (kind === 0) {
      prompt = `Operational pick request: a sonic journey is active. Call tracksTowardJourney and lean toward its current waypoint. Current track id: ${seed}.`;
      first = 'tracksTowardJourney'; firstArgs = {};
    } else if (kind === 1) {
      prompt = `Operational pick request: find music that sounds like warm spacious guitar with a steady pulse. This is an audio description, not a lyric theme. Current track id: ${seed}.`;
      first = 'searchBySound'; firstArgs = { query: 'warm spacious guitar with a steady pulse' };
    } else {
      prompt = `Operational pick request: find a thematic next track through lyric meaning: songs about starting over. This is a lyric/theme request, not an audio description. Current track id: ${seed}.`;
      first = 'searchByLyrics'; firstArgs = { query: 'songs about starting over' };
    }
    const args = (name: string): Record<string, unknown> => name === 'tracksLikeThis'
      ? { songId: seed }
      : name === 'tracksByMood'
        ? { mood: 'reflective', energy: null }
        : {};
    return {
      id: `${split}.v23-three-source.${index + 1}`,
      split,
      family: kind === 0 ? 'controller.v23-journey-three-source' : kind === 1 ? 'controller.v23-sound-three-source' : 'controller.v23-lyrics-three-source',
      messages: [
        { role: 'developer' as const, content: DEVELOPER },
        { role: 'user' as const, content: prompt },
        call(first, firstArgs),
        { role: 'tool' as const, content: { name: first, response: { tracks: [{ id: `${seed}-initial` }] } } },
        { role: 'user' as const, content: COMPLEMENT },
        call(second, args(second)),
        { role: 'tool' as const, content: { name: second, response: { tracks: [{ id: `${seed}-complement-1` }] } } },
        { role: 'user' as const, content: COMPLEMENT },
        call(third, args(third)),
      ],
      tools: tools(names),
      decisionTools: [tools(names), tools(without(names, [first])), tools(without(names, [first, second]))],
    };
  });
}
