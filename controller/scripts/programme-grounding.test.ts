// Pins the programme beats' grounding rule (issue #1301).
//
// The incident: a straight-talk feature aired "Nirvana's Smells Like Teen
// Spirit from Nevermind blasts in, with Butch Vig's punchy production…"
// sixteen seconds into an Anika track. Every fact in that line is true — what
// broke was the FRAMING. "blasts in" is present-tense on-air cue language, so
// the listener hears the host introducing a record that was never on the
// playout while something else is audible.
//
// Three properties are load-bearing, and each is a way the fix could be
// silently undone:
//
//  - The rule bans the CUE, not the noun. The obvious over-correction is
//    "never name a song or album", which guts the beat — a feature on the
//    birth of grunge that cannot name Nevermind is not a feature. So the test
//    asserts naming stays explicitly permitted, not just that a rule exists.
//  - The certainty half is SEPARATE and both halves must survive. Real facts
//    framed as a cue (what happened) and invented credits (what a small model
//    does) are independent failure modes; a rule covering one does not cover
//    the other, and the feature's pre-existing no-invented-data clause is not
//    a substitute for the framing ban.
//  - The rule reaches ALL FOUR beats. It lives in one constant precisely so it
//    cannot drift between them, but a constant nothing appends is exactly the
//    regression this guards — hence the assertions run against each beat's
//    RENDERED text, not against the constant alone. The intro and outro
//    carried no anti-fabrication line at all before this, and the intro is the
//    worst seat for it: "tease what's coming" invites a promise about a record
//    that will never air.
//
// The plan-side clause is pinned too, but as a frequency lever only, not a
// guard: runFeature reaches the ungrounded generator whenever a capability
// throws at air time (broadcast/programme.ts), which no plan wording prevents.
//
// STATE_DIR is redirected at a throwaway dir BEFORE the first import so
// settings.load() touches nothing real — same idiom as house-rules.test.ts.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'subwave-progground-'));
process.env.STATE_DIR = root;

const settings = await import('../src/settings.js');
const {
  PROGRAMME_GROUNDING_RULE,
  featureScheduleClause,
  featureTask,
  introTask,
  outroTask,
  exchangeSystem,
} = await import('../src/llm/internal/prompts/programme.js');

try {
  await settings.load();

  const speaker = { id: 'p_test', name: 'Nova', soul: 'warm and dry' };
  const show = { id: 'sh_1', name: 'Night Shift', topic: 'the birth of grunge' };
  const plan = { angle: 'the year the underground went loud', introNote: 'set the scene', outroNote: 'land it' };

  // ── The rule itself: bans the cue framing, keeps naming legal ────────────
  assert.match(
    PROGRAMME_GROUNDING_RULE,
    /playing now/i,
    'rule bans describing a track as playing now',
  );
  assert.match(
    PROGRAMME_GROUNDING_RULE,
    /coming up/i,
    'rule bans describing a track as coming up',
  );
  assert.match(
    PROGRAMME_GROUNDING_RULE,
    /just heard/i,
    'rule bans describing a track as just heard',
  );
  // The over-correction guard. Naming must stay permitted-with-certainty; a
  // blanket ban would satisfy "there is a rule" while breaking the feature.
  assert.match(
    PROGRAMME_GROUNDING_RULE,
    /naming a record[^.]*is fine/i,
    'naming a record stays permitted — the ban is on the cue framing, not the noun',
  );
  assert.match(
    PROGRAMME_GROUNDING_RULE,
    /certain/i,
    'the certainty half is present — it is what covers an invented credit',
  );

  // ── All four beats carry it verbatim ─────────────────────────────────────
  const feature = featureTask({ show, topic: 'what Butch Vig actually changed', plan, speaker });
  const intro = introTask({ show, plan, speaker });
  const outro = outroTask({ show, plan, speaker, nextShowName: 'Small Hours' });
  const exchange = exchangeSystem({
    show,
    castBlock: '- p_test — Nova (HOST): warm and dry',
    beatTask: 'This is the TOP of the show.',
    langClause: '',
  });

  for (const [name, text] of Object.entries({ feature, intro, outro, exchange })) {
    assert.ok(
      text.includes(PROGRAMME_GROUNDING_RULE),
      `${name} beat carries the grounding rule verbatim`,
    );
  }

  // ── Each beat kept the task it already had ───────────────────────────────
  // The rule is an addition, not a rewrite: a builder that lost its own task
  // line would still pass the check above.
  assert.match(feature, /the feature segment of your show/i, 'feature keeps its task line');
  assert.match(intro, /top of the programme/i, 'intro keeps its task line');
  assert.match(outro, /sign the episode off/i, 'outro keeps its task line');
  assert.match(exchange, /at least two speakers/i, 'exchange keeps its line-count rule');

  // The feature's pre-existing no-invented-data clause must survive alongside
  // the new rule — it covers dates/quotes/statistics, which the framing ban
  // says nothing about.
  assert.match(
    feature,
    /no invented dates, quotes, statistics/i,
    'feature keeps its own no-invented-data clause — the two halves are independent',
  );

  // The episode angle and topic still reach the feature; the rule must not
  // have displaced the grounding the beat DOES get.
  assert.match(feature, /what Butch Vig actually changed/, 'feature carries its topic');
  assert.match(feature, /the year the underground went loud/, "feature carries the episode's angle");

  // ── Plan side: controller-owned delivery schedule ─────────────────────────
  const schedule = featureScheduleClause(['web-search', null]);
  assert.match(schedule, /controller has fixed/i, 'the controller, not the creative model, owns the schedule');
  assert.match(
    schedule,
    /approved evidence capability "web-search"/i,
    'the supplied capability is a fixed operational result, not a menu choice',
  );
  assert.match(
    schedule,
    /straight talk from the standing brief only/i,
    'straight talk is explicitly constrained to the standing brief',
  );
  assert.match(schedule, /Do not change this schedule/i, 'creative planning cannot select a different capability');

  const none = featureScheduleClause([null]);
  assert.match(none, /straight-talk delivery/i);
  assert.match(none, /do not rely on unstated facts/i);

  console.log('programme-grounding: OK');
} finally {
  rmSync(root, { recursive: true, force: true });
}
