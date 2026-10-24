// Co-hosted skill prompt and dynamic output contract. The active show roster is
// default speaker authority. Opt-in tool casts are resolved by skills/cohosted.ts
// before this prompt is built. Each structured contribution maps to a full persona.

import { z } from 'zod';
import * as settings from '../../../settings.js';
import { soulBrief } from '../core/pure.js';
import { onAirLocationGrounding } from './grounding.js';

interface CastPersona {
  id: string;
  name?: string;
  soul?: string;
  language?: string;
}

// A solo tool-selected voice needs no speaker IDs or nested contribution array.
export const soloSkillSchema = z.object({
  reason: z.string().describe('short internal explanation of the segment decision'),
  air: z.boolean().describe('false when source data is unusable; otherwise true'),
  text: z.string().max(1200).describe('one complete spoken segment in this persona’s voice; empty when air is false'),
});

export const lookAheadSkillSchema = z.object({
  reason: z.string(),
  air: z.boolean(),
  firstSummary: z.string().max(300).describe('one short sentence about shows[0].brief only; no clock, title, presenter names or date claims'),
  secondSummary: z.string().max(300).describe('one short sentence about shows[1].brief only, or empty if absent; no clock, title, presenter names or date claims'),
});

export function cohostedSkillSchema(cast: CastPersona[]) {
  const ids = cast.map((p) => p.id) as [string, ...string[]];
  const line = z.object({
    speaker: z.enum(ids).describe('the exact immutable persona id for this contribution, in the cast order'),
    text: z.string().trim().min(1).max(1200)
      .describe('this persona’s spoken contribution — 2–5 short sentences, plain speech, with no name label or stage direction'),
  });

  return z.object({
    reason: z.string().describe('one short internal sentence explaining why this discussion should air, or why it should stand down'),
    air: z.boolean().describe('true to air the complete discussion; false only when there is no usable source material or nothing responsible to discuss'),
    lines: z.array(line).describe('when air is true: exactly one contribution per cast member, in the cast order; when false: an empty array'),
  }).superRefine((value, ctx) => {
    if (!value.air) {
      if (value.lines.length) ctx.addIssue({ code: 'custom', path: ['lines'], message: 'lines must be empty when air is false' });
      return;
    }
    if (value.lines.length !== cast.length) {
      ctx.addIssue({ code: 'custom', path: ['lines'], message: `expected exactly ${cast.length} cast contributions` });
      return;
    }
    for (let i = 0; i < cast.length; i += 1) {
      if (value.lines[i]?.speaker !== cast[i].id) {
        ctx.addIssue({ code: 'custom', path: ['lines', i, 'speaker'], message: `expected ${cast[i].id} in cast order` });
      }
    }
  });
}

function castBlock(host: CastPersona, guests: CastPersona[]): string {
  const entry = (persona: CastPersona, role: string) =>
    `- ${persona.id} — ${persona.name || persona.id} (${role}): ${soulBrief(persona.soul) || 'no notes'}`;
  return [entry(host, 'HOST'), ...guests.map((guest) => entry(guest, 'GUEST CO-HOST'))].join('\n');
}

export function cohostedSkillSystem({ capability, host, guests, grounded = false, lookAhead = false }: {
  capability: { kind?: string; desc?: string; toolCast?: boolean };
  host: CastPersona;
  guests: CastPersona[];
  grounded?: boolean;
  lookAhead?: boolean;
}): string {
  if (capability.toolCast && !guests.length) {
    return `${settings.agentPersonaPreamble(host)}

You alone deliver this short skill segment. There are no other speaking participants.
Follow the skill's supplied mode: an upcoming-host promo is a standalone promo for your later show, not a discussion or a claim that you host the current show.
Use only the supplied source data. If nothing usable is supplied, set air to false and ${lookAhead ? 'both summaries' : 'text'} to empty strings. Never fill gaps from earlier speech or memory.

Skill "${capability.kind || 'segment'}" instructions:
${capability.desc || ''}

${lookAhead ? `The controller supplies the exact time, show title and cast separately for each show. Do not write the full announcement. Write firstSummary only about shows[0] and secondSummary only about shows[1] (empty if absent). Use at most one short sentence per summary, in your own voice. Include no dates, times, presenter names, titles, introductions or chronology. The skill's instructions about announcing those facts are handled by the controller. Do not copy earlier spoken examples.` : 'Write your spoken words in text, without speaker labels or stage directions.'}
${settings.agentLanguageReminder(host, lookAhead ? 'the summary fields' : 'the "text" line')}`;
  }
  const lang = String(host.language || '').trim() || 'English';
  const grounding = capability.toolCast
    ? 'Source data has already been fetched for this segment. Use only that supplied source data; do not call a tool again or invent missing facts.'
    : grounded
    ? 'Use the skill tool before writing. Build the discussion only from usable source data it returns; if it returns nothing usable or fails, set air to false. Never fill gaps from memory or plausibility.'
    : 'Build the discussion from the skill brief and current moment. Do not invent quotes, listener messages, callers, or purported events.';
  return `You write one co-hosted between-track discussion for a personal internet radio station.

The active cast (persona id — name (role): voice notes), in required speaking order:
${castBlock(host, guests)}

Skill "${capability.kind || 'discussion'}" brief:
${capability.desc || ''}

Rules:
- Return exactly one contribution for every cast member, in the cast order above. Use each immutable persona id exactly once; never invent a speaker.
- ${capability.toolCast ? 'Follow the skill brief for each contribution’s purpose and length. The cast includes temporary segment guests, not necessarily the current show’s guests. A single-person cast delivers the entire segment.' : 'Each contribution is 2–5 short sentences. Together they form one coherent discussion: react to each other, differ naturally, and avoid repeated points.'}
- Each speaker stays in THEIR OWN character. The host carries the room and the guest co-hosts speak as themselves.
- ${grounding}
- ${onAirLocationGrounding()}
- Plain spoken words only. Do not write speaker labels such as "Name:" inside text; speaker identity travels separately and each line will use that persona's own TTS voice.
- Everyone speaks ${lang} on air. ${settings.spokenProperNounDirective(host)}${settings.castHouseRulesBlock()}`;
}
