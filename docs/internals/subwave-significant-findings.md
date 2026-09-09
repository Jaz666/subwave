# SUB/WAVE — Significant Findings and Working Knowledge

## Purpose

This document consolidates the useful findings gathered across the creative-development chats about how SUB/WAVE behaves, how its parts relate to one another, and what has been learned while developing and evaluating it.

It is written as reusable background for future user-facing documentation. It deliberately minimises details about any one station, presenter roster or personal music library.

Some points describe observed behaviour in a development fork rather than guaranteed behaviour in every SUB/WAVE installation. Those distinctions are marked where important.

## 1. What SUB/WAVE is

SUB/WAVE is a self-hosted, AI-assisted internet radio system built around a user's own music library. It produces one shared live broadcast: listeners join the station's current stream rather than controlling an individual playlist.

The system is intended to provide more than random playback. It can combine:

- library-aware music selection;
- presenter personas and distinct speaking styles;
- scheduled shows with different musical and editorial identities;
- links between tracks;
- station IDs and other imaging;
- handovers between presenters;
- listener requests;
- weather, news-style and research segments;
- show topics, guests and recurring features.

The central creative aim is a station with taste, memory, continuity and restraint. More speech or more elaborate reasoning is not automatically better. A convincing station should sometimes let the music carry the programme.

## 2. The basic conceptual split

The most useful model is to separate three layers:

### Station and controller layer

This is responsible for operational truth and broadcast mechanics. Depending on the version and configuration, it handles scheduling, stream state, requests, weather, recent-play history, rotation rules, available library data, and other authoritative facts.

### Shared station tools

These are bounded functions that help the system operate the station: searching the library, finding similar tracks, checking candidates, retrieving supporting evidence, and selecting or running scheduled activities.

### Persona or creative layer

This is the selected creative language model together with a presenter's Soul/persona, show brief and current context. It should make editorial judgements from grounded material and turn those judgements into human-facing speech.

The presenter is therefore best understood as using software tools in the Booth, rather than as an isolated AI entity that personally performs every backstage operation.

This distinction matters both technically and in user-facing explanations. Calling the operational layer a separate “Producer” can imply that creative control has been taken away from the DJ. A more useful framing is that the DJ has an assisted workspace containing tools that make the station easier to run.

## 3. The Booth and the DJ-facing metaphor

“The Booth” is a useful name for the shared software workspace. It describes where the presenter works without implying a second on-air personality.

The Booth can contain:

- the functions that assist the presenter;
- the current reasoning or operational state;
- grounded track candidates and research material;
- the final on-air speech;
- debugging information showing which part of the system acted.

This metaphor supports a clean explanation:

> The DJ has a creative brain and a Booth full of tools to help run the station.

The exact internal terms Producer, Persona and controller may still be useful in technical documentation, but user-facing material should focus on the DJ using the Booth.

## 4. Music selection: discovery versus editorial choice

The most important development finding is that music selection contains two different jobs.

### Operational discovery

The system must quickly answer bounded questions such as:

- Which part of the library should be searched?
- Should the search use a playlist, genre, mood, era, energy, similarity, recent additions, favourites or another route?
- Which real tracks satisfy the immediate constraints?
- Which candidate IDs were actually returned by the library?

These tasks are predictable, grounded and suitable for a small specialised model or deterministic controller logic.

### Editorial selection

The final choice requires a broader judgement:

- Does the track fit the current flow?
- Is it too safe or too obvious?
- Has the artist appeared too recently?
- Would variety improve the sequence?
- Does it suit the show's identity rather than merely its tags?
- Is an unexpected candidate interesting in this particular moment?

This is where a larger creative model or persona should retain responsibility.

The practical conclusion from testing a small CPU model was:

> A small model can reliably choose a valid track, but validity is not the same as editorial quality.

The small selector tended to produce grounded and playable choices, but could stay with the same artist, select the first plausible result, or miss the difference between a safe continuation and a choice that gives the programme character.

The preferred split is therefore:

1. The small operational model decides where to look and performs bounded discovery.
2. The controller validates that the candidates are real library items.
3. The creative model makes the final editorial choice from those candidates.

This is not primarily about replacing the larger model. It is about giving it better, grounded material to judge.

## 5. Snap Pick

The CPU-assisted next-track process has been framed as a “Snap Pick” — a fast, bounded next-track-assisted pick.

The name is useful because it describes assistance rather than authority. It can mean that the Booth has quickly found plausible material for the DJ to consider.

When the presenter's musical preferences genuinely displace the Snap Pick, the user-facing explanation can be framed as the DJ taking the final call. “The DJ overrides the Snap Picker” is appropriate when there is a real conflict; softer cases may be better described as the DJ's leaning tipping the choice.

## 6. Persona Final Call and policy conflicts

The development fork includes a safety path for cases where a fast selector proposes a technically valid but policy-conflicting choice.

For example, if the selector proposes the same artist again immediately and suitable alternatives exist, the decision can be passed to the Persona with:

- the proposed choice;
- a clear explanation of the conflict;
- the available alternatives;
- enough current context for an editorial decision.

This is a useful pattern: operational tools can identify a conflict, while the presenter retains the judgement about which alternative best serves the programme.

## 7. The small function model

The development direction is to train one common, small CPU model to handle shared operational functions across installations, while allowing each user to choose their own creative voice or creative LLM.

The model being tested was FunctionGemma. The name is implementation-specific and may eventually be replaced with a user-facing name for the shared tool suite.

Observed or intended responsibilities include:

- routing a bounded library search;
- performing the library discovery call;
- returning a grounded shortlist;
- choosing which scheduled research task is worth pursuing;
- fetching supporting evidence for a research feature.

It should not be responsible for:

- choosing the final on-air track;
- deciding whether researched material is editorially worth saying;
- writing presenter speech;
- handling authoritative weather changes;
- replacing operator-created or custom skills that remain on the controller's normal path.

The broader architectural goal is a common, reliable operational base with a user-selected creative layer on top. This reduces the number of hardware- and model-specific failure paths the main creative model must handle.

## 8. Why the operational split matters to users

Different users run different cloud models, local models, GPUs and CPUs. If every creative model must also perform every tool call, the system has to accommodate a large number of combinations and failure modes.

A shared CPU-based operational layer can provide:

- more consistent function behaviour;
- less tool-call confusion in local models;
- lower token consumption for cloud models;
- less VRAM pressure for local installations;
- more predictable validation of library results;
- a common base that can be improved for everyone.

The creative model remains configurable, but the routine station mechanics become less dependent on its particular strengths and weaknesses.

## 9. Prompt construction and factual grounding

The typical creative call may contain a large amount of material:

- a system prompt;
- station-wide rules;
- the immediate task;
- verified facts and current context;
- sleeve notes or other supplied editorial material;
- the track currently playing;
- optional guest or show context;
- recent speech for repetition avoidance;
- recent opening words for opener variation.

The key grounding rule is that supplied facts are the only factual source for the current music link. The model must not supplement them with remembered or learned information about an artist, track, album, release, chart history, reputation, influence, relationships, lyrics, instrumentation or production.

Subjective reactions are allowed when clearly presented as reactions rather than facts.

The prompt should also prevent the presenter from inventing:

- weather;
- exact time from an approximate time;
- dates or days not supplied;
- programme state;
- listener activity;
- guests or studio events;
- personal memories not established in the persona or context.

Sleeve Notes are optional material, not a checklist. A good link may use one detail, several details or none at all.

## 10. Why long prompts can weaken rule adherence

The observed problem is better described as instruction dilution and pattern competition than as the model literally forgetting the system prompt.

When a prompt contains many examples, facts and recent lines, a smaller model may imitate a nearby pattern that conflicts with a higher-priority rule. The most important rules can be weakened by:

- long context;
- contradictory examples;
- bad formatting repeated in recent speech;
- production instructions mixed with creative material;
- many requirements competing for attention;
- a model that is weak at instruction hierarchy.

A useful test is to compare:

1. recent speech examples containing problematic formatting;
2. the same examples stripped of that formatting;
3. a final hard-rule reminder placed immediately before generation.

If the final reminder improves compliance, it can become a targeted feature for troublesome models. Deterministic post-processing remains sensible for rules that must never reach air, such as trailing performance tags or internal markers.

## 11. Fish Audio performance cues

Performance cues are a narrow exception to the “spoken words only” rule. They should:

- describe delivery, not content or production;
- appear in square brackets immediately before the words they affect;
- be used at most once per response unless a specific task says otherwise;
- never appear at the end of a response;
- never be used as speaker labels, stage directions, section headings or end markers.

The recurring failure was an emotive or delivery tag appearing at the end of a segment despite explicit instructions forbidding it. This is a good example of a rule that benefits from both prompt reinforcement and deterministic output checking.

## 12. Recent speech as anti-repetition context

Recent speech is useful for avoiding repeated wording, topics, anecdotes, metaphors and sentence structures. However, it is also a source of imitation.

If recent examples contain:

- trailing cues;
- internal language;
- generic station phrasing;
- invented facts;
- undesirable sentence structures;

the model may reproduce them even when the system prompt bans them.

Recent speech should therefore be treated as carefully selected negative-and-positive context, not as an unquestioned style reference. It may be useful to sanitise it before insertion into the prompt.

## 13. Skills and custom functions

Skills are a separate and changing layer. They can provide scheduled or optional features such as research, mailbags, anniversaries, sponsor material, weather or topical segments.

Their output should not dominate evaluations of the core Persona because skills may be changed independently of the creative model. A speech-log benchmark should record the skill configuration, but judge ordinary links, presenter identity, show fit and broadcast behaviour more heavily.

Skills can fail in two different ways:

- operationally, by targeting the wrong artist, track or context;
- creatively, by producing awkward, overlong or generic speech.

Both should be recorded, but a charming or useful creative accident may still be worth preserving as station folklore if it does not become a repeated factual problem.

## 14. Temporary show memory

Permanent Persona/Soul and temporary show memory should be separate concepts.

Soul contains durable identity:

- personality;
- tastes;
- perspective;
- speaking habits;
- stable relationships to music and other presenters.

Temporary show memory contains facts or running material established during one programme and reset afterwards. Examples include:

- an absent presenter;
- a temporary guest;
- a phone-in question;
- a listener contribution;
- a running joke;
- a current event within the programme;
- an open conversational thread.

The memory should be explicitly established, updated and scoped to the show. It should not become a permanent change to the Persona, and it should not force the presenter to mention the material in every link.

This provides a safe way to support continuity without encouraging the model to invent a long-term station history.

## 15. Shows, tags and briefs

A useful show model has several separate layers:

- music tags define the candidate pool or musical steer;
- the show brief defines the programme's editorial purpose;
- the lead presenter's Musical Leanings provide a softer personal preference;
- Soul defines delivery and personality;
- guests provide contrast or a complementary perspective;
- a produced-programme topic provides a conversational spine.

In the current interface, selected mood and genre tags are generally OR-style: a track matching any selected item may qualify. Soft filtering allows the DJ to break the rules for flow; strict filtering makes the selected constraints hard rules. This difference should be explained clearly to users.

The expanded tag allowance creates room to widen a show's musical horizon, but adding tags should not erase its identity. The best additions are adjacent musical colours that reveal something already present in the brief or lead Persona.

## 16. Artist names in prose briefs

Artist lists in a prose show brief are usually redundant and can be counterproductive.

The picker already has structured information such as genres, moods, energy, eras, playlists, strictness and similarity. Grounded candidate tools also restrict the final selection to tracks that actually exist in the library.

Naming artists in the brief:

- does not make those artists available if they are not in the candidate list;
- can make the router or selector repeatedly favour a small familiar group;
- may increase concentration and repetition;
- blurs the difference between examples and requirements;
- becomes stale as a user's library changes.

Artist names are still appropriate for genuinely editorial purposes: a tribute, an artist special, a guest connection or an explicit curated policy. If a name is an actual constraint, a structured playlist or allowlist is safer than prose.

## 17. Moods versus objective similarity

Some users may want to disable mood influence because mood labels feel subjective. The important distinction is between:

- no moods selected, which may mean automatic station-mood behaviour;
- moods selected as a soft or strict steer;
- mood analysis being completely ignored by the picker.

A clear future interface could expose three states:

| Mode | Meaning |
|---|---|
| Selected moods | Prefer or require the selected mood lanes |
| Automatic | Follow the station's current mood behaviour |
| Mood-neutral | Do not use mood as a selection signal |

Genres are not completely objective either, especially in a user library with inconsistent tags. BPM, audio similarity and analysed sound characteristics are generally more measurable. A mood-neutral mode is therefore a legitimate user preference, but it should be presented as a change in weighting rather than deletion of useful metadata.

## 18. Library metadata findings

Large personal libraries tend to contain both broad concentrations and a very long tail.

Useful observations from the library analysis were:

- multi-label genre totals can exceed the number of tracks;
- metadata coverage can be nearly complete without the taxonomy being clean;
- capitalisation and naming variants can split apparently identical genres;
- many microgenres have too few tracks to support a strict standalone show;
- broad genre intersections are often more useful than rare labels;
- similarity, playlist and genre routes can repeatedly surface artists with unusually deep catalogues;
- variety safeguards matter even when every individual selection is technically valid.

The practical design lesson is to use broad, complementary combinations for regular shows and reserve strict filters for genuinely curated pools with a verified eligible count.

## 19. Presenter identity and station illusion

The desired result is not perfect commercial polish. It is a believable small station: coherent enough to feel real, but with a little community-radio looseness.

The listener should occasionally wonder whether the station is real. That illusion comes from:

- distinct presenters rather than one universal station voice;
- specific but grounded observations;
- continuity across a show;
- restrained speech;
- occasional harmless oddities;
- believable handovers and relationships;
- not filling every silence;
- avoiding corporate or streaming-service language.

An oddity should be classified rather than automatically rejected:

- charming station folklore;
- a one-off imperfection;
- a repeated house-style weakness;
- a factual or broadcast-safety failure;
- a break in the illusion.

For a personal station shared with family and friends, oddities are usually opportunities for refinement rather than commercial-listener catastrophes. The standard should still protect factual trust and on-air integrity.

## 20. Speech-log benchmark

The benchmark should record both scores and notes. A single overall score hides whether a model is creative but unsafe, accurate but generic, or technically compliant but lifeless.

Recommended dimensions, scored 0–4:

| Code | Dimension | What it measures |
|---|---|---|
| F1 | Factual provenance | Whether factual claims are supported by supplied context |
| F2 | Unsupported knowledge | Use of remembered, learned or invented music facts |
| C1 | Context grounding | Use of current show, track and supplied context without forcing it |
| P1 | Persona authenticity | Whether the presenter sounds like the established person |
| P2 | Differentiation | Whether different presenters genuinely sound different |
| M1 | Musical specificity | Whether observations are specific without pretending to analyse unsupplied audio |
| R1 | Restraint | Appropriate length, silence and lack of filler |
| B1 | Broadcast behaviour | Natural, usable on-air speech and appropriate continuity |
| R2 | Repetition control | Avoidance of repeated wording, topics and structures |
| O1 | Output integrity | No labels, markers, internal text or malformed cues |
| S1 | Supplied-note use | Natural use of Sleeve Notes or verified material when helpful |
| E1 | Subjective musical life | Genuine in-character reaction without unsupported factual claims |
| W1 | Station-world continuity | Believable relationships, handovers and temporary continuity |

For ongoing records, each log should also record:

- date;
- creative model;
- whether Verified Facts/Sleeve Notes were active;
- skill configuration/version;
- relevant show and Persona;
- sample size;
- category scores;
- notable strengths;
- repeated weaknesses;
- charming oddities;
- hard failures;
- prompt changes made before the next comparison.

Comparisons are only meaningful when model, prompt, Sleeve Notes and skills are recorded. A change in any of these can explain a shift in output.

## 21. What the early model tests showed

The early baseline model demonstrated substantial musical knowledge and an ability to produce plausible radio language, but the output often behaved like an actor performing the role of a DJ.

The recurring weaknesses were:

- unsupported music facts;
- generic vocabulary about mood, energy and journey;
- invented programme or listener context;
- production or internal markers leaking into speech;
- repetitive structures;
- a shared “house style” overriding individual presenter identity.

Adding Sleeve Notes improved grounding in some cases, but did not automatically remove learned facts or generic habits. Model comparisons were confounded when skills and context construction changed at the same time.

Several replacement models were tested. Some showed promise but introduced their own oddities or failed to improve adherence. A later Llama 3.1 8B Instruct trial was judged especially promising in live listening: ordinary links felt more like a real presenter, with only a few issues thought likely to respond to tighter prompting. The important finding is not that one model is universally best, but that smaller local models differ significantly in instruction adherence, restraint and presenter authenticity.

## 22. The “house style” finding

One of the most important creative findings was that a model may carry a generic radio-writing pattern beneath the individual Personas.

This pattern tends to notice:

- mood;
- energy;
- atmosphere;
- journey;
- transition;
- time of day;
- broad emotional effect.

Changing the Soul may alter the decoration without changing the underlying writer. Better prompts should therefore ask not only “what should this presenter say?” but also:

- What does this presenter specifically notice?
- What would they ignore?
- What sort of detail would another presenter miss?
- What would make this link impossible to mistake for another presenter's link?

Persona design should define attention and judgement, not merely adjectives such as warm, curious or witty.

## 23. Produced programmes and topic continuity

Produced Programme functionality works best when the show has a temporary conversational premise that can persist across the hour.

A strong brief should establish:

- who leads;
- what the topic or editorial question is;
- what each guest contributes;
- how the topic affects conversation;
- when the topic may be mentioned;
- how continuity persists without being repeated mechanically;
- how the topic expires at the end of the programme.

Several shows can share a broad music pool while remaining distinct if their produced topics create different ways of noticing and discussing music.

The main risk is a roster of programmes whose briefs all reduce to “knowledgeable friends discuss music warmly.” Topics should change conversational behaviour, not simply appear as labels.

## 24. Research and evidence

When research skills are used, the operational layer should fetch and pass supporting evidence to the Persona. The presenter should receive grounded material rather than having to decide what to research and simultaneously write the link.

The creative model should still decide whether the item is worth saying, how much of it belongs on air and whether it fits the presenter. Evidence retrieval and editorial worth are separate decisions.

## 25. Weather and authoritative facts

Weather is a useful example of a fact that should remain on the controller path. The controller can treat current weather as authoritative and supply it to the presenter, avoiding a model deciding whether to call for or invent weather changes.

The general principle is:

> Facts that affect the real-world state of the broadcast should come from an authoritative source; the Persona decides how, or whether, to say them.

## 26. Current design principles

The accumulated findings support these principles:

1. Keep operational discovery bounded, fast and grounded.
2. Keep final editorial choice with the creative Persona.
3. Explain the split as a DJ using tools in the Booth.
4. Treat supplied facts as the only factual music source for a link.
5. Make temporary continuity explicit and resettable.
6. Design Personas around attention, taste and judgement, not just tone words.
7. Use tags for musical steering and briefs for editorial purpose.
8. Avoid stale artist lists in general-purpose prose briefs.
9. Prefer restraint and specificity over constant talk.
10. Evaluate models with recorded context and separate scores.
11. Preserve charming accidents while preventing repeated factual or formatting failures.
12. Build shared operational infrastructure so creative model choice remains flexible.

## 27. Open development questions

- What should the final user-facing name be for the shared Booth tool suite?
- How should a mood-neutral selection mode be exposed without confusing it with automatic station mood?
- How should temporary show memory be represented, edited and reset?
- Which output checks should be deterministic rather than prompt-based?
- How can recent speech be sanitised without losing useful continuity?
- How should the system show when the DJ's judgement overrides an operational suggestion?
- Which Persona and show settings should be common across installations, and which should remain user-defined?
- How can the benchmark distinguish a model's genuine persona quality from a skill or prompt change?
- How can show briefs stay useful as a user's library, metadata and schedule evolve?

## Scope note

This archive is a working interpretation of findings from development conversations and live listening. It should be updated when implementation behaviour is confirmed, changed, or shown to differ between the main project and a private fork.
