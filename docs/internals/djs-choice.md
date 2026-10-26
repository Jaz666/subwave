# DJ’s Choice and Auto DJ shows

Discussed: 13–22 October 2026. Status: product proposal with implementation in progress on the feature branch.

Development plan: [djs-choice-development-plan.md](djs-choice-development-plan.md).

## Purpose

Give a DJ authorship of a fresh show for each scheduled broadcast. The operator
places a generated-show slot in the schedule and chooses its casting rules.
Ahead of airtime, the station selects the cast and asks an LLM to design a
coherent show influenced by the host’s DJ Soul and Musical Leanings.

For example, schedule DJ’s Choice at 21:00 every night, with a different named
DJ each night or a randomly assigned host. Each occurrence receives its own
title, brief and music settings. A successful episode can become a permanent
ordinary show.

## Agreed direction

- DJ’s Choice is a distinct show type available to drag into a free schedule slot.
- DJ’s Choice is the open-ended catch-all, guided by the host’s identity and
  taste within station restrictions and available music. Existing shows should
  gently steer its editorial angle, without becoming hard exclusions. Its
  genre palette should include a few familiar choices plus related genres the
  DJ plays less often, up to the 15-genre show limit.
- Deep Discovery uses the host’s Soul and optional Musical Leanings to shape the
  show idea, then requires an underrepresented core in its music settings.
  At least half the eligible pool must match that core; larger neighbours cannot
  turn it into a familiar broad-genre show.
- Forgotten Favourites is deferred. It needs listening history to influence
  track selection before the station can make credible claims about what was
  previously popular or loved.
- A custom, editable LLM planning prompt generates the normal show settings.
- Preparation happens ahead of airtime, at a suitable point in the day, and
  generates a show name as well as its configuration.
- Fixed and randomly assigned hosts and guests are supported.
- Keep the last few generated and aired shows, with a way to copy an episode’s
  setup into a new permanent show.
- A DJ skill can look ahead at the day’s schedule and tease prepared shows.

DJ’s Choice, Common Ground, Deep Discovery, Outside the Comfort Zone and Time Capsule are accepted template options in
saved settings. Common Ground also has a dedicated comparison harness. Unsupported legacy template names use the
existing load-time fallback to DJ’s Choice; retained episode history is unchanged.
Random casting uses the station-wide Sub/Shows pools. Common Ground uses the
Random Hosts pool for both participants, including explicitly selected DJs.
Legacy per-show candidate lists are ignored and stripped during normalization;
removing them does not change a slot’s random/fixed host or guest modes.

For DJ’s Choice, “fresh” means a specific premise that naturally offers some
variety from the host’s other regularly scheduled shows. Existing shows help
identify familiar genres and angles; they are not forbidden subjects or genres.
The music palette can keep some recognizable favourites while reaching into
related genres. It does not guarantee a never-repeated combination or a disjoint
track list.

## Normal speech scheduling

Sub/Shows do not use Programme mode. Both strict show saves and lenient loads
normalize generated slots to `programme: false`, including older slots saved
with the previous automatic Programme flag. New scheduled templates also start
with it off. Regular programmes retain their existing behaviour.

The standard segment director and automatic skill crons keep their normal talk
windows, frequency, cooldown and budget gates. Sub/Shows eligibility is applied
through the shared skill policy in both paths and rechecked for automatically
forced capability runs; explicit operator Run now remains an override. A null
eligible list permits all otherwise eligible skills, and an empty list permits
none. Host ownership, enablement and co-host requirements still apply.

All three templates require a separate, non-empty `talkingPoint` in the concept
response. The controller appends it to the saved brief as **Talking point
(optional thread): …**, using the existing topic field and normal show context.
Links and segments can therefore pick it up without another model call or a
separate context setting. The concept summary reserves space so the combined
brief stays within the existing 2,000-character limit.

The point is one specific musical question or contrast for occasional natural
comments, not a script, mandatory feature or repeated prompt on every link. It
must fit the selected music and does not impose additional filter restrictions.
Existing accepted episode plans are retained until regenerated.

## Compact planner station trial — 23 October 2026

The station trial promotes the compact two-call preview: the concept call returns
the name, brief and 1–6 intended genre tags from the recommended shortlist. The
music-settings call receives only that proposal, selected genre counts, duration,
operator direction and mood vocabulary. Its schema and a local set check require
the same genre palette without omissions, additions, substitutions or duplicates.
The second call no longer repeats the Soul, guest identities, existing shows or
full catalogue enum. Reported settings-call totals in the three preview trials
were approximately 1,000 tokens each. Editorial quality remains an on-air trial;
mechanical palette preservation does not validate prose or musical connections.

Production telemetry retains `generateShowPlan.concept` and
`generateShowPlan.musicSettings`. Existing coverage correction, custom names,
narrow formatting recovery, cast resolution and accepted-plan persistence remain
in use. No prompt-version marker is added to the configuration fingerprint, so
this code change alone should not invalidate accepted episodes. Regenerate an
upcoming episode explicitly to try it; retain previously reviewed episodes.

Deployment base: station source `e7df2405`. The previous controller image is
retained locally as `subwave-controller:before-compact-20261023`
(`sha256:05c404589cc30498caac93573a98dae8174f3bc7803ceb4e6861e2f9c395b2bf`).
Rollback is to revert the compact-planner promotion commit and rebuild only the
controller; the web and broadcast services do not need replacement.

## Generated episode

Generation is led by the resolved host's editorial voice, not by a preset list
of filters. Resolve the host before planning. The prompt uses that DJ's Soul and,
when present, Musical Leanings as its primary creative input; guest identities
can influence the result secondarily. The LLM writes the show brief first, names
the show from that brief, then chooses music settings that express the brief.
Template direction, station restrictions and playable library coverage guide
that work without replacing the host's taste.

The Soul is the primary source of the DJ’s musical preferences as well as their
identity; Musical Leanings is optional supplementary guidance. The concept
pass distinguishes those preferences from delivery and interaction instructions;
the settings pass receives its declared musical intent.
A calm voice does not imply calm music, and favourite decades do not require an
era window. The generated brief frames presentation; the show filters drive
track selection, with Musical Leanings a soft influence between candidates.
Mood, era and energy arrays default to empty, and strictness to false, unless
operator direction or a concrete musical need justifies a restriction. Raw genre
counts do not establish coverage after intersecting those extra restrictions;
soft filters are not a reason to accept an implausible matching core.

The concept pass receives the bounded recommended genre shortlist; the settings
pass receives only the intended genres from its accepted concept. The compact
trial restricts model output to that declared palette; the previous full-catalogue
enum is no longer sent to the settings call. The brief may promise a
few supported genres; the music-settings pass must represent those promises
using exact supported tags or musically appropriate listed subgenres, explained
in its rationale. Presentation instructions do not become filters. The concept
must not copy the Soul’s whole genre list, promise a specific opening artist or
track, or assert an artistic influence without research. These are prompt
instructions, not a deterministic semantic consistency validator. The settings
pass translates the accepted brief rather than planning a second show: exact
promised tags take priority over rarity and palette-size guidance, genuine
subgenres may represent broader promises, and unsupported promises must be
reported honestly in the rationale rather than rationalized as fulfilled.
Host taste guides interpretation and related additions after promises are covered.

The planner returns a title, a brief and these existing show controls:

| Operator-facing field | Current source field |
| --- | --- |
| Show Brief | `topic` |
| Music Mood | `moods` |
| Genre Leans | `genres` |
| Eras | `eras` |
| Energy | `energies` |
| Strict Filter on/off | `filtersStrict` |

The generated title follows from the brief and becomes the episode’s display
name; the recurring slot retains its DJ’s Choice or Auto DJ template identity.
Programme mode is excluded from Sub/Shows. Voices, eligible skills, playlist
restrictions and duration stay under operator control.

Here, “tags” means the generated music settings: `moods`, `genres`, `eras`,
`energies` and `filtersStrict`. They must fit the brief and eligible library.
These are distinct from the existing show `tags` field, which remains an
operator organization feature and is not generated.

Example: DJ’s Choice → Mara → “After the Last Train”: nocturnal soul, dub and
spacious electronic music, with a reflective brief and moderate energy.

Preparation inputs should include the selected host’s Soul and Musical
Leanings when present, the names and music settings of their other regularly
scheduled shows, guest identities, slot duration and station-local time, template
instructions, bounded library coverage, and summaries of recent episodes.
Existing show filters are soft context for familiar repertoire; their verbose
speech and interaction briefs are omitted from both planning passes. Their
genres are not hard exclusions. Its palette can retain a
few of the host’s familiar genres and add related choices from the wider library
up to the 15-genre limit. The brief and name come before music tags, which
should follow from the idea without forcing unrelated genres. Deep Discovery
uses the same host-led concept step, then favors lower-count library genres
that fit the brief and have enough playable coverage. The host supplies the
main point of view; Musical Leanings are inspiration, not a genre limit. Guest
influence is secondary. Recent choices by this host and other hosts can
encourage variety without forcing unsuitable music.

The planner chooses an editorial configuration, not a complete fixed playlist.
Normal track selection and broadcast controls remain responsible for playback.
Normal DJ speech consumes the accepted episode brief as editorial context,
including its optional recurring talking point, without a Programme arc.

## Casting

Offer a specific host or random selection from an operator-selected eligible
roster. Guests may be absent, explicitly selected or random. Random guest
count may be fixed or “up to” the permitted maximum.

Select the cast before generating the show. Persist the actual cast with that
occurrence so a restart or later schedule read does not redraw it. Prevent
host/guest duplication and respect the existing guest limit. Rotation-aware
randomness, avoiding recent hosts and repeated pairings where possible, is a
suggested default rather than a strict promise when the roster is small.

## Template directions

| Template | Direction | Status |
| --- | --- | --- |
| DJ’s Choice | Catch-all led by the host, with a gentle preference for variety from their existing shows | Active |
| Auto DJ – Deep Discovery | Start from the host’s taste, then favor less-represented library genres with playable coverage | Active |
| Auto DJ – Forgotten Favourites | Revisit music based on listening history that can also shape track selection | Deferred until that evidence is available |
| Auto DJ – Hidden Gems | Explore tracks with little or no airplay | Suggested |
| Auto DJ – Fresh Arrivals | Explore recent additions with familiar connections | Suggested |
| Auto DJ – Across the Decades | Follow a musical thread across eras | Suggested |
| Auto DJ – Unexpected Connections | Connect distant genres by mood, sound or influence | Suggested |
| Auto DJ – Host’s Obsession | Explore one corner of the host’s Musical Leanings | Suggested |
| Auto DJ – Night Journey | Interpret a late-night slot through the host’s taste | Suggested |

Templates should expose editable prompts; saving custom templates is a proposed
extension. Choose the initial shipped set during implementation planning.

### Deep Discovery and playable coverage

Deep Discovery scans the entire indexed genre catalogue, using playback's
hierarchical matching counts rather than exact-label assignments: Indie also
counts Indie Rock, and multi-tagged recordings count once per genre. A broad
tag cannot masquerade as rare because few files use its exact label.

The underrepresented core is the lower-count tail up to the smaller of the
75th-percentile positive genre count (rounded down by rank) and half the largest
genre count. A single-genre or nearly uniform library has no meaningful core;
return library-fit advice instead of inventing a discovery premise. These are
relative catalogue counts, not a fixed minimum library size.

Offer up to 60 core choices and 20 modest neighbours. Prefer core styles with at
least half the required eligible-track minimum as a repertoire cue; if none
reach that cue, offer larger core styles that can be combined. The neighbour
pool is bounded to the smallest genres above the core ceiling before ranking;
it no longer appends the 20 most popular genres. Rank core choices and those
bounded neighbours using shared genre terms from the host's Soul, optional
Leanings and regular-show filters. This is a relevance hint, not proof of
musical adjacency, and does not change which genres qualify as rare.
Count shared-term relevance once per candidate: compound labels such as
"Hip Hop" must not gain extra priority from overlapping word fragments.
On each generation, randomly order equally relevant candidates before taking
the bounded sample. This varies the palette's membership and presentation
without changing rarity or coverage rules. The model still chooses the musical
thread; list order is not a suggested combination, and regeneration does not
guarantee a different result in a narrow library.

The creative call first describes one host-related musical neighbourhood, then
chooses the palette before writing its brief. The brief must name those styles
and their audible connection, rather than restating the host's wider tastes.
The compiler names the selected styles in its opening sentence and rewrites a
generic or contradictory draft around the accepted discovery focus.
Counts are deliberately omitted from its genre lists so
matching numbers are not mistaken for musical connections. The second call
still compiles and edits the accepted proposal. Genre counts overlap and precede
filters/exclusions, so are not an eligible-track guarantee.
Smaller library genres and neglected airplay are different signals:
the first uses catalogue counts, the second needs history. The brief must not
invent a personal record collection or drift into Forgotten Favourites.

Do not add genre counts blindly. Count unique eligible recordings using the
actual show-filter semantics after generated eras, moods, energy and strictness
are applied, along with fixed library restrictions and blocklists. Overlapping
genres must not count the same track twice. Soft leans and strict restrictions
must retain their existing meanings. Explain which pool the reported count
represents. Apply live cooldowns again at selection time; preparation cannot
promise future availability.

If coverage is insufficient, broaden the proposed configuration or retain a
usable fallback. The minimum X is configurable; no numeric default was agreed.

## Daily preparation and promotion

Generated shows are prepared before airtime so the DJ can tease the next show
and hand over with its accepted title and brief. The controller prepares the
next 48 hours at 05:00 station time and catches up on startup. Saving the weekly
schedule or editing a generated show's host/guest settings also starts
preparation for its upcoming occurrences in the next 48 hours. Accepted plans
already on air remain fixed. Choosing a generated show
for a takeover starts preparation for that takeover occurrence immediately.
The normal on-air preparation path remains a final fallback. All timing uses
the station timezone and must handle daylight-saving changes.

The Sub/Shows page separates upcoming, currently airing and past episodes. Its
host, guest and skill eligibility controls start collapsed. Upcoming episodes
have a regenerate action (`POST /shows/generated/regenerate`, with an
`occurrenceId`). It reruns the planner for that occurrence with its current
casting rules, bypasses the accepted-plan cache and retry cooldown, and shares
any request already running for that occurrence. An accepted plan is replaced
only after success; model failures retain it. Requests for missing, changed,
already airing or past slots are rejected, and a result arriving after airtime
or a schedule edit is discarded. Ready episodes in any phase offer an icon action with the tooltip “Save as
regular show”. It opens the normal show editor on an isolated copy containing
the accepted title, brief, cast and music filters, with the recorded playlist
restrictions. Saving creates a new ordinary show without booking any hours or
changing the source episode. The copied show has no generation behaviour or
Programme mode. Its stable new identity makes repeated saves idempotent; after
saving, the icon opens the saved show. Deleting that saved show permits saving
a fresh copy later.

The optional editable “Look Ahead” skill reads the remaining schedule for the day and
its accepted episode titles, casts and briefs. It must not generate episodes or
invent unprepared titles. It skips unprepared slots and excludes the next scheduled show occurrence. Vary highlights, observe cooldowns, and refresh facts when
the schedule or preparation changes. Generated briefs describe intended content;
they are not evidence of artist biographies or music-history claims.

## Recent episodes and permanent shows

Keep a bounded recent history of prepared and actually aired occurrences.
Store their title, six generated settings, actual cast, template/prompt revision,
scheduled time, generation time and actual airing evidence. Distinguish Prepared
from Aired; generation or queue admission alone does not mean broadcast.
Cancelled, failed and fallback outcomes should be visible without claiming the
planned show aired. Exact retention and partial-airing labels remain open.

“Save as permanent show” opens a populated copy in the ordinary show editor.
Use the episode’s actual host, guests and accepted settings; give it a new show
ID, clear generation/randomisation behaviour, and leave the original record and
schedule untouched. Saving makes an ordinary show available to schedule; it
must not automatically book it or overwrite an existing show.

## Reliability and scope

Persist each occurrence’s accepted configuration. Preview, edit and regenerate
before it is committed for playback; edits afterwards must not silently change
queued or aired material. Keep the recurring template separate from episode
settings. Missing models, failed planning, token limits or insufficient coverage
must leave the station able to play its documented fallback configuration.

The separate neglected-library report is deferred: recommend changes to existing
show configurations to cover neglected artists and genres. Optional Driving
Beat analysis and protected Sub/Flow track groups are separate proposals and
are not prerequisites for DJ’s Choice.

### Deep Discovery coverage policy

New Deep Discovery plans use strict filters. Choose a coherent underrepresented
core plus adjacent genres as needed, up to 15 genres. Require at least twice the
slot airtime using a four-minute average: 30 unique eligible tracks per hour
(60 for a two-hour slot), or the operator minimum if higher. The existing
candidate diagnostic checks the combined palette after configured exclusions,
blocklists and active filters, without double-counting overlapping genres.
Transient artist spacing and recent-play exclusions are not included; the
twofold buffer provides headroom for these at playback.

At least half the final unique eligible pool must also match core genres.
Diagnose the core subset with the same era, mood, energy, duration, vocal,
playlist and exclusion settings as the full palette. Skip the extra diagnostic
when every selected genre is core. A token rare tag alongside a dominating
broad genre fails even if total coverage is ample. This is a candidate-pool rule,
not an airplay quota, guaranteed first plays or a fixed running order.

Keep mood, era and energy restrictions empty by default; an era needs an
explicit operator/title period request. Deep Discovery allows at most two mood
tags, and the compiler asks for mood/energy restrictions only when the operator
requires them. A deficient plan gets one correction
attempt to add coherent core styles or reduce dominating neighbours as needed;
if coverage or core share is still deficient, reject the result and retain any
existing accepted plan. Accepted episodes are not automatically
regenerated by this policy change: regenerate upcoming episodes to apply it.
DJ’s Choice uses the same strictness and twice-airtime coverage check; its
familiar-core policy is described below.

All preview modes now run the production acceptance/one-correction path, not
just raw generation. Deep Discovery reports the core names, global rarity ceiling,
per-genre matching counts, eligible core/full counts and core share. The regular
cast preview uses the operator's allowed persona roster and an isolated snapshot
of source settings, library and blocklist; no episodes are saved or aired.

On 25 October a one-hour scheduled plan using Alternative Rock, Indie Rock and
Electronic admitted 19,912 of 68,224 indexed tracks before exclusions. All three
were also in the host's regular-show filters. Its concept had chosen that broad
palette; the compiler had correctly preserved it. The old combined-pool minimum
could not detect the missing discovery core.

Two previous one-hour controls with the same host/guest pairing both selected
Alternative Hip Hop (20 matching tracks) and East Coast Hip Hop (16), yielding
36 eligible tracks and 100% core participation. Earlier ranked trials also
produced a 68-track Alternative/Conscious Hip Hop palette and a 118-track palette
including Industrial Rock. Early iterations exposed unrelated small-genre piles,
a redundant model core-list mismatch and a model library-fit refusal despite
available choices. The creative focus now precedes the sole genre array, relevant
styles lead the shortlist, and ambiguous single-word genre claims can request
editorial repair without becoming an automatic publication veto.

Two subsequent live regenerations repeated the same three hip-hop styles. The
shortlist rewarded overlapping "hip", "hop" and "hiphop" terms and always
presented the same choices first. Relevance now counts once per candidate, and
equally relevant choices vary in order before sampling. An initial varied
preview exposed a contradictory brief and one rejected unselected-style claim;
the concept now writes its palette before its brief, and the compiler explicitly
describes the selected music. Three refined one-hour previews with an identical
host/guest pair produced Alternative Punk/Noise Rock (88 eligible tracks),
Power Pop/Folk Pop (135), and Alternative and indie/Contemporary Folk (41).
All three passed the production acceptance path with 100% core coverage and
no correction call. Their generic themes and talking points still leave room
for editorial improvement; this sample demonstrates variety, not a guarantee.

The runtime policy cannot prove musical coherence, guarantee a new palette on
every regeneration or eliminate unjustified model refusals. Eleven discovery-policy
tests cover rarity, core share, correction, exclusions and metadata failures;
with twelve brief-contract, thirteen readiness and nine generation/regeneration
tests, 45 focused controller checks pass. TypeScript and scoped lint pass (existing
`any` warnings remain). Cached accepted episodes are unchanged: regenerate them
after rebuilding the controller to apply this policy.

### Pre-review regression coverage

`npm --prefix controller test -- sub-show-template-rules` runs fourteen
deterministic checks with synthetic personas, temporary state and injected
generation/coverage results. No station LLM or live library is used.

The checks cover Common Ground's default single guest, selected-guest counts,
use of the allowed host pool for both participants, stable casting within an
airing, and failure when two eligible participants are unavailable. They cover
Outside the Comfort Zone's solo contract, single destination and mandatory
destination change after failed coverage. Time Capsule checks include regular
casting pools, single-year and ten-year inclusive periods, rejection of open or
multiple periods, and retaining the era requirement during correction. All
three templates are checked for strict filters, nonempty genre palettes and
twice-airtime coverage with exactly one correction at 30, 60 and 90 minutes.

These pin schema, casting and acceptance behaviour, not the quality of an LLM's
musical judgement or every prompt requirement. The fourteen checks, scoped lint
and controller/preview/new-test TypeScript passed. No production code changed.
The next batch adds seventeen notebook and eleven special-guest checks using
temporary files, a synthetic roster and injected model results. It covers
per-turn air commits, fixed topics, bounded history, isolated airings, confirmed
and ambiguous delivery receipts, cancellation, expired leases, reset/corruption
guards, a fresh-process read of committed memory, and rendered-turn recovery.
Guest checks cover explicit prompt directives, roster resolution, duplicate and
invalid casts, tool precedence, participant limits and unexpected model speakers. A
five-turn numbered exchange preserves its final host reaction. The existing
co-hosted suite now distinguishes flexible discussion order from explicit plans;
its twelve checks pass.
Both suites, scoped lint and controller/preview/new-test TypeScript pass without
station LLM calls or production changes. End-to-end queue/mixer crash windows,
backup/restore remain separate review tasks.

The lifecycle batch runs eleven `generated-show-lifecycle` checks, ten
`takeover-generation` checks, seven `show-occurrence` checks, nine
`generated-shows` checks and eleven `takeover-window` checks (48 total).
Restart recovery is tested with fresh owners and a fresh process. Coverage
includes accepted/on-air plan retention, bounded failed-generation retries,
failed manual rerolls, short pools, stale results, edits while generation is
pending, shuffle contention, both sides of an adjacent-slot boundary edit,
obsolete-plan pruning and history retention. Time checks include midnight,
repeated/missing DST hours and quarter-hour timezone offsets.

Takeover tests use the real preview/activation flow, synthetic SQLite tracks
and stubbed LLM/Navidrome responses; no live service or mixer is called. They
cover draft isolation, activation-time duration, exact accepted-plan reuse,
duplicate activation requests, expiry, changed eligibility/pool/window,
failed-switch rollback and metadata failures. This exposed and fixed two bugs:
a waiting generation request could miss an edit already present in its own
snapshot, and takeover activation checked pool size without rejecting inactive
genre locks. Waiting callers now compare the completed result against the
latest slot; activation reuses the shared unavailable-coverage policy.

All 48 checks, controller/preview/new-test TypeScript and scoped lint pass
(existing lint warnings remain). These checks do not simulate every process
crash during a write, browser interaction, mixer delivery or backup restore.
The two controller fixes need a rebuild; accepted episodes are not rerolled.

### Failure, contention and cost review

Ten further regression checks cover failure during either structured call,
preserving an already-active takeover during a new failure, bounded coverage
correction, a workable shorter slot, empty/genre-less libraries, a single-genre
Deep Discovery refusal, serial look-ahead preparation and continuing the sweep
after one failed airing. A cross-contract check keeps the diagnostic's strict
zero-match count separate from a runtime never-starve pool.

Normal successful generation makes two logical structured calls. One coverage
correction adds a second pair, rather than an unbounded search. Shared SDK
format recovery, transient retries and configured failover can add transport
requests; four is not a universal HTTP-request cap or token budget. The stubbed
401 cases currently make two transport attempts for a concept failure and three
total when the concept succeeds but compilation fails, due to shared SDK text
recovery. No Sub/Show-specific provider retry policy is introduced. Empty or
genre-less libraries, and Deep Discovery without a rarity core, stop before a
model call. These are call-count checks, not live token/latency benchmarks.

The 48-hour sweep prepares distinct future airings in order, one at a time,
deduplicating contiguous hours and skipping an already-airing slot. Identical
occurrence requests share an in-flight generation. Independent requests, such
as different slots and takeover previews, can still overlap and compete with
on-air speech for the configured LLM. There is no new global queue, cumulative
episode token budget or shorter provider timeout in this feature.

Coverage diagnostics use hard locks, including to an empty pool, and acceptance
still requires twice the airtime after exclusions. Playback retains Subwave's
existing safety behaviour: the pool picker and final fallback use per-dimension
never-starve filtering; unresolved genre metadata can disable a runtime genre
lock, while a resolved short genre pool can loop. The offline fallback also has
its existing playlist/exclusion safety behaviour. The absolute station blocklist
remains a separate hard prohibition. A Sub/Show's Strict filters badge therefore
does not guarantee every aired track under metadata loss or exhausted pools.
No dead-air policy was changed to make generation pass.

The expanded takeover and lifecycle suites, plus show-filter, show-candidates,
music-starve, auto-playlist-show, generation-lifecycle, blocklist, planning-policy
and discovery-policy groups pass (170 reported tests). Controller/preview/test
TypeScript and scoped lint pass, with existing warnings where applicable. No
production code changed, no station model was called and no live audio was
generated. This does not simulate real provider load, every SDK/provider retry
combination or a full mixer outage.

## Template ideas for later exploration

### Fresh-install regression scenario

The isolated comparison harness accepts `--fresh-user`, also available as
`npm run sub-shows:fresh-preview -- --template <template> --count 3` from
`controller/`. Set `STATE_DIR` to the source station state root as with the
other previews. Run once for each of `dj-choice`, `deep-discovery`,
`common-ground`, `outside-comfort-zone` and `time-capsule`.

This writes shipped DEFAULTS into temporary settings/schedule files: the three
seed personas (Marlowe, Wren and Hale), no separate Musical Leanings, no saved
shows, an empty schedule and unrestricted eligibility pools. It omits the source
station's blocklist. Only service connections and a library snapshot are reused;
no source persona, show, schedule or skill configuration is retained. It asserts
the empty fixture, checks 60 deterministic random casts per template, then tests
each default persona as host with the template's normal random-guest policy.
Outside the Comfort Zone stays solo and Common Ground requires one guest.
Generation uses the production acceptance/coverage/retry function. No episodes
are saved or aired and the source station is unchanged.

The 25 October 2026 run completed all 15 one-hour previews and 300 casting checks.
Every accepted plan passed strict coverage with at least 30 matching tracks:

| Template | Marlowe | Wren | Hale |
| --- | ---: | ---: | ---: |
| DJ's Choice | 5,870 | 10,493 | 45,901 |
| Deep Discovery | 1,378 | 194 | 170 |
| Common Ground | 29,994 | 10,732 | 29,994 |
| Outside the Comfort Zone | 279 | 195 | 279 |
| Time Capsule | 635 | 635 | 635 |

This is a successful mechanics check, not a pass for fresh-install editorial
quality. The seed Souls describe presentation style without explicit musical
tastes. Generation inferred preferences from those speaking traits, and two
Outside the Comfort Zone rationales invented established Soul/Funk repertoires
despite the empty show list. One Deep Discovery plan mixed 15 unrelated genres
under an electronic-music brief. Seven of the nine DJ's Choice, Deep Discovery
and Common Ground plans introduced unrequested era filters (including two
effectively unhelpful 1900-onward windows). All Time Capsule hosts converged on
1965–1969 with the same palette; one brief additionally promised Blues Rock,
which was absent from the accepted filters.

### Musical readiness and library suitability

The first concept call now assesses readiness before proposing an episode.
The host must have concrete musical evidence in their Soul or optional Musical
Leanings; Common Ground requires this from both participants. Existing shows
are supporting repertoire context, never a prerequisite. Speaking style alone
cannot establish musical taste. Unchanged shipped presentation-only Souls and
empty profiles stand down before loading the library or calling the model.

For other profiles the concept response contains an assessment and a nullable
proposal. Exact supporting quotations are checked against each participant's
own source text. A narrow local guard also rejects obvious delivery-only quotes
without musical language or a library genre. Clear catalogue-genre preferences
in Musical Leanings, or explicitly expressed preferences in Soul, also count
directly if the model quotes the wrong field. These checks do not classify every
possible musical taste. Missing evidence returns advice to add musical detail, with
an external [Musical Leanings guide](https://github.com/perminder-klair/subwave/discussions/1817)
at the bottom of the message. Both the Sub/Shows episode card and takeover
preview render that guide as a clickable external link. This adds no model call
to successful generation; meaning and musical coherence still rely on the model.

Library suitability is assessed for the chosen template. A large or narrowly
tagged catalogue need not support a credible departure or shared musical
connection. Failure explains that fit problem without labelling the library
small or silently switching templates. Track-count failures separately report
the slot length, required count and actual eligible count after exclusions,
with advice to shorten the slot, try another template or add suitable music.
The twice-airtime/four-minute rule, higher operator minimum and single coverage
correction remain. Unresolved genres or inactive metadata filters fail coverage
verification rather than accepting a count inflated by a missing lock.

The fresh-user harness accepts fresh-only `--music-lean` or `--soul` overrides
for positive controls. Unmodified default-persona readiness refusals are expected
outcomes, recorded with their error code. The library snapshot remains isolated;
no plans are saved or aired. Editorial era restraint and brief/filter agreement
remain separate review concerns. These previews do not exercise browser onboarding.

The readiness rerun on 25 October returned the expected persona guidance for
all 15 unchanged-default cases and again passed 300 deterministic casting checks.
Enriched fresh-user positive controls produced accepted one-hour plans with no
regular shows:

| Template | Musical evidence | Eligible tracks |
| --- | --- | ---: |
| DJ's Choice | Soul only | 4,833 |
| Deep Discovery | Optional Musical Leanings | 178 |
| Common Ground | Optional Musical Leanings for both participants | 1,661 |
| Outside the Comfort Zone | Optional Musical Leanings | 279 |
| Time Capsule | Soul only | 635 |

Initial enriched trials exposed false readiness refusals, one deficient coverage
correction and one invalid settings JSON response. The evidence instruction and
verbatim quotation requirement were clarified before rerunning the first
three templates; the accepted positive controls above do not establish that
model-level refusals, format failures or editorial inconsistencies are eliminated.
A custom presentation-only Soul also exposed an incorrect model approval after
prompt clarification, motivating the local delivery-evidence guard. Another
trial quoted a guest’s delivery instead of their explicit Leanings, motivating
the direct catalogue-genre preference check.
Thirteen focused policy tests and nine existing generated-show tests cover the
readiness gate, quote provenance, per-participant requirements, count advice,
bounded retry, inactive locks and regeneration lifecycle. The existing lifecycle
fixture now supplies an explicit coverage diagnostic instead of relying on a
live music server. Small-pool and metadata-failure tests use injected diagnostics;
the live previews still reuse a substantial catalogue.

### Brief and music contract

The concept remains the creative step: it proposes the brief, title and declared
music palette. Non-Time-Capsule templates also declare `eras`, which must be
empty unless the operator direction or custom title contains a recognised year
or decade request. Favourite decades in persona notes and normal show filters
do not enable era restrictions. Time Capsule still supplies its closed period.

The existing `generateShowPlan.musicSettings` call now also acts as a final
editor. It receives the actual cast, the accepted draft and the exact genre/era
contract, plus any concrete mismatch found in that draft. It preserves correct
wording, the musical bridge and the talking point; it can repair contradictory
promises without introducing a different palette. Correct titles and custom
titles are held fixed. There is no third model call. This changes the internal
response contract, not the persisted episode schema or the two-call lifecycle.

Genre membership, uniqueness and agreed era windows are checked before acceptance.
Default shows cannot acquire a 1900-onward or other unrequested era in the
settings call. Publication checks inspect the final title, brief and talking
point for year/decade promises outside those windows, known presenters outside
the cast and explicit unsupported appearances. They also catch exact multiword
catalogue styles absent from the selected palette. Documented taste/repertoire
references can explain a bridge in Common Ground and Outside the Comfort Zone;
mentioning those starting tastes does not add them to the music filters.

These are bounded text checks, not semantic fact verification. Single-word tags
such as Soul and House are ambiguous in prose and are not used to reject a
brief. Unknown artists, paraphrased styles, historical claims and the distinction
between a comparison and a playback promise still need the editor instructions
and operator review. A remaining detected mismatch fails generation through the
existing path, preserving any accepted episode; filters are never broadened to
justify a contradictory sentence. Existing accepted episodes are unchanged.

The isolated harness also accepts `--direction` and `--name`, allowing an explicit
music period/custom-title control alongside era-neutral templates. The focused
`show-brief-contract` tests cover era/genre preservation, date promises, closed and
open periods, known cast boundaries and explicit catalogue subgenre mismatches.

The 25 October consistency run used enriched default personas with favourite
80s/90s notes, no regular shows and an isolated snapshot of the existing library.
The final sweep accepted all five templates and one explicit custom-era control:

| Preview | Era filters | Eligible tracks |
| --- | --- | ---: |
| DJ's Choice | Unrestricted | 1,667 |
| Deep Discovery | Unrestricted | 176 |
| Common Ground | Unrestricted | 1,667 |
| Outside the Comfort Zone | Unrestricted | 650 |
| Time Capsule | 1965–1969 | 458 |
| Common Ground: Eighties Connections | 1980–1989 | 145 |

Earlier iterations caught a contradictory DJ's Choice subgenre promise and a
decade-description problem; detected draft issues are now supplied directly to
the editor within the same second call. Eleven contract tests, thirteen readiness
policy tests and nine generation/regeneration tests pass, as do controller and
preview TypeScript checks and scoped lint (existing `any` warnings remain).
These establish the concrete contracts and coverage checks, not universal prose
quality or template novelty: an Outside the Comfort Zone destination can still
need review when no regular-show repertoire exists. No live episodes were saved,
regenerated or aired by these previews.

### Bundled Sub/Show discussion skill

`sub-show-talking-point` ships as the Sub/Show counterpart to DJ Banter in
regular shows. Its canonical SKILL.md and tool.mjs now live together in
`controller/src/skills/builtins/sub-show-talking-point`, replacing the manual
installation example. It includes the first-person conversation refinement.
Keep regular Banter Breaks disabled for Sub/Shows.

This remains an editable DJ Skill, using the existing assignment and Sub/Shows
skill eligibility settings. It discusses the explicit episode talking point
with the on-air host and guests, at most two turns each. Its grounded tool
checks current-track genre relevance and stands down when no supported
connection exists. Solo shows skip it. The standard built-in seeder installs
both editable files and restores only missing ones; it never replaces edited
copies. The settings default is explicitly disabled, and cold loading merges
that default before saved toggles so existing stations also start disabled
unless they previously opted in. Existing true/false choices and persona
allowlists are preserved, including the legacy "all skills" sentinel. Nothing
adds it to a persona or restricted Sub/Shows skill list automatically.

Eight `sub-show-skill-install` checks cover first installation, upgrade defaults,
explicit enablement, unchanged assignments, edited-file preservation, partial
installation repair and the bundled tool's relevance/current-track guards.
They pass alongside the existing eligibility, scaffold-preservation and
backup/restore guard suites (25 reported tests total). Controller/preview/new-test
TypeScript passes; scoped lint has no errors (existing warnings remain).

Unimplemented entries below are proposals, not commitments. Each should give
the planner a clear musical question that can be supported by the library and
show filters. DJ’s Choice, Deep Discovery, Common Ground, Outside the Comfort Zone and Time Capsule are implemented;
the remaining ideas below are proposals.

| Working name | Musical idea | Planning approach |
| --- | --- | --- |
| Common Ground (implemented) | Two DJs discover where their tastes meet, including unexpected overlaps. | Use the host and guest Souls, supplemented by optional Musical Leanings, to find a shared musical territory. Guest selection should meaningfully affect the result. |
| Outside the Comfort Zone (implemented) | A DJ makes one coherent sideways move into neighbouring musical territory. | Start from the DJ’s preferences and explore a related area outside their familiar repertoire. More focused than DJ’s Choice; underrepresentation is not required. |
| Time Capsule (implemented) | Explore a particular period through the DJ’s perspective. | Choose an era with sufficient library coverage, then a coherent genre palette. Do not promise historical facts without supporting research. |
| Opposites Attract | Explore a contrast such as organic/electronic, delicate/heavy or polished/raw. | Choose complementary genre groups and make their contrast a recurring talking point. Filters alone do not guarantee alternating tracks or a particular running order. |
| After Hours | Reveal a different side of a familiar DJ through a late-night musical setting. | Let the persona interpret intimacy, hypnosis, unease or spaciousness. Do not automatically equate late-night presentation with low-energy music. |

Time Capsule is implemented following the accepted harness trial described below.
Run `STATE_DIR=/path/to/station/state npm run time-capsule:preview -- --host "DJ name" --count 1`
from `controller/`. The default comparison uses four distinct eligible Random
Hosts, with solo hosts for this initial experiment; explicit guests are rejected.
It uses the same isolated state, local model and sequential generation as the
other preview templates and never saves or schedules episodes.

The first call chooses one closed period (normally 1–5 years, at most 10),
a host-specific musical angle and 1–3 specific genres. Compact library evidence
lists the six most represented available genres within each five-year bin,
using the same original-year resolution as selection. These overlapping tag
counts suggest viable periods; they do not prove coverage for a narrower window.
The second call must preserve the chosen year bounds exactly in one era filter,
along with every declared genre. Both era and genre filters are strict; moods
and energies remain unrestricted. The harness measures actual combined coverage
against twice airtime at four minutes per track and reports failure or shortage
without accepting an episode. The initial harness did not exercise production retry behaviour.

The first trial allowed broad Rock/Pop padding, named artists without research,
historical "birth" framing and a vague 1980s brief for 1985–1989 filters. The
refined concept schema puts period and musical angle before the brief, excludes
umbrella tags, requests exact years in the brief, and disallows artist promises,
historical claims and talking points requiring unsupported influence research.

Second-pass one-hour results (30 tracks required):

| Host | Title | Strict years | Genres | Matching tracks |
| --- | --- | --- | --- | ---: |
| Rock/metal host | Riff Fest | 1975–1979 | Progressive Rock, Hard Rock, Folk Rock | 638 |
| Pop/soul host | Synthetic Dreams | 1985–1989 | Synth-Pop, New Wave, Indie Pop | 498 |
| Eclectic host | Punk New Wave Collision | 1975–1979 | Punk, New Wave, Post-Punk | 820 |

All six model calls in this pass completed and all plans preserved the closed
period exactly in strict settings, with no mood or energy restriction. The
three distinct musical angles and sufficient era/genre pools support further
exploration, but the prose still failed some instructions. The rock/metal host introduced
Yes in the talking point and omitted supporting genres from the brief; the pop/soul host
used a vague mid-80s label and unsupported emergence/influence framing; the eclectic host
promised late-1970s Britain without any country filter or verified geography.
Both the pop/soul host and the eclectic host omitted the exact bounds in their prose. These findings
informed the production changes below; coverage alone does not establish prose
quality or verify historical/geographical claims.

### Time Capsule implementation

Time Capsule is available on the schedule shelf, in Write an Order and Dashboard
Takeover, and in Sub/Shows episode plans and airtime totals, with a blue colour.
It defaults to Random Host and Random Guests (0–3), using the existing eligibility
pools and slot editor. A fixed host, selected guests or no guests are supported.
The host remains the musical lead; optional guests supply additional perspectives.
The preview harness retains its solo comparison mode.

The concept chooses a closed period, normally 1–5 years and never more than ten
years inclusive, with 1–3 specific genres. The second call must copy both year
bounds and every selected genre exactly. A brief lead states the accepted period
and full palette explicitly, even if the model describes the period informally.
The prompt forbids unsupported geographic restrictions, historical claims and
artist promises, and requests a musical talking point within the selected period.
Mood and energy filters remain empty; strict era and genre filters are mandatory.

Coverage must reach twice airtime at a four-minute average, or the configured
minimum if greater, after filters and exclusions. The shared acceptance path
checks closed bounds and retries once with a better-covered closed period and
coherent palette, keeping the same cast. It cannot remove the era restriction
or relax strictness. Insufficient coverage after retry uses the existing failure
path. Shared preparation triggers, regeneration, host shuffle, permanent-show
saving, DJ Skills and Look Ahead all apply. Banter Breaks remain disabled.

Outside the Comfort Zone is implemented after a harness trial. Common Ground
uses exactly one distinct guest and equal musical influence for both DJs; the
host still leads presentation. It uses strict genres with the same twice-airtime
coverage checks as the other Sub/Shows.

Templates promising alternating DJ selections, specific tracks or a precise
musical progression would need additional influence over the track picker.
Forgotten Favourites remains separately deferred for the same reason: planning
a brief and filters does not by itself favour neglected tracks at selection.

### Common Ground and preview harness

Common Ground is available on the schedule shelf, in programming menus and as
a prepared takeover. The default is Random Host plus exactly one random guest;
slot options can instead select exactly one guest. Both DJs must be enabled in
Random Hosts, and a randomly selected host cannot displace a fixed guest.
Scheduled variants, regeneration, cast shuffling, saved regular shows and Look
Ahead reuse the existing Sub/Shows lifecycle.

Future scheduled plans are reconciled against the current slot's show ID, start
and end before preparation or listing. Resizing a shared boundary retires both
obsolete future shapes; the new slots receive their own plans. Removed future
slots are retired too, including from the playback registry and persisted store.
Past and already-started episodes retain their history, and takeover records are
not discarded by weekly schedule reconciliation. Reconciliation checks schedule
identity directly, so a temporary casting failure does not erase a valid plan.


The harness uses the same concept/settings calls as Sub/Shows, with Souls as
primary evidence, optional Musical Leanings, and both DJs' scheduled regular-show
filters as supporting repertoire context. Regular-show briefs are omitted.
Explicit persona preferences take precedence; an overlap need not already
appear in either DJ's shows. Both DJs have equal musical influence.

The preview concept call first records a supported musical interest for each DJ
and one shared musical thread. It then writes a distinctive title and a brief
of 2–3 sentences explaining each DJ's connection and one recurring musical
question. Prefer a small coherent palette (usually 2–5 styles), expanding only
for coverage. Avoid unrelated genre groups, generic template titles and
invented shared preferences. The concept should remain era-neutral unless the
operator requests a period. The settings prompt contains no example date range;
however, any decades or dates promised in the accepted brief must be represented
in era filters, even if the concept introduced them without an operator request.
A proposal mixing older and contemporary music must retain both periods, rather
than restricting the entire show to the older decades.

Both participants must be enabled in **Sub/Shows → Random Hosts**, including
explicitly named pairs. The Random Guests list is not used for this experiment.
A null eligibility list means everyone; an empty list permits nobody. Unknown,
ambiguous, excluded or identical participants are rejected before model calls.

From `controller/`, point `STATE_DIR` at the station's state root:

```sh
STATE_DIR=/path/to/station/state npm run common-ground:preview -- --list
STATE_DIR=/path/to/station/state npm run common-ground:preview -- --count 3
STATE_DIR=/path/to/station/state npm run common-ground:preview -- --host "DJ name" --guest "Other DJ name" --count 2
```

With no fixed pair, `--count` selects distinct random pairs without replacement.
Fixing one participant compares different eligible partners. Fixing both repeats
that pair, to inspect variation. Counts default to three and can be 1–20;
`--minutes` defaults to 60 and can be 1–360.

The default model is `/models/Meta-Llama-3.1-8B-Instruct-Q5_K_M.gguf` at
`http://qwen-llama-cpp:8080/v1`; overrides are `SHOW_PLAN_PREVIEW_MODEL` and
`LLM_BASE_URL`. Run somewhere those station service addresses are reachable.

Before importing runtime modules, the harness creates temporary settings and
credential copies plus a consistent SQLite library backup. All local writes and
telemetry stay in that temporary state, which is removed on exit. Navidrome
lookups may read the configured music service. No plans, schedules, notebooks
or station settings are saved. A full library backup needs temporary space
approximately equal to the indexed library database.

JSON goes to stdout; progress goes to stderr. Output includes the cast,
supporting repertoire, generated brief/settings, matching pool diagnostics and
whether coverage reaches twice the airtime at a four-minute average. The harness
uses the same strict genre and coverage policy as the scheduled template. Inadequate pools and individual generation failures remain visible for
review; the harness does not silently replace a pairing or accept it for air.

### Outside the Comfort Zone preview — 25 October 2026

The initial trial was a solo, harness-only prototype; it is now a saved template and UI option following operator acceptance.
Its concept first identifies the DJ's familiar territory, one neighbouring
destination, the musical bridge and why it is a departure. Soul and optional
Musical Leanings supply taste; scheduled regular-show filters supply evidence
of established repertoire. Where no regular shows exist, familiarity is inferred
and must be described as such.

The destination supplies the show's music throughout. It should not become a
familiar set with occasional adjacent tracks, an arbitrary challenge, or several
unrelated excursions. Underrepresentation is not required. The brief must invite
curiosity without inventing dislike, expertise or past listening habits, and
includes the shared labelled optional talking point.

For this experiment, exact regular-show genre names are removed from the genre
choices. This prevents obvious repertoire repetition; it does not prove that a
DJ has never heard a style, nor resolve all genre-family overlaps. The refined
prototype uses its single declared destination as the entire genre palette;
choose another destination if coverage is insufficient. The preview
uses strict filters and reports whether the pool covers twice airtime at a
four-minute average; it does not automatically accept or schedule a plan.

The existing isolated comparison harness supports:

```sh
STATE_DIR=/path/to/station/state npm run comfort-zone:preview -- --count 4
STATE_DIR=/path/to/station/state npm run comfort-zone:preview -- --host "DJ name" --count 1
```

Only personas enabled in Random Hosts are eligible. Default selection compares
four distinct random hosts; selecting one host repeats that host for `--count`
runs. Guests are rejected. Settings, credentials, library and logs use the same
temporary isolation as the Common Ground harness, with the same local model and
endpoint overrides. JSON includes briefs, settings, regular-show repertoire and
coverage diagnostics. Station assessment is needed before adopting this policy.

Coverage diagnostics stop waiting after 30 seconds and preserve the generated
plan with an unknown coverage result. Model calls share the running station's
LLM; run previews sequentially and allow for normal station contention.

The four one-hour previews on 25 October all exceeded the 30-track minimum:

| Host | Generated palette | Matching pool |
| --- | --- | ---: |
| Rock/metal host | Electronic, Synth-Pop | 10,314 |
| Electronic host | Post-Rock, Electro, Experimental | 1,463 |
| Alternative-pop host | Post-Punk, Industrial | 1,562 |
| Eclectic host | Industrial, Post-Punk, Experimental | 2,201 |

These establish technical feasibility, not concept quality. The rock/metal host's broad
Electronic umbrella weakens the focused destination. The electronic host's brief incorrectly
calls post-rock electronic music. The alternative-pop host and the eclectic host converge on similar territory,
and their briefs do not clearly establish the individual musical bridge; the eclectic host's
also claims noise and experimentation in his regular shows without sufficient
evidence. Every brief includes a talking point, and the revised previews leave
unrequested mood, era and energy restrictions empty. Refine destination focus,
musical accuracy and persona-specific bridges before promoting this to a saved
template. A large matching pool alone is not an acceptance criterion.

#### Refinement: one destination and strict selection

The next prompt requires a concrete audible bridge supported by the persona,
and checks the brief against that bridge rather than accepting generic curiosity.
The concept returns one destination; the controller copies it into the required
genre list. There is no independent list for the model to pad with umbrella tags.
The broad Rock, Pop, Electronic and Experimental tags are unavailable as
destinations in this trial. The second call receives the departure evidence to
explain the rationale.

This matters because genres are OR alternatives, even with strict filters.
A trial proposing Progressive House plus Electronic admitted 9,371 tracks:
strictness alone cannot restore focus to an overly broad palette. A single
destination still permits tracks with other tags, provided at least one tag
matches the destination using the shared genre matching rules. It does not
guarantee unfamiliar artists or exclude every recording played in regular shows.

The harness reports `strictFilterComparison`: effective library pools with the
same musical plan's strict setting on and off, the count excluded by strictness,
and the matching share of the soft pool. These are diagnostic eligibility counts,
not airplay probabilities or a simulated playlist. They account for configured
blocking, exclusions and duration bounds, but not transient recency, artist
separation or journey state. Runtime's existing never-starve safeguards remain;
the preview does not change the picker or scheduled episodes.

Final four-host comparison with the single-destination contract:

| Host | Strict destination | Eligible tracks | Also eligible under regular-show genres |
| --- | --- | ---: | ---: |
| Rock/metal host | Synth-Pop | 1,722 | 14 |
| Electronic host | Synth-Pop | 1,722 | 668 |
| Alternative-pop host | Psychedelic Rock | 650 | 127 |
| Eclectic host | Psychedelic Rock | 650 | 113 |

Each soft-filter comparison allowed approximately 68,224 tracks. All strict
pools exceeded the one-hour minimum of 30. A separate read-only inspection using
the shared runtime pool helper confirmed the counts and sampled one track per
artist: the rock/metal host's examples included Erasure, Metronomy, Soft Cell and New Order.
The alternative-pop host's examples included Khruangbin, Tame Impala and White Denim. These are eligible
examples, not predicted playlists. Regular-show overlap is genre eligibility,
not evidence of past airplay. This supports strict filtering for a focused
departure while retaining incidental overlap, rather than banning familiar
artists. The electronic host's greater overlap shows why a new genre name is not sufficient
evidence of a large departure.

The briefs now make stronger connections, particularly the rock/metal host's rhythm-section
and melody bridge, but remain uneven: titles are often generic, the alternative-pop host's bridge
is loose, and the eclectic host's list of familiar styles can read as additional promises.
Two hosts choosing each destination is valid, but this small run does not prove
variety across repeated generations. Those findings were accepted for an on-air trial; the template is now integrated below.

### Outside the Comfort Zone implementation

Available from the schedule shelf, Write an Order, Dashboard Takeover and
Sub/Shows episode plans, with an amber colour. Defaults to Random Host from the
eligible Random Hosts pool, or an explicitly selected fixed host. It is solo:
there are no guest controls, saved configuration requires no guests, and casting
never adds guests. Episode naming, skills eligibility, generation triggers,
regenerate/shuffle/save, airtime grouping and Look Ahead use the existing shared
Sub/Show paths.

The brief describes familiar genres explicitly as the host's starting tastes,
then moves into one neighbouring destination. It must not promise a blend with
those familiar genres. Strict filters are mandatory, using only the declared
destination. Required coverage is the greater of the operator minimum and twice
airtime at a four-minute average, checked after filters and exclusions. If short,
retry once for a different single connected destination with the same host;
never expand with umbrella genres. A second insufficient result fails safely
through the existing preparation error path.

### DJ’s Choice familiar-core policy

New DJ’s Choice plans use the host’s regular show genre filters as their familiar
centre, interpreted through the Soul and optional Musical Leanings. Where no
regular shows exist, infer that centre from the persona. Add a few connected
genres absent from the regular shows; guest tastes may suggest connections
without displacing the host. The brief’s talking point must leave room for
familiar favourites rather than impose a restrictive theme.

Use strict genres, with up to 15 styles and the same checked coverage minimum
as Deep Discovery: 30 unique eligible tracks per scheduled hour, or the operator
minimum if higher. Leave moods, eras and energies empty by default, permitting
soft daypart/weather influence within the genre boundary. Use a restriction
only when explicitly requested or musically necessary; at most two moods.
Explain the familiar core and the musical connection to adjacent styles in
the rationale. The palette does not enforce how often adjacent styles play;
that would require picker weighting. Accepted plans remain unchanged until
regenerated, and failed regeneration retains the previously accepted plan.

### Brief and era alignment

Keep generated titles and briefs era-neutral by default. Favourite decades in
a persona or regular show do not justify promises such as “the 80s and beyond”.
Only promise a date range when the operator explicitly requests that musical
restriction, and translate any promised period into matching era windows in
the settings call. Existing accepted plans are unchanged until regenerated.
This is prompt guidance, not a semantic validator for arbitrary prose.

The settings prompt supplies required genre names as strings, with indexed
counts separately. Narrow format recovery unwraps copied `{name, tracks}`
genre entries before schema validation; it does not add or substitute genres,
and the exact accepted palette is still checked.

### Episode casting actions

Regenerate has the tooltip “Regenerate show, keeping host and guests”. A
separate Shuffle icon is available for upcoming slots with random host or
guest options, with the tooltip “Shuffle random host/guests and regenerate
show”. It previews a different cast before confirmation. Fixed options stay
fixed, and only eligible personas participate. If the available choices cannot
produce a different cast, explain this without regenerating the episode.

The preview draws a new occurrence seed without changing station state. On
confirmation, validate that the proposed cast is still current and generate
the replacement with that seed. Persist it with the accepted episode only
after success, so later regeneration and restarts retain the shuffled cast.
A schedule change, airtime boundary or generation failure cannot replace the
accepted episode. Legacy episodes without a seed retain their original
deterministic casting. These controls do not rebuild or restart the station.

Save draft and save use admin-only endpoints under `/shows/generated`. Save
validates the edited draft through the shared regular-show schema and checks
that the accepted plan has not changed since opening it. Reconcile the Shows
settings and takeover caches after writing, and refresh episode history so
the save action reflects its saved identity.

New accepted records retain non-sensitive playlist, vocal and track-length
settings independently of the persona-bearing configuration fingerprint, which
is removed from past history. Legacy past records without this snapshot use
the surviving recurring show for those additional settings; their accepted
brief, cast and generated music filters remain available exactly as recorded.

### Takeover programming menu

The Dashboard menu places Default Programming first, then Regular Shows sorted
A–Z, followed by Sub/Shows with DJ’s Choice first and remaining entries A–Z.
Section labels are non-selectable. Sort the displayed copy only: roster order
still determines existing show colours. The admin-only `/shows/takeover` read
provides minimal generation identity for grouping; public schedule reads do
not gain private generation configuration. The shared takeover cache reconciler
retains that identity after show writes.

The Schedule page’s “Write an order” selector shares the Takeover menu’s
grouping and alphabetical order. Default Programming writes empty schedule
cells (the existing autonomous programming behaviour). Existing Sub/Show
variants remain individually selectable so their casting options are preserved.

“Airtime against your target” aggregates all generated variants by template: one
DJ’s Choice row and one Deep Discovery row regardless of host/guest combinations.
Use the template name and colour, sum their scheduled hours, then calculate the
bar scale and target status from the combined totals. Saved regular shows stay
individual, including those copied from generated episodes.

### Prepared Sub/Show takeovers

The Dashboard programming menu exposes regular shows plus one choice per
Sub/Show template, not scheduled variants. Selecting DJ’s Choice or Deep
Discovery prepares a new episode using Random Host and Random Guests (0–3)
from station eligibility pools. Normal Sub/Show skill eligibility still applies.
No extra cast controls are shown in Takeover.

During preparation, disable Take Over and label it “Generating…”. Keep current
programming on air. On success, display the accepted title, host and guests,
then enable Take Over. Changing the template or duration discards the visible
preview and prepares another; stale responses cannot enable the button.
Failures and expired previews offer Retry. Invalid durations and unreadable
schedule windows cannot start preparation or activation.

Preparation uses `/schedule/takeover/prepare`, with the ordinary takeover
duration validation and shared Sub/Show planner/coverage checks. Preview tokens
are bounded to 32 drafts, expire after 15 minutes (or the schedule boundary,
if earlier), and are intentionally lost on controller restart. Preparing never
changes the roster, weekly grid or live override. A fixed duration starts in
full when the operator activates; an until-schedule-change preview is invalid
if its target boundary changes.

Take Over calls `/schedule/takeover/activate` with the ready token. Recheck the
cast/configuration, eligibility settings, duration window and matching music
coverage. Publish the accepted episode before exposing the override, then use
the ordinary session handoff path. Do not call the model again. Repeated
activation of one token is idempotent. A failed override write removes the
unactivated episode and leaves current programming in place.

Each template uses a reusable internal takeover show definition, so repeated
takeovers do not accumulate saved variants. The weekly grid is unchanged.
Persist the original casting occurrence identity with the ready episode when
rebasing its start to the activation time; this preserves its cast and
configuration across restarts. These episodes remain available in Sub/Shows
history and can be saved as regular shows. Direct unprepared generated-show
requests to `/schedule/override` are rejected; regular/default takeovers retain
their existing flow.

Music settings recovery also accepts exact closed year-range strings such as
`"1980-1995"` by converting them to `{fromYear: 1980, toYear: 1995}` before
validation. It does not guess decades, open ranges or missing years, swap
reversed bounds, or drop a restriction. Normal year bounds and coverage checks
still apply. The prompt explicitly demonstrates the required object format.

Look Ahead’s implementation and tool contract are documented in
`docs/custom-skills.md` under “Look Ahead schedule data”; the editable example
lives in `docs/examples/skills/look-ahead`. It uses the actual segment speaker’s
identity to distinguish hosting, guesting and other presenters’ shows.
