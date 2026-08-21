Given the Producer/Persona split, I'd make the handoff a small packet of verified editorial facts and optional creative hooks, rather than giving Persona Producer reasoning.
A useful menu of context would be:
| Context | Example | What Persona can do with it |
|---|---|---|
| **Verified track metadata** | Album, release year, label | Music knowledge without hallucinating |
| **Verified artist facts** | Formation/location, members, relevant history | Add colour safely |
| **Track relationship** | Cover/original/remix/live version | Explain why this particular recording matters |
| **Library relationship** | First station play, rarely played, frequently played | Genuine Four Acres FM context |
| **Selection reason** | `deepCut`, `tracksLikeThis`, pinned playlist | Turn the choice into an editorial thought |
| **Selection intent** | “Wanted something less obvious from this artist” | Natural DJ explanation without exposing tools |
| **Previous-track relationship** | “Similar guitar texture”, “deliberate contrast” | Proper segue commentary |
| **Sonic observations** | Female vocal, distorted guitars, sparse piano | Talk about what listeners can actually hear |
| **Mood/feel** | Reflective, euphoric, abrasive, playful | Subjective commentary |
| **Energy movement** | Medium → high | “We're picking things up…” |
| **Show journey** | “Beginning a darker run of tracks” | Gives links a sense of programme direction |
| **Show progress** | First hour / final half hour | Safe programme-position references |
| **Verified approximate time** | “approaching 11am” | Time checks without Stheno calculating |
| **Verified date/day** | Friday, 21 August | Weekend/day references |
| **Verified season** | Summer | Stops Autumn-in-August incidents |
| **Verified weather** | Light rain, 14°C | Genuine local colour |
| **Verified location context** | Ribble Valley / Whalley | Local texture |
| **Next programme** | Carrie at noon | Accurate forward promotion |
| **Previous presenter/show** | Lucy just handed over | Continuity |
| **Guest/co-host state** | Jay and Carrie are currently with Lucy | Prevent imaginary studio occupants |
| **Recent station history** | “Maria played another track by them yesterday” | Creates believable station memory |
| **Listener context** | Listener requested it / mailbag mentions artist | Connect music to audience |
| **Editorial theme** | overlooked album tracks | Lets Persona articulate the show's musical identity |
| **Playlist provenance** | BBC 6 Music-derived collection, personal favourites | Useful where genuinely relevant |
| **Novelty flag** | New to station / presenter hasn't encountered it before | Genuine discovery language |
| **Familiarity flag** | Presenter favourite / known to Persona | Controls whether they sound knowledgeable or curious |
| **Upcoming transition** | Next track deliberately changes mood | Can tee up the journey without naming it |
| **Intro runway** | vocals at ~14s | Controls length and landing |
| **Outro characteristics** | cold ending / fade / long instrumental outro | Useful for backsells/handoffs |
| **Pronunciation hints** | artist/title phonetics | Potentially valuable for Fish |
| **Fact confidence/source** | verified / derived / subjective | Determines what Persona is allowed to assert |

The particularly interesting addition for me is selection intent.
FunctionGemma/Qwen may know why a record was chosen without Persona needing their private reasoning. So instead of passing:
tool=deepCuts; candidate_rank=4; Qwen reason="..."

you could translate that into a tiny safe editorial fact:
Editorial context: Looking for a less obvious track from a familiar artist.

Persona can then naturally produce:
“We've heard plenty of the obvious R.E.M. choices over the years, so let's wander a little further into the catalogue…”

That's much richer than simply handing it album trivia, while maintaining the Producer/Persona boundary.
I'd distinguish facts from creative hints
Something structurally like this would be ideal:
VERIFIED CONTEXT
- Approximate time: approaching 11am
- Day: Friday
- Season: summer
- Track album: Automatic for the People
- Album year: 1992
- Next show: Lunchtime Rocks with Carrie at noon

EDITORIAL CONTEXT
- Selection intent: explore beyond the artist's obvious singles
- Relationship to previous track: deliberate increase in energy
- Show journey: moving into a more guitar-driven section

AUDIO CONTEXT
- Vocals begin: approximately 13 seconds
- Character: jangly guitars, male vocal
- Energy: medium

PERSONA CONTEXT
- Familiarity: presenter knows this artist well

And then a critical contract:
Only VERIFIED CONTEXT may be presented as externally verifiable fact. EDITORIAL and AUDIO context may inform subjective commentary. Do not infer additional facts from any field.

That could be transformative for Stheno because we're no longer saying “don't hallucinate music knowledge” while leaving an information vacuum. We're giving it interesting grounded material to talk about instead.
I'd also resist the temptation to fill every field on every track. Sparse context is good. Three genuinely interesting facts/hooks are probably better than dumping twenty metadata fields into every link. The Producer could choose the handful most relevant to the particular link.
Longer term, I think this could become one of the strongest parts of the Producer/Persona architecture: Producer doesn't tell Persona what to say; it gives Persona a small box of things worth knowing. Persona decides what makes good radio from them.
