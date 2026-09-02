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
  tracksByMood: { name: 'tracksByMood', required: ['mood', 'energy'], enums: { mood: ['calm', 'reflective', 'focus', 'driving'], energy: ['low', 'medium', 'high', null] } },
  deepCuts: { name: 'deepCuts' },
};

const allNames = Object.keys(contracts);
const complementary = ['tracksLikeThis', 'tracksByMood', 'deepCuts'];
const soundQueries = [
  'dry electric guitar with a measured pulse',
  'bright jangling guitars over a driving beat',
  'soft piano, brushed drums and a close-miked vocal',
  'low synth drone with sparse percussion',
];
const lyricQueries = [
  'a hopeful lyric about leaving home',
  'songs about long-distance love',
  'a lyric about rebuilding after a setback',
  'a song about finding calm after a storm',
];
const tools = (names: readonly string[]) => names.map(name => openAiTool(contracts[name]));
const call = (name: string, arguments_: Record<string, unknown>) => ({ role: 'assistant' as const, tool_calls: [{ type: 'function' as const, function: { name, arguments: arguments_ } }] });
const remaining = (used: readonly string[]) => allNames.filter(name => !used.includes(name));

function argsFor(name: string, seed: string): Record<string, unknown> {
  if (name === 'tracksLikeThis') return { songId: seed };
  if (name === 'tracksByMood') return { mood: 'reflective', energy: null };
  return {};
}

/**
 * V24 keeps V23's valid shrinking offers but weights the two native failures:
 * sound descriptions must not become lyric searches, and lyric queries must
 * be copied exactly. The held-out prompts use different wording.
 */
export function generateV24SemanticThreeSourceCorrections(split: Split) {
  const count = split === 'train' ? 48 : 15;
  return Array.from({ length: count }, (_, index) => {
    const kind = index % 4;
    const seed = `V24${split === 'train' ? 'T' : 'D'}${String(index + 1).padStart(18, '0')}`;
    const second = complementary[index % complementary.length];
    const third = complementary[(index + 1) % complementary.length];
    let first: string;
    let firstArgs: Record<string, unknown>;
    let prompt: string;
    if (kind < 2) {
      const query = soundQueries[index % soundQueries.length];
      first = 'searchBySound';
      firstArgs = { query };
      prompt = `Operational pick request: find music that sounds like ${query}. This is an audio description about timbre, instrumentation or production, not lyric meaning. Current track id: ${seed}.`;
    } else if (kind === 2) {
      const query = lyricQueries[index % lyricQueries.length];
      first = 'searchByLyrics';
      firstArgs = { query };
      prompt = `Operational pick request: find a thematic next track through lyric meaning: ${query}. Copy that lyric/theme query exactly. This is not an audio-description search. Current track id: ${seed}.`;
    } else {
      first = 'tracksTowardJourney';
      firstArgs = {};
      prompt = `Operational pick request: a sonic journey is active. Call tracksTowardJourney and lean toward its current waypoint. Current track id: ${seed}.`;
    }
    return {
      id: `${split}.v24-semantic-three-source.${index + 1}`,
      split,
      family: first === 'searchBySound' ? 'controller.v24-sound-not-lyrics' : first === 'searchByLyrics' ? 'controller.v24-lyrics-copy' : 'controller.v24-journey-complement',
      messages: [
        { role: 'developer' as const, content: DEVELOPER },
        { role: 'user' as const, content: prompt },
        call(first, firstArgs),
        { role: 'tool' as const, content: { name: first, response: { tracks: [{ id: `${seed}-initial` }] } } },
        { role: 'user' as const, content: COMPLEMENT },
        call(second, argsFor(second, seed)),
        { role: 'tool' as const, content: { name: second, response: { tracks: [{ id: `${seed}-complement-1` }] } } },
        { role: 'user' as const, content: COMPLEMENT },
        call(third, argsFor(third, seed)),
      ],
      tools: tools(allNames),
      decisionTools: [tools(allNames), tools(remaining([first])), tools(remaining([first, second]))],
    };
  });
}
