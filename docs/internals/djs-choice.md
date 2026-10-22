# DJ’s Choice and Auto DJ shows

Discussed: 13–22 October 2026. Status: product proposal, not implemented by these documents.

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
- DJ’s Choice is the open-ended, “anything goes” option, guided by the host’s
  identity and taste within station restrictions and available music.
- Auto DJ templates supply a specific editorial direction using the same
  generation process. Deep Discovery and Forgotten Favourites were explicit
  examples; the additional templates below remain suggestions.
- A custom, editable LLM planning prompt generates the normal show settings.
- Preparation happens ahead of airtime, at a suitable point in the day, and
  generates a show name as well as its configuration.
- Fixed and randomly assigned hosts and guests are supported.
- Keep the last few generated and aired shows, with a way to copy an episode’s
  setup into a new permanent show.
- A DJ skill can look ahead at the day’s schedule and tease prepared shows.

“Fresh” means varied editorial choices, not a guarantee of a never-repeated
combination or a disjoint track list.

## Generated episode

The planner produces a title and these existing show controls:

| Operator-facing field | Current source field |
| --- | --- |
| Show Brief | `topic` |
| Music Mood | `moods` |
| Genre Leans | `genres` |
| Eras | `eras` |
| Energy | `energies` |
| Strict Filter on/off | `filtersStrict` |

The generated title becomes the episode’s display name; the recurring slot
retains its DJ’s Choice or Auto DJ template identity. Other settings, including
programme structure, voices, skills, playlist restrictions and duration, stay
under operator control unless explicitly added to the feature’s scope later.

Example: DJ’s Choice → Mara → “After the Last Train”: nocturnal soul, dub and
spacious electronic music, with a reflective brief and moderate energy.

Preparation inputs should include the selected host’s Soul and Musical
Leanings, guest identities, slot duration and station-local time, template
instructions, bounded library coverage, and summaries of recent episodes.
The host supplies the main musical direction; guest influence is a proposed
secondary input. Recent choices by both this host and other hosts can encourage
variety without forcing unsuitable music.

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
| DJ’s Choice | Host chooses freely within station constraints | Agreed |
| Auto DJ – Deep Discovery | Connect smaller genres with enough playable tracks | Agreed example |
| Auto DJ – Forgotten Favourites | Revisit formerly popular music absent from recent airplay | Agreed example; favourite signal needs definition |
| Auto DJ – Hidden Gems | Explore tracks with little or no airplay | Suggested |
| Auto DJ – Fresh Arrivals | Explore recent additions with familiar connections | Suggested |
| Auto DJ – Across the Decades | Follow a musical thread across eras | Suggested |
| Auto DJ – Unexpected Connections | Connect distant genres by mood, sound or influence | Suggested |
| Auto DJ – Host’s Obsession | Explore one corner of the host’s Musical Leanings | Suggested |
| Auto DJ – Night Journey | Interpret a late-night slot through the host’s taste | Suggested |

Templates should expose editable prompts; saving custom templates is a proposed
extension. Choose the initial shipped set during implementation planning.

### Deep Discovery and playable coverage

Subwave already exposes genre track counts. Give the DJ those counts and ask
it to choose a coherent mixture near the lower end whose combined pool exceeds
an operator-set minimum X. Smaller library genres and neglected airplay are
different signals: the first uses catalogue counts, the second needs history.

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

A configurable daily preparation time, morning by default, was suggested.
Use station-local dates and time, including daylight-saving changes. Prepare
before incoming track selection begins, not merely before the displayed start.
Slots added after the daily run should be prepared promptly. Scheduling across
midnight must not leave early shows unprepared; the exact look-ahead horizon
is an implementation decision.

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
