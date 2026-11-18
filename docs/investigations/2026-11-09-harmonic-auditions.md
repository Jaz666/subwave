# Harmonic handover auditions — 9 November 2026

The owner clarified that the earlier six passes applied to the vocal-overlap exercise. The owner has now completed a separate harmonic A/B review: B is slightly preferred in pairs 1, 2, 3 and 6, clearly preferred in pair 4, and both versions are fine in pair 5.

## Listening results — 9 November 2026

| Pair | Preference | Strength |
|---|---|---|
| 1 — Encore une fois → Show Me Love | B | Slight |
| 2 — XTC → So Good to Me | B | Slight |
| 3 — A Trip to Trumpton → Summer of Love | B | Slight |
| 4 — The Key, the Secret → Insomnia | B | Clear improvement |
| 5 — Everybody’s Free → Hideaway | Both fine | No preference |
| 6 — El Nino → Everyday | B | Slight |

The owner reported that B “just about wins” for the majority, with pair 4 “definitely ahead.” That is five preferences for B, one tie, and no preference for A. A preference for B does not mean A was rejected as unusable.

This supports the four-beat bass/`other` exchange as the candidate default for apparent harmonic mismatches. The exchange already auditioned is about 1.7–1.9 seconds at these tempos; no duration adjustment follows from this feedback. Both vocal stems and drum envelopes retain the existing handling.

The next implementation should offer this short handover in Sub/Beats and recommend it for apparent key mismatches through the existing Camelot relationship helper. Compatible keys can retain the longer blend; unknown keys remain eligible with a conservative handover and no mandatory review. These are proposed selection rules: the mixer and picker have not yet been changed.

The six section-key estimates remain unverified. Listening preference does not establish key-detection accuracy, and no compatible-key A/B controls were included, so the results do not establish that B helps only when keys mismatch. No further listening judgement is needed for these six extracts.

## What the current mixer does

The cue-point mixer brings incoming `other` (melody/chords and some percussion) and vocals in at full level from the incoming entry. Incoming drums and bass ramp in over the final four beats before the arrival; outgoing drums and bass continue to the recording end. Outgoing `other` and vocals have only a final 30ms edge fade. This permits both basslines and melodic material to coexist. The current potential melodic-overlap window for these pairs is about 15–38 seconds; that is an envelope window, not measured audible conflict.

All 109 prepared tracks have a saved library key, but none has key ranges reaching the ending within the existing five-second tolerance. The standard `openingKeyFrom` / `endingKeyFrom` helpers therefore use an opening range for the incoming track and a fallback dominant opening-window key for the outgoing track. Five of these six pairs fall outside basic Camelot moves with that evidence. This is a reason to inspect the passages, not a finding that any pair sounds bad.

## Two versions to compare

- **A — current:** the existing cue-point stem envelopes.
- **B — short handover:** outgoing bass and `other` fade down while incoming bass and `other` fade up across four beats centred on the saved arrival. Incoming bass/melody before this exchange is withheld. Both vocal stems and the drum envelopes retain their current timing and levels. There is no key transposition.

B can remove an incoming instrumental hook or fade an outgoing melodic ending early. It also leaves any vocal-versus-instrument clash audible. These are deliberate trade-offs for this listening experiment, not an automatic policy for every mismatched key.

Each A/B pair uses identical timing, tempo adjustment, source crops and level treatment. These are newly rendered cached-stem extracts with unity per-track gains, rather than byte-identical copies of earlier station previews. The same peak reduction is applied to A and B. Extracts begin where cached outgoing coverage is available; the table records any omitted incoming prefix. The complete outgoing recording end is included in every extract.

## Comparison summary

The section keys are fresh estimates over the overlapping pitched stems. Different source windows and omitting the drum stem can change the answer. Their raw estimator score gaps are saved in the JSON; they are not probabilities or verified key confidence. All six section-key pairs are outside the basic same/relative/adjacent Camelot moves. The results above record transition preference; they do not diagnose the cause of any audible clash.

| # | Outgoing → incoming | Section key estimates | Potential overlap in A | Four-beat exchange in B | Incoming prefix omitted |
|---|---|---|---:|---:|---:|
| 1 | Sash! — Encore une fois (Future Breeze edit) → Steve Angello & Laidback Luke feat. Robin S — Show Me Love | 10A → 8B | 15.01s | 1.83s | 0.00s |
| 2 | Solardo x Eli Brown — XTC (radio edit) → Chris Malinchak — So Good to Me (radio edit) | 2A → 1B | 21.60s | 1.88s | 0.00s |
| 3 | Urban Hype — A Trip to Trumpton → Lonyo — Summer of Love (radio edit) | 2A → 12B | 20.03s | 1.71s | 0.00s |
| 4 | Urban Cookie Collective — The Key, the Secret → Faithless — Insomnia (radio edit) | 7B → 10A | 37.54s | 1.85s | 0.35s |
| 5 | Rozalla — Everybody’s Free (To Feel Good) → De’Lacy — Hideaway (Deep Dish radio edit) | 8A → 2B | 29.57s | 1.85s | 0.00s |
| 6 | Agnelli & Nelson — El Nino → Agnelli & Nelson — Everyday | 8A → 9B | 20.22s | 1.78s | 0.00s |

## Listen

The completed judgements are recorded above. The extracts remain available below for reference; no repeat review is requested.

### 1. Sash! — Encore une fois (Future Breeze edit) → Steve Angello & Laidback Luke feat. Robin S — Show Me Love

Incoming arrival: 37.9s into the extract. Outgoing end: 37.9s. Extract length: 41.5s.

**A — current**

![Current handover](/home/jaz666/codex/subbeats-harmonic-auditions-20261109/01-A-current.mp3)

**B — short bass/melody handover**

![Short handover](/home/jaz666/codex/subbeats-harmonic-auditions-20261109/01-B-short-handover.mp3)

### 2. Solardo x Eli Brown — XTC (radio edit) → Chris Malinchak — So Good to Me (radio edit)

Incoming arrival: 30.0s into the extract. Outgoing end: 36.6s. Extract length: 36.6s.

**A — current**

![Current handover](/home/jaz666/codex/subbeats-harmonic-auditions-20261109/02-A-current.mp3)

**B — short bass/melody handover**

![Short handover](/home/jaz666/codex/subbeats-harmonic-auditions-20261109/02-B-short-handover.mp3)

### 3. Urban Hype — A Trip to Trumpton → Lonyo — Summer of Love (radio edit)

Incoming arrival: 27.3s into the extract. Outgoing end: 32.1s. Extract length: 32.1s.

**A — current**

![Current handover](/home/jaz666/codex/subbeats-harmonic-auditions-20261109/03-A-current.mp3)

**B — short bass/melody handover**

![Short handover](/home/jaz666/codex/subbeats-harmonic-auditions-20261109/03-B-short-handover.mp3)

### 4. Urban Cookie Collective — The Key, the Secret → Faithless — Insomnia (radio edit)

Incoming arrival: 29.6s into the extract. Outgoing end: 37.5s. Extract length: 37.5s.

**A — current**

![Current handover](/home/jaz666/codex/subbeats-harmonic-auditions-20261109/04-A-current.mp3)

**B — short bass/melody handover**

![Short handover](/home/jaz666/codex/subbeats-harmonic-auditions-20261109/04-B-short-handover.mp3)

### 5. Rozalla — Everybody’s Free (To Feel Good) → De’Lacy — Hideaway (Deep Dish radio edit)

Incoming arrival: 29.5s into the extract. Outgoing end: 43.2s. Extract length: 43.2s.

**A — current**

![Current handover](/home/jaz666/codex/subbeats-harmonic-auditions-20261109/05-A-current.mp3)

**B — short bass/melody handover**

![Short handover](/home/jaz666/codex/subbeats-harmonic-auditions-20261109/05-B-short-handover.mp3)

### 6. Agnelli & Nelson — El Nino → Agnelli & Nelson — Everyday

Incoming arrival: 28.5s into the extract. Outgoing end: 34.3s. Extract length: 34.3s.

**A — current**

![Current handover](/home/jaz666/codex/subbeats-harmonic-auditions-20261109/06-A-current.mp3)

**B — short bass/melody handover**

![Short handover](/home/jaz666/codex/subbeats-harmonic-auditions-20261109/06-B-short-handover.mp3)

## Reproduction and scope

`subbeats_harmonic_auditions.py` is an offline investigation script. It reads the JSON input and integrity-checked cached stems, uses the existing key estimator, preserves pitch during tempo adjustment and writes only the audition output directory. Audio files remain local and are excluded from Git; the input, section estimates, exact saved cues, source artifact keys, levels and output names are recorded in `2026-11-09-harmonic-auditions.json`. Use its `pairs` array as the input to reproduce the experiment.

The six A/B pairs were rendered successfully in an isolated CPU-limited analyzer-image process with read-only source/stem mounts and networking disabled. No production mixer, picker or library analysis was changed, and no additional test suite or independent listening judgement was performed.

Next: integrate the auditioned four-beat bass/`other` exchange as a Sub/Beats handover option, with a recommendation for apparent harmonic mismatches. The existing Camelot helpers should own key relationships if this reaches product code; unknown or contradictory keys remain permissive. The ordinary transition fallback remains a separate live-integration decision.

## Follow-up: selectable styles

The four-beat B profile is now implemented as **Short exchange**, alongside Long blend, Bass swap and Drums first in the cue-point preview. See [the new style audition sheet](2026-11-09-stem-mixing-styles.md). The operator chooses the style for this stage; automatic recommendations based on key await the new style listening results.
