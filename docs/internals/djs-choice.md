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
  show idea, then deliberately favors less-represented library genres in its
  music settings when they fit and have enough playable coverage.
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

For DJ’s Choice, “fresh” means a specific premise that naturally offers some
variety from the host’s other regularly scheduled shows. Existing shows help
identify familiar genres and angles; they are not forbidden subjects or genres.
The music palette can keep some recognizable favourites while reaching into
related genres. It does not guarantee a never-repeated combination or a disjoint
track list.

## Generated episode

Generation is led by the resolved host's editorial voice, not by a preset list
of filters. Resolve the host before planning. The prompt uses that DJ's Soul and,
when present, Musical Leanings as its primary creative input; guest identities
can influence the result secondarily. The LLM writes the show brief first, names
the show from that brief, then chooses music settings that express the brief.
Template direction, station restrictions and playable library coverage guide
that work without replacing the host's taste.

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
Other settings, including programme structure, voices, skills, playlist
restrictions and duration, stay under operator control unless explicitly added
to the feature’s scope later.

Here, “tags” means the generated music settings: `moods`, `genres`, `eras`,
`energies` and `filtersStrict`. They must fit the brief and eligible library.
These are distinct from the existing show `tags` field, which remains an
operator organization feature and is not generated.

Example: DJ’s Choice → Mara → “After the Last Train”: nocturnal soul, dub and
spacious electronic music, with a reflective brief and moderate energy.

Preparation inputs should include the selected host’s Soul and Musical
Leanings, the names, briefs and music settings of their other regularly
scheduled shows, guest identities, slot duration and station-local time, template
instructions, bounded library coverage, and summaries of recent episodes.
Existing shows are soft context: DJ’s Choice should vary its editorial angle,
but their topics and genres are not hard exclusions. Its palette can retain a
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
Existing Programme planning, when enabled, should consume the accepted episode
brief to construct its intro, features and outro.

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

Deep Discovery scans the entire indexed genre catalogue before building a bounded
list of up to 80 smaller genres with plausible repertoire for the slot. The cue
is the operator's minimum coverage when supplied, otherwise an editorial estimate
of one record per four minutes of slot time. This is shortlist guidance, not a
new hard playback restriction or a default for the optional minimum coverage
setting. If no genre reaches the estimate, offer the largest available small
genres so the LLM can combine them. Never truncate to the most common genres
before ranking rarity: doing that excluded the real long tail. The music-settings
pass also receives the host's Soul, Musical Leanings, final brief and duration.
The LLM builds a coherent palette around related styles; a one-track genre cannot
carry an entire show. Deep Discovery counts use the playback genre-matching
rules: Indie also counts Indie Rock, and a multi-tagged recording counts once
per matching genre. A broad tag with few exact-label assignments therefore
cannot masquerade as rare. Counts still overlap between genres and precede
the final show filters and exclusions, so are not an eligible-track guarantee.
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
or a schedule edit is discarded. Past episodes show a disabled Save button;
copying an episode into a permanent show remains deferred.

An optional “Coming Up” DJ skill reads the remaining schedule for the day and
its accepted episode titles, casts and briefs. It must not generate episodes or
invent unprepared titles. It can tease an unprepared slot using only known
host/template facts. Vary highlights, observe cooldowns, and refresh facts when
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
