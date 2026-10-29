# Sub/Shows

Current implementation contract for DJ’s Choice, Deep Discovery, Common Ground,
Outside the Comfort Zone and Time Capsule. Updated 27 October 2026.

This document describes implemented behaviour. The
[original development plan](djs-choice-development-plan.md) and
[pre-cleanup design/trial record](https://github.com/Jaz666/subwave/blob/229f970f6cde002d426d12b859c9d65f4ee63800/docs/internals/djs-choice.md)
preserve the earlier proposals, model samples, rejected approaches and dated
verification evidence. Those snapshots do not override the rules below.

## Operator workflow

Use **Shows → Sub/Shows** for episode plans and station-wide eligibility.
Generated variants stay separate from regular editable shows.

On Schedule, the striped shelf offers one entry for each template. Clicking one
opens its name/casting options. Apply retains a temporary preset for repeated
drags of that template; choosing another template or refreshing clears it.
Applying a preset alone writes nothing. Each drop creates a distinct configured
show, persisted with **Save the week**. Clicking a generated grid slot also
puts it in the order editor and opens its own options. Resizing adjacent slots
reconciles both affected occurrences and removes obsolete future plans.

The Sub/Shows page has collapsed host/guest/skill settings, an on-air section
when applicable, and separately scrolling upcoming/past lists. Regenerate keeps
the cast. Shuffle previews a new cast according to the slot’s random/fixed rules
before regenerating; fixed participants remain fixed. Started slots cannot be
regenerated or shuffled. Save as regular show opens the ordinary editor on a
copy of the accepted episode, including its music settings and cast. It leaves
the recurring template and weekly schedule unchanged. Repeated saves reuse a
stable regular-show identity; changed episodes require reopening the save draft.

Episode titles may be generated or operator-defined. A custom title is reused
for each airing of that variant and preserved exactly during planning/repair.
Show organisation tags are operator-managed; they are not the generated music
settings.

## Five template policies

| Template | Musical direction | Cast |
| --- | --- | --- |
| DJ’s Choice | A familiar core with occasional connected departures beyond regular-show repertoire. Keep the host’s musical centre recognisable. | Host, optional guests |
| Deep Discovery | One coherent underrepresented neighbourhood related to the host’s tastes. At least half the eligible pool must match its rare core. | Host, optional guests |
| Common Ground | A specific musical connection with equal influence from both DJs. Avoid joining two unrelated genre lists. | Host, exactly one guest |
| Outside the Comfort Zone | One credible sideways move into a neighbouring destination outside usual repertoire. That single destination supplies the music throughout. Rarity is not required. | Solo host |
| Time Capsule | One coherent palette in a closed period, normally 1–5 years and at most ten inclusive. No unsupported historical claims. | Host, optional guests |

All five generate strict filters. DJ’s Choice is familiar music with adjacent
exploration, rather than a requirement to pick rare styles. Deep Discovery
measures catalogue underrepresentation, not low airplay or forgotten favourites.
Outside the Comfort Zone excludes exact regular-show genres and broad umbrella
Rock/Pop/Electronic/Experimental destinations; absence from a show’s filters does
not prove the DJ has never heard that music. Common Ground requires a supported
musical bridge, not similar presentation styles. Time Capsule excludes those
umbrella genres, uses 1–3 specific styles, and retains exact closed year bounds.

## Persona evidence and casting

Resolve the cast before planning. Soul supplies personality and musical taste;
optional Musical Leanings supplement it. One explicit preference for a genre,
artist, instrument or musical quality is sufficient. Neither Leanings nor
existing regular shows are required. Voice, humour, pacing and interaction
instructions do not establish musical preferences.

Readiness is checked for the host and, for Common Ground, the guest. The concept
response quotes evidence from each required participant’s own text. Local checks
reject invented/misattributed quotations and obvious presentation-only evidence.
Untouched shipped Souls without music evidence stand down before generation.
Failures provide setup advice with the
[Musical Leanings guide](https://github.com/perminder-klair/subwave/discussions/1817).
A library-fit refusal is separate from insufficient persona information.

Scheduled regular shows contribute names and music filters as repertoire
context; their verbose presentation briefs are omitted. For DJ’s Choice these
are familiar context, not hard exclusions. Common Ground considers both DJs’
repertoire. Soul remains primary, and inferred familiarity must be described
honestly when no shows exist.

Station-wide pools use `null` for everyone/all skills and `[]` for none.
Optional-guest templates draw random hosts and guests from their respective
pools, excluding fixed guests from random-host draws. Common Ground uses
**Random Hosts for both participants**, including explicitly chosen DJs.
Outside the Comfort Zone is solo. Optional random guests number 0–3; prevent
host/guest duplication and enforce the three-guest maximum.

Casting is stable for an occurrence and saved seed. Regeneration retains it;
shuffle changes its seed. Prepared takeovers retain their original casting
identity when rebased to activation time. A restart does not redraw an accepted
unchanged episode. Rotation-aware fairness and unique pairings are not promised.
Legacy candidate lists are stripped; unsupported stored template names retain
the existing load-time fallback to DJ’s Choice. History is not rewritten.

## Planning and music contract

Normal generation uses two structured calls through the shared DJ SDK:

1. **Concept:** assess readiness and library fit; establish the template’s
   musical direction, declared genres and applicable era; write the brief,
   title and separate talking point. Some templates return connection,
   departure or period evidence before prose.
2. **Music settings/editorial pass:** preserve the declared genre/era contract
   and title, compile settings and edit the presentation brief. Aim for 80–120
   words when useful, without a minimum or filler. Expand the actual host/guest
   perspectives and listening invitation without adding music restrictions.

The concept receives a bounded library shortlist; the second call receives the
accepted palette. Genres are exact available labels, up to the 15-genre limit.
Mood and energy default to empty. Except for Time Capsule, era filters remain
empty unless the operator explicitly requests a period. Favourite decades in a
persona’s preferences do not themselves restrict playback. The fixed music
settings, rather than descriptive speech instructions, drive track selection;
Musical Leanings remain a soft influence among eligible candidates.

The compiler returns only six editable fields: name, topic, talkingPoint, moods,
energies and rationale. The controller supplies the concept’s accepted genres,
agreed eras and `filtersStrict: true`, then validates the assembled plan against
the unchanged persisted schema. The model cannot overwrite these fixed fields.
Local recovery bounds an overlong rationale; obsolete genre-wrapper and
year-format recovery is unnecessary because the compiler no longer returns them.

Prose checks reject periods outside the agreed eras, other station presenters
and unsupported appearance/interview promises. Genre-word detection is advisory
feedback for editing, not a semantic classifier or a final rejection of valid
comparisons. The final music contract still requires the exact declared palette
and era. Keep apostrophes intact or use full-word alternatives; no speculative
punctuation insertion is applied.

Do not promise particular records, artists, running order, regional exclusivity,
release milestones or personal listening history without supporting data. A
persona’s regional interest can explain perspective, not constrain record
origin. Filters cannot guarantee alternating genres, a particular track
sequence, narrative coherence or historical accuracy.

A final period-contract rejection permits **one prose-only repair call** whose
schema contains name, topic and talkingPoint. It cannot change validated music
settings. Revalidate the result and stop on persistent failure. A custom title
remains exact. The normal success path still takes two logical calls.

Coverage correction may add one further concept/compiler pair. Shared SDK
transport retries, formatting recovery and failover can add requests, so these
are not fixed latency/token budgets. No global LLM queue is introduced; previews
and regeneration can contend with live speech.

## Coverage and discovery

A new plan needs at least twice its airtime at a four-minute average: **30 unique
eligible tracks per hour**, or an operator’s higher `minimumCoverage`. Validate
actual filter intersections and exclusions, not sums of overlapping genre
counts. Use the shared candidate diagnostic, genre hierarchy, original-release
year resolution, configured playlists/exclusions, blocklists and duration
restrictions. Unavailable/inactive filters cannot establish eligible coverage.
Live cooldowns, artist separation and availability are checked again at selection.

If coverage is insufficient, permit one bounded correction. Outside the Comfort
Zone must choose another single destination. Time Capsule may choose a better
covered closed period, never remove its era. Deep Discovery must keep a genuine
rare core instead of falling back to popular genres. Persistent failure returns
coverage/setup advice. An unsuccessful regeneration preserves an accepted plan.

Deep Discovery counts each recording once per matching genre, using playback’s
hierarchical semantics: Indie includes Indie Rock. Its rare core is the lower
count tail up to the smaller of the 75th-percentile positive genre count and
half the largest genre count. Uniform/single-genre libraries cannot support a
meaningful rare core and receive library-fit advice.

Offer at most 60 core choices and 20 modest neighbours. Prefer core styles with
at least half the required track minimum as a repertoire cue; otherwise allow
combining smaller core styles. Select the smallest neighbours above the ceiling
before affinity ranking. Shared genre terms from Soul/Leanings/repertoire rank
relevance once per candidate; random tie ordering varies each generation’s
bounded sample. This is a hint, not proof of adjacency or guaranteed variety.

After all filters/exclusions, at least half the unique eligible pool must also
match the core genres. This prevents a large adjacent genre from dominating a
nominal discovery palette. The creative brief names those selected styles and
their specific musical connection instead of restating the host’s wider tastes.

## Preparation, persistence and scheduling

Scheduled Sub/Shows are prepared **within the next 48 hours**, earliest first.
The sweep runs at **05:00 station time**, on startup, after saving the week,
after editing a generated show and after host/guest eligibility changes.
The horizon limits preparation, not scheduling: more distant slots stay in the
weekly grid without a prepared episode. A later sweep picks them up inside its
window; this is not a continuously advancing timer. The UI and README explain
that distinction. The normal on-air path remains a final fallback.

Accepted unchanged plans survive restarts. Configuration changes invalidate
future plans where appropriate; already-airing accepted plans remain fixed.
The shared occurrence owner serialises writes and coalesces generation by
occurrence, rejects stale publication and reconciles removed/resized slots.
Missing/repeated local hours use the station timezone and occurrence boundaries.

Keep generated history for 30 days, bounded to 1,024 records. Remove private
configuration fingerprints from ended history; retain non-sensitive source
music settings needed for regular-show copies. Legacy records can use their
available saved fingerprint or surviving source-show fallback. Do not migrate
historical soft-filter episodes to strict filters during this cleanup.

### Takeovers

The Dashboard lists Default Programming, regular shows A–Z, then Sub/Shows with
DJ’s Choice first and the others A–Z. Schedule’s order selector shares ordering;
airtime totals combine generated variants by template. Regular saved copies
remain separate shows.

Selecting a template prepares a random eligible cast and accepted plan before
activation is available. Show **Generating…** and disable Take Over; keep current
programming on air. Ready previews show title/cast. Duration/template edits
discard the visible preview; stale responses cannot enable activation. Failures
and expiry offer Retry.

`/schedule/takeover/prepare` stores at most 32 drafts, expiring after 15 minutes
or the target schedule boundary, whichever is earlier. Drafts disappear on
restart; accepted episodes persist. Preparing changes neither schedule nor live
override. Fixed duration starts in full on activation; until-schedule-change
previews must still match their boundary.

`/schedule/takeover/activate` rechecks configuration, eligibility, coverage and
window, publishes the accepted episode before the override, and uses the normal
handoff path without another model call. Activation is idempotent; an override
write failure removes the unactivated episode. Reuse one internal show per
template rather than accumulating takeover variants. Direct unprepared
Sub/Show override requests are rejected; regular/default takeover behaviour is
unchanged.

### Playback boundary limitation

Strict eligible-pool acceptance is not an every-track wall-clock guarantee.
Shared upstream selection anticipates show boundaries by **120 seconds**, and
takeover activation does not flush preselected tracks. Outages and existing
never-starve/fallback behaviour can also affect actual playback.

The 26 October Time Capsule takeover produced 15 consecutive matching selections
for its 1985–1989 Indie Rock/Alternative Rock contract. Two opening exceptions
were selected before activation; a closing exception began 112 seconds before
expiry under the next show’s selection context. This follows the existing
`PICK_SHOW_LOOKAHEAD_SEC` policy; this feature does not change that timing.

## Speech and skills

Sub/Shows keep Programme mode and automatic Banter Breaks off. The normal segment
director and skill crons retain their timing, cooldown, frequency and budget
gates. Eligible skills must also belong to the host and be enabled/ready; the
Sub/Shows list restricts automatic usage rather than granting ownership.
Explicit operator Run now retains its normal override behaviour.

All five templates return one non-empty talkingPoint. The controller appends
**Talking point (optional thread): …** to the existing topic field, within the
2,000-character persisted limit. This is occasional editorial context for links
and skills, not a scripted arc, extra filter or instruction to repeat the same
question. Invite subjective taste, listening habits, discovery, hypothetical
associations and naturally different opinions as well as musical qualities.
Do not fabricate memories or require either disagreement or consensus.

The editable **Sub/Show Talking Point** skill is the short-discussion counterpart
to regular-show banter. It ships disabled by default; existing edits, enable
choices and assignments are preserved. Its tool requires the explicit label,
identified current track and conservative genre/text relevance. It stands down
without support, including on manual runs, and on solo shows. The brief allows
at most two turns per participant, first-person delivery and only the supplied
current recording. Genre relevance does not verify instrumentation, influence,
lyrics, credits or history.

Look Ahead is an editable example, not an automatically enabled skill. It uses
same-day prepared schedule context, excludes the immediately following show,
and lets the current host tease two shows or one upcoming presenter promote
one. Refer to [the skill features guide](../skill-features-guide.md),
[custom skill contracts](../custom-skills.md) and
[show-airing notebooks](show-skill-notebook.md) for reusable guest, cast,
continuity and air-receipt features. Shared examples contain no station-specific
persona dependencies.

## Verification and source map

Pre-cleanup checks on 27 October: controller/web lint and TypeScript, generated
schema parity, whitespace and the admin-query audit passed. Controller lint had
zero errors and 1,746 repository warnings. Selected suites reported **529
controller and 14 web tests**, not a complete repository run. Both earlier Codex
findings are resolved: fixed guests are excluded from initial random-host draws,
and Schedule show saves use the shared Settings/Dashboard cache reconciler.

The later UIAudit fixes passed web lint/TypeScript and isolated Chromium checks
at 1280px, 375px and 320px in light/dark modes. They cover valid long-title
geometry, two collapsed cards, 44px mobile targets, labelled episode headings,
keyboard scrolling, save/cancel and dirty/concurrent eligibility handling.
Shared regular-Show layout also passed. Default measured contrast: accent-button
labels 5.46:1, light introductory copy 4.81:1, dark introductory copy 5.11:1.
Custom palettes and assistive-technology/device combinations need separate
assessment. Browser API traffic was mocked; no live controller writes occurred.

Default-persona/no-show trials found invented musical assumptions before the
readiness gate. Afterward all 15 untouched-default cases returned intended
setup advice; enriched positive controls produced accepted plans for all five
templates. Trials used a substantial library snapshot, not a live tiny-library
installation. All five templates have station airing/takeover observations;
Look Ahead, temporary guests and Talking Point also received trials. Autumn DST
operation was reported; synthetic missing/repeated-hour tests provide additional
coverage. These observations do not prove universal musical or notebook quality.

| Area | Source |
| --- | --- |
| Planner, brief and coverage policies | `controller/src/broadcast/show-generation.ts`, `show-brief-contract.ts`, `show-planning-policy.ts`, `show-discovery-policy.ts` |
| Occurrence owner and sweep | `controller/src/broadcast/show-preparation.ts`, `generated-show-registry.ts` |
| Prepared takeovers | `controller/src/broadcast/takeover-generation.ts` |
| Actual eligible-pool diagnosis | `controller/src/music/show-candidates.ts` |
| Persistence and saved configuration | `controller/src/schemas/show-preparation.ts`, `show.ts` |
| Admin endpoints | `controller/src/routes/shows.ts` |
| Settings/history and regular-show copies | `web/components/admin/TemplateShowsPanel.tsx`, `shows/GeneratedShowEditor.tsx` |
| Schedule and Dashboard controls | `web/components/admin/schedule/`, `dash/TakeoverCard.tsx` |

The isolated `common-ground:preview` harness supports all five templates;
`sub-shows:fresh-preview`, `comfort-zone:preview` and `time-capsule:preview` are
convenience commands. It copies station/library inputs into temporary state and
never saves or schedules generated plans. See its `--help` for cast, duration,
operator-direction, custom-title and fresh-user options. Live model work can be
slower while the running station uses the same service.

## Template ideas for later exploration

Keep the shipped set at five. The following are proposals, not supported saved
template IDs or promises about selection order.

| Working name | Musical idea | Requirement or caution |
| --- | --- | --- |
| Forgotten Favourites | Revisit previously loved music. | Needs listening/favourite history to influence actual track picking. Deferred. |
| Hidden Gems | Explore tracks with little or no airplay. | Needs track-level airplay evidence; catalogue rarity alone is insufficient. |
| Fresh Arrivals | Connect recent library additions to familiar tastes. | Use addition timestamps, not an invented release-date restriction. |
| Across the Decades | Follow one musical thread across eras. | Needs covered eras; filters alone do not order records chronologically. |
| Unexpected Connections | Connect distant genres through a musical characteristic. | Needs a credible bridge rather than invented influence/history. |
| Host’s Obsession | Focus on one corner of the DJ’s tastes. | Soul remains usable when Musical Leanings are absent. |
| Night Journey / After Hours | Reveal another side of the DJ in a late-night setting. | Presentation intimacy does not imply low-energy music. |
| Opposites Attract | Explore organic/electronic, delicate/heavy or polished/raw contrasts. | Complementary genre groups cannot guarantee back-to-back alternation. Set aside. |

## Cleanup and second-call evaluation

The strict-policy cleanup removes only unreachable non-strict branches in new
plan generation/acceptance and narrows planner template inputs to the existing
five-template type. It does not change prompts’ musical direction, accepted
history, coverage thresholds, cast rules or retry limits. The second call’s
response contract was unchanged in that cleanup; the subsequent implementation
below adopts the evaluated six-field shape.

Cleanup verification: controller TypeScript passes; the selected show and
takeover groups report 323 and 30 passing tests respectively. Scoped lint has
zero errors and 15 existing warnings. These are focused checks, not a rerun of
the complete earlier regression selection. No station source or state changed.

### Pre-implementation second-call evaluation — 27 October 2026

The evaluation recommended removing the fixed-field echo in a separate focused
change while retaining both planning calls, the full editorial instructions,
optional prose repair, persisted schema, coverage checks and failure-preserves-plan
behaviour. The implementation below adopts that recommendation.

The evaluated baseline returned nine fields. The candidate shape returned six:
name, topic, talkingPoint, moods, energies and rationale. The controller supplies
the already accepted genres, eras and `filtersStrict: true`, then validates the
assembled plan. This makes those settings independent of model copying and
allows deleting their wrapper/year-format recovery from this call. It does not
remove the need for prose validation or mood/energy checks.

Five paired local-model replays used saved successful concepts from 26–27
October, one per template, with the configured Meta-Llama-3.1-8B Q5 model. Call
arguments were constructed from the current production compiler prompt/schema;
the candidate omitted only the three fixed response fields and adjusted their
return instructions. Both arms used identical saved proposals, cast, mood
vocabulary and music contracts. The historical request logs truncate long
prompts, so old token totals were not treated as a direct comparison. Advisory
indexed-count context was unavailable and omitted in both arms; missing older
familiar-genre context was empty in both. These are controlled compiler replays,
not full production-generation or library-fit trials.

| Template | Current-shape total tokens | Reduced-shape total tokens |
| --- | ---: | ---: |
| Outside the Comfort Zone | 2,353 | 2,051 |
| DJ’s Choice | 2,239 | 1,884 |
| Deep Discovery | 2,307 | 2,048 |
| Common Ground | 2,347 | 2,057 |
| Time Capsule | 2,307 | 1,993 |
| Total | 11,553 | 10,033 |

All ten replies passed the checked schema, era/cast/appearance, allowed-mood and
exact genre/era contract checks. Candidate assembly preserved every fixed filter.
Input tokens fell from 10,622 to 9,290 (12.5%); total tokens fell 13.2%. Output
length varies with prose, so the total reduction is not solely fixed-field
savings. The first call was not rerun; this is not a measured whole-show saving,
latency claim or estimated failure-rate improvement.

Some briefs/talking points remained generic in both arms, and some questions
omitted an explicit genre connection. Hard-filter preservation does not establish
editorial or Talking Point skill quality. Do not shorten the editorial prompt
as part of this change. An earlier shortened-prompt trial and an incomplete
replay using truncated logs/default mood vocabulary were diagnostic only and
are excluded from the comparison above.

Evaluation scripts/results stayed outside the repository in isolated temporary
state; no station plans, schedule, settings or source changed.

### Six-field compiler implementation — 27 October 2026

The compiler now requests the six editable fields and assembles fixed filters
locally. Its full editorial guidance, `generateShowPlan.musicSettings` telemetry,
coverage correction and bounded prose repair remain. The redundant echoed-filter
comparator and genre/era response recovery have been removed. Existing accepted
plans are unchanged; this source change does not trigger regeneration.

Regression checks cover every template, custom titles, closed/unrestricted eras,
attempts to overwrite the fixed filters, malformed editable fields, period repair
and preservation of an accepted plan after failed regeneration.

Implementation verification: controller TypeScript passes; 321 show and 33
takeover checks pass. Scoped lint reports zero errors and 11 existing warnings
in the changed files. These are focused regression groups, not the entire
controller suite. No station source or state changed.

### Previous station source integration — 27 October 2026


Applied the approved web/README changes from feature commits `f885db13` and
`229f970f` to `/home/jaz666/Docker/subwave` on
`test-station/sleeve-notes-clean-20261014`. This exposes the 48-hour preparation
window and addresses the six UIAudit findings: mobile card sizing, two-card
list capacity, touch targets, contrast, episode accessibility and preservation
of unfinished eligibility edits. Existing station-specific styles are retained.

The feature candidate passed web lint/TypeScript, the admin-query audit and
isolated light/dark browser checks at 1280px, 375px and 320px. The station patch
applied cleanly; no suites were rerun in the integration checkout. No runtime
state was changed and no service was built or restarted. Only `web` needs a
rebuild; controller and broadcast can keep running.

The previous source state is `74476076`. To roll back this integration, revert
its station commit and rebuild web. The operator's next action from the station
checkout is `docker compose up -d --build --no-deps web`, followed by
`curl -fsS http://localhost:7700/api/health`.

### Station compiler integration — 27 October 2026

Integrated the approved strict-policy cleanup, documentation consolidation and
six-field compiler from feature candidate `67ea62b1` into the station checkout
on `test-station/sleeve-notes-clean-20261014`. Only the scoped generation files,
their tests and implementation documentation were copied. Station customisations
elsewhere are retained. Fixed genres, agreed eras and strictness are now assembled
by the controller; existing accepted episodes are not regenerated by this change.

The feature candidate passed controller TypeScript, 321 show checks and 33
takeover checks. Scoped lint had zero errors and 11 existing warnings. The source
integration was checked for whitespace and exact source/test parity; those
suites were not rerun in the station checkout. No runtime state was changed and
no service was built or restarted.

The previous station source state is `478713de`. Revert this integration commit
and rebuild controller to roll back. The operator's next action is
`docker compose up -d --build --no-deps controller`, then
`curl -fsS http://localhost:7700/api/health`.

### Station source integration — 28 October 2026

Candidate: upstream develop `9394ecde` plus the PR fixes through `91d696b2`.
Integrated upstream with the existing station branch, including its Sub/Flow
work. Resolved release metadata to 1.28.0 and preserved both location filtering
and temporary-cast/notebook/Look Ahead support in segment tools. Applied the
future-plan cast invalidation and notebook attribution/duplicate checks as scoped
patches, retaining the station’s extracted WAV-duration helper import.

Rollback source: `654ff6a5`. No runtime settings, skills, notebook files or
accepted plans were edited, and no services were built or restarted. The operator
rebuilds controller, web and broadcast for the changed application and mixer
sources. Rebuild the optional tts-heavy service as well if it is enabled, to pick
up upstream Chatterbox leveling and PocketTTS changes.

Integration verification: controller and web TypeScript checks pass in the
isolated candidate worktree; whitespace checks pass. The segment-tools and
future-plan invalidation implementations match PR candidate `91d696b2` exactly;
the notebook differs only in the retained station audio-helper import. Sub/Flow
source files are unchanged. No test suites were added or run for this integration.

### Station artist-diversity integration

Applied feature commit `59ef1707` to the station after source state `45367b3f`,
preserving the intervening Flow work. All five templates now require distinct
artists based on Music Selection > Advanced > Artist Spacing, in addition to
track coverage. Counts use the effective pool after filters and exclusions;
spacing 25 requires 26 artists for a one-hour slot. Short slots cap this at the
required track-pool size. Takeover activation rechecks variety, and changing the
spacing setting refreshes upcoming plans while leaving on-air plans fixed.

The feature candidate passed controller TypeScript and scoped lint; no tests or
broad checks were rerun in the station checkout. The patch applied cleanly and
whitespace checks pass. No runtime state was edited and no services were built
or restarted. Rebuild controller to apply it. Roll back by reverting this
integration commit and rebuilding controller; previous source is `45367b3f`.
