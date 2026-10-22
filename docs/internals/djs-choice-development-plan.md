# DJ’s Choice development plan

Prepared: 22 October 2026 (Europe/London).
Status: implementation proposal. This commit adds documentation only; no running
station changes or deployment are authorised by the plan.

Product scope: [djs-choice.md](djs-choice.md).
Source inspected: `feat/dj's-choice` at
`3f606418f84de30182c56cb67b8aa1b2417dec79`. Recheck these foundations when
implementation starts.

## Existing foundations

- `controller/src/schemas/show.ts` defines normal show fields, including `topic`,
  `moods`, `genres`, `eras`, `energies`, `filtersStrict` and preparation skills.
- `controller/src/schemas/schedule.ts` stores the weekly grid as show IDs.
  Preserve compatibility: scheduled generated shows can be ordinary definitions
  with an explicit generation mode, rather than a second scheduling engine.
- `controller/src/broadcast/show-occurrence.ts` resolves a scheduled run or timed
  takeover to an occurrence with stable identity and start/end timestamps.
  Consecutive cells for the same show form one run; separate nights are separate
  occurrences. Confirm the intended UX for adjacent generated episodes.
- `controller/src/broadcast/show-preparation.ts` already persists preparation
  results, coordinates concurrent preparation and exposes episode context.
  Its current result contract supports subject/data and an optional artist music
  source, not generated show configurations. Do not hide configuration in free
  text or assume that preparation already overrides show fields.
- That store prunes occurrences ten minutes after their end and bounds pending
  records at 256. It is not a recent-airing history store as currently written.
- `settings.resolveActiveShow()` in `controller/src/settings/persona.ts` is the
  date-aware show lookup used by several consumers. Incoming selection uses
  forecast time; queue look-ahead is defined in `broadcast/queue/pure.ts`.
- `broadcast/programme.ts` handles episode structure; it should run after show
  configuration is resolved. `broadcast/scheduler.ts` and the skill system own
  spoken-segment scheduling; reuse those mechanisms for Coming Up.
- `web/components/admin/schedule/SchedulePanel.tsx`,
  `web/components/admin/shows/ShowEditor.tsx`, and `controller/src/routes/shows.ts`
  are starting points for management. Schema generation is repository-owned;
  never hand-edit the browser mirror.

## Design constraints

Use the existing occurrence lifecycle, LLM SDK, persistence patterns and normal
show editor. No new service, job framework, analyser or audio transport is needed.
Keep ordinary shows unchanged when generation is absent. Separate the saved
slot/template definition from a durable configuration for one broadcast.

The effective episode configuration must reach every consumer that currently
reads show settings: both picker modes and recovery, context/persona resolution,
programme planning, handoffs, fallback playlist building, schedule/player reads
and diagnostics. Trace callers before choosing the integration seam. A UI-only
or prompt-only override would let selection and speech disagree.

The planner may return only the title and six approved music/editorial fields.
Validate structured output with the existing schema vocabulary and limits.
Preserve operator-owned restrictions, authentication and station scope. Never
write the model’s response directly into the whole settings object.

## Phase 1 — occurrence configuration and persistence

1. Add an explicit fixed/generated mode to show definitions, plus template,
   editable planning prompt, casting settings and coverage minimum where needed.
   Define defaults and load/save migration so old shows behave identically.
2. Extend the existing preparation domain with a typed generated configuration.
   Reuse its durable occurrence identity and concurrency handling. Keep artist
   preparation compatible; define a supported composition order or explicitly
   disallow incompatible preparation combinations in the editor.
3. Persist actual cast, accepted title/settings, template and prompt revision,
   generation timestamps, configuration revision, validation results and failure
   reasons. Reuse atomic writes and serialisation; avoid two writable stores
   claiming authority for the same occurrence.
4. Add a shared effective-show view for an occurrence and forecast time. Resolve
   saved template plus accepted configuration without changing the template.
   Keep existing synchronous reads free of implicit LLM calls.
5. Choose a commitment point before first incoming selection. Persist it, retain
   it across restart and disallow silent regeneration after commitment. Pending
   work must recheck occurrence/configuration revision before accepting results.
6. Keep accepted results stable through ordinary roster/template edits; define
   explicit invalidation for deletion, cancellation and unsafe missing cast.

Acceptance: two nights of one recurring show retain independent configurations;
all consumers see the same episode; ordinary and artist-preparation shows retain
existing behaviour; a restart does not redraw the cast or regenerate a committed
show.

## Phase 2 — casting, planning and coverage

1. Resolve the host and guests from eligible station personas before planning.
   Support fixed/random modes, selected candidate rosters and bounded guest
   counts. Exclude duplicates; document empty-roster fallback. Use recent history
   to prefer variety without making small rosters unusable.
2. Add a structured planning prompt through the established LLM SDK/barrels.
   Inputs: host Soul and Musical Leanings, guest context, local slot time and
   duration, editable template direction, library coverage and bounded recent
   episode summaries. Do not expose private prompts on public endpoints.
3. Return a title, `topic`, `moods`, `genres`, `eras`, `energies`, `filtersStrict`
   and a short operator-facing rationale. Validate fields and reject unknown
   mood names/invalid eras rather than silently accepting an unusable plan.
4. Reuse cached genre coverage for prompt context; do not add catalogue-wide
   counting to ordinary schedule reads. For proposed configurations, reuse show
   filtering and eligibility semantics to calculate unique playable coverage.
   Distinguish soft leans from hard filters and use trusted era resolution.
5. Bound corrective attempts for insufficient coverage, invalid responses and
   unavailable providers. Respect automatic-generation budgets and slow local
   models; never block live audio waiting for generation. Persist a clear failed
   or fallback result with a retry policy instead of retrying on every read.
6. Provide DJ’s Choice and the agreed Auto DJ examples. Forgotten Favourites
   must name its evidence source; do not describe arbitrary unplayed music as
   previously loved. If evidence is insufficient, report it and use a documented
   fallback rather than fabricate popularity.

Acceptance: overlapping genres are deduplicated; additional restrictions cannot
hide a pool below X; blocklists remain absolute; failed/empty generation keeps
broadcasting; repeat input reads do not produce repeat LLM calls.

## Phase 3 — prepare the upcoming lineup

1. Add a daily preparation task using existing scheduling infrastructure and the
   station timezone. Proposed default: morning; choose the time in configuration.
2. Enumerate upcoming occurrences far enough ahead to cover early next-day
   slots before selection look-ahead. Reuse the occurrence resolver; test DST
   gaps/repeated hours, midnight runs and contiguous multi-hour shows.
3. Add startup catch-up and prompt preparation for late additions. Bound work
   and concurrency, prioritising earliest starts. Only one job may prepare a
   given occurrence/revision; explicit regeneration creates a new revision.
4. Invalidate uncommitted work when bookings, cast or prompts change. Drop late
   results for cancelled/moved occurrences. A committed occurrence remains
   stable; late operator edits need an explicit outcome.
5. Resolve fallback once when preparation cannot finish in time, and record what
   actually runs. A silent station or zero listeners must not prevent tomorrow’s
   lineup being prepared; generation budgets still apply.

Acceptance: daily task, startup catch-up and first-selection checks cannot race
into different shows; an early slot is ready before its first pick; outages do
not stall the queue or roll the outgoing session prematurely.

## Phase 4 — schedule and operator workflow

1. Expose DJ’s Choice and Auto DJ templates as draggable schedule choices with
   host/guest selectors. Reuse the normal grid’s duration and booking rules.
2. Show template identity before preparation and the episode title/cast after
   acceptance. Keep recurring identity distinct from one occurrence’s display.
3. Add admin preview, edit and regenerate operations for uncommitted occurrences.
   Surface pending, prepared, failed, fallback and committed status, coverage,
   rationale and actionable validation errors. Reject stale edits by revision.
4. Ensure public schedule/player payloads expose only approved display fields;
   never expose Soul, Musical Leanings, planning prompts or private rationale.
5. Preserve API compatibility for clients that only understand show definitions;
   document episode additions and fallback display behaviour.

Acceptance: a user can book 21:00 nightly with different fixed hosts or random
casting, inspect each generated show and change an upcoming episode without
rewriting the recurring definition or any previous airing.

## Phase 5 — recent history and permanent copies

1. Add bounded retention for generated episodes, preserving upcoming and active
   records independently of the recent-history limit. Extend the preparation
   store only if it remains small and clear; otherwise use a bounded history
   archive containing immutable completed snapshots, not a competing authority.
   Proposed initial retention: last 20 past occurrences per station; confirm
   before implementation. No retention number was agreed in discussion.
2. Mark Aired from actual playback events associated with occurrence identity,
   not generation, queue delivery or the scheduled clock. Preserve actual start,
   completion/interruption and fallback evidence; keep unaired/cancelled records
   distinguishable. Reconcile progress after controller or mixer restart.
3. Offer Save as permanent show through the existing admin save path. Populate
   the standard editor with the accepted configuration and actual fixed cast;
   mint a new show ID, clear generation/preparation behaviour that would reroll
   it, and apply current validation. Warn about subsequently deleted personas.
4. Preserve the source history and avoid creating a schedule booking implicitly.
   Existing show limits and duplicate-click handling still apply.

Acceptance: a successful episode becomes an ordinary schedulable show; its
original history is unchanged; a prepared episode that never played is not Aired;
retention never evicts upcoming or on-air state.

## Phase 6 — Coming Up skill

1. Add a read-only station-scoped view of remaining daily schedule occurrences
   with accepted titles, casts and concise briefs. Reuse occurrence resolution;
   never trigger planning from a teaser lookup.
2. Implement an optional skill through the established skills and talk-scheduler
   contract. Let the current DJ choose highlights and phrasing within cooldowns.
3. Exclude past/cancelled shows, respect station-local time, and announce only
   known facts for unprepared slots. Refresh or discard stale rendered promotions
   after schedule/configuration changes, using existing speech placement rules.
4. Keep generation-time intent distinct from verified artist facts. Avoid repeated
   promotion of one slot and exact time claims that are stale when audio airs.

Acceptance: the current DJ can accurately tease tonight’s generated title and
cast; an unavailable plan produces a factual generic tease; changed bookings do
not air obsolete promotions.

## Verification and delivery

Implement incrementally in this feature branch or isolated implementation
checkouts. Read current `CLAUDE.md`, controller/web guidance and the referenced
internal invariants before changing code. No deployment or Docker restarts are
part of this documentation task.

For implementation, use the repository’s `npm test` runners and temp-state
isolation. Cover occurrence/DST resolution, schema migration/mirrors, casting,
unique coverage, bounded failure/retry, generation races, restart recovery,
forecast-time consumers, real airing history, copying, public privacy and teaser
invalidation. Exercise both picker modes and fallback playback with accepted and
failed preparation. UI checks should cover booking, preview, stale edits and
saving a permanent copy. Run affected full suites, required lint/type checks,
and schema generation/parity checks; CI does not replace local suite execution.

For these documentation files, check Markdown links, whitespace and source-path
references. Runtime tests are not required for documentation-only changes.

## Decisions to settle during implementation

- Initial template set beyond the agreed examples; precise favourites signal.
- Daily preparation time, look-ahead horizon and minimum coverage default X.
- Recent-history retention and labels for partly aired/fallback episodes.
- Random rotation strength, empty-roster fallback and guest influence.
- Whether adjacent instances of the same template require distinct backing show
  IDs to avoid the existing contiguous-run merge rule.
- Interaction with artist preparation and manual timed takeovers; initially
  either support them explicitly or explain the restriction in validation.
- Exact commitment boundary and operator workflow for edits after selection.

These choices do not block documenting the feature and need no speculative new
framework. Validate the smallest complete schedule → prepare → play → retain →
copy path before adding optional templates and promotion polish.
