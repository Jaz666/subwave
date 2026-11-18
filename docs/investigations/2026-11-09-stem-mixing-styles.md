# Stem mixing styles — 9 November 2026

Four mixing styles are now implemented for Sub/Beats cue-point previews. The owner chooses a style from the **Mixing style** selector before either preview action. A style change clears the previous audio; the rendered timeline names the style actually used. The choice persists when moving between Sub/Beats pages in the current workspace.

## Styles

| Style | Bass | Melody/chords | Incoming drums |
|---|---|---|---|
| Long blend (A) | Existing four-beat entrance; outgoing bass reaches the end | Longer overlap | Existing entrance |
| Short exchange (B) | Four-beat exchange centred on arrival | Same four-beat exchange | Existing entrance |
| Bass swap | One-beat exchange centred on arrival | Longer overlap | Existing entrance |
| Drums first | Four-beat exchange centred on arrival | Same four-beat exchange | Gradual entrance, normally up to eight bars |

The established B handover is **Short exchange**. The owner preferred it slightly in four of six earlier comparisons, clearly in one, and found both versions fine in the remaining case. The owner has now compared Bass swap and Drums first: three ties and one preference for Drums first, as recorded below. All styles use the existing vocal envelopes, vocal-overlap rules, cue timing and outgoing drum tail. Short styles intentionally withhold incoming instrumental content before its handover and fade outgoing bass/melody earlier.

Style selection is explicit for this stage; **Find Suitable Transition** finds cues using the chosen style. It does not automatically vary styles or choose them by key yet. Long blend remains the initial default for existing clients. The proposed next policy is longer blends for compatible keys and Short exchange for apparent mismatches, with uncertain keys remaining eligible. The ordinary-crossfade fallback retains its own transition label and does not claim to use a stem style.

## Listening results — 9 November 2026

| Pair | Comparison | Owner judgement |
|---|---|---|
| 1 — Encore une fois → Insomnia | Long blend / Bass swap | Both fine; hard to distinguish |
| 2 — El Nino → Show Me Love | Long blend / Bass swap | Both fine; hard to distinguish |
| 3 — The Key, the Secret → Insomnia | Short exchange / Drums first | Both fine; hard to distinguish |
| 4 — El Nino → Everyday | Short exchange / Drums first | Drums first preferred |

The owner struggled to hear differences in the first three comparisons. Record those as ties, not as improvements or proof that the audio is identical. No preference strength was specified for pair 4.

Bass swap has shown no clear advantage over Long blend in these two examples, so it remains an optional variant. Drums first has one preference and one tie against Short exchange, supporting an occasional alternative when earlier incoming drums contribute to the transition. The previous six-pair preference for Short exchange remains the evidence for the proposed mismatch default. No more pronounced curves or shorter exchange durations follow from these results.

These styles share the saved cues, tempo and vocal envelopes. Bass swap changes only the bass exchange; Drums first changes only the incoming drum entrance relative to Short exchange. Whether these changes are noticeable depends on the stem content during the changed envelope. The listening results establish preference on these extracts, not a validated automatic detector for which style will win. No repeat review of these four extracts is needed.

## Four listening comparisons

The two Bass swap candidates have compatible section-key estimates (same key or relative major/minor). Drums first is compared with Short exchange on two familiar pairs. These estimates remain provisional. Each comparison changes only the relevant stem handover; both versions use the same cues, tempo, crops and gain. These are newly rendered cached-stem extracts with unity per-track gain, not copies of earlier station preview files.

| # | Outgoing → incoming | Section estimates | A | B |
|---|---|---|---|---|
| 1 | Sash! — Encore une fois (Future Breeze edit) → Faithless — Insomnia (radio edit) | 10A → 10A | Long blend | Bass swap |
| 2 | Agnelli & Nelson — El Nino → Steve Angello & Laidback Luke feat. Robin S — Show Me Love | 8A → 8B | Long blend | Bass swap |
| 3 | Urban Cookie Collective — The Key, the Secret → Faithless — Insomnia (radio edit) | 7B → 10A | Short exchange | Drums first |
| 4 | Agnelli & Nelson — El Nino → Agnelli & Nelson — Everyday | 8A → 9B | Short exchange | Drums first |

The completed judgements are recorded above. These extracts remain available for reference; no further review is requested.

## 1. Sash! — Encore une fois (Future Breeze edit) → Faithless — Insomnia (radio edit)

**A — Long blend**

![A: Long blend](/home/jaz666/codex/subbeats-style-auditions-20261109/01-long-blend.mp3)

**B — Bass swap**

![B: Bass swap](/home/jaz666/codex/subbeats-style-auditions-20261109/01-bass-swap.mp3)

Incoming arrival: 37.9s into the extract. Outgoing end: 37.9s. Incoming prefix omitted by the shared crop: 0.00s.

## 2. Agnelli & Nelson — El Nino → Steve Angello & Laidback Luke feat. Robin S — Show Me Love

**A — Long blend**

![A: Long blend](/home/jaz666/codex/subbeats-style-auditions-20261109/02-long-blend.mp3)

**B — Bass swap**

![B: Bass swap](/home/jaz666/codex/subbeats-style-auditions-20261109/02-bass-swap.mp3)

Incoming arrival: 28.5s into the extract. Outgoing end: 34.3s. Incoming prefix omitted by the shared crop: 0.00s.

## 3. Urban Cookie Collective — The Key, the Secret → Faithless — Insomnia (radio edit)

**A — Short exchange**

![A: Short exchange](/home/jaz666/codex/subbeats-style-auditions-20261109/03-short-exchange.mp3)

**B — Drums first**

![B: Drums first](/home/jaz666/codex/subbeats-style-auditions-20261109/03-drums-first.mp3)

Incoming arrival: 29.6s into the extract. Outgoing end: 37.5s. Incoming prefix omitted by the shared crop: 0.35s.

## 4. Agnelli & Nelson — El Nino → Agnelli & Nelson — Everyday

**A — Short exchange**

![A: Short exchange](/home/jaz666/codex/subbeats-style-auditions-20261109/04-short-exchange.mp3)

**B — Drums first**

![B: Drums first](/home/jaz666/codex/subbeats-style-auditions-20261109/04-drums-first.mp3)

Incoming arrival: 28.5s into the extract. Outgoing end: 34.3s. Incoming prefix omitted by the shared crop: 0.00s.

## Implementation and checks

The four values are defined in `subbeatsMixStyleSchema`, mirrored to the web schema, validated in the controller and analyzer request, forwarded by both analyzer transports, included in the preview-cache fingerprint and returned in the timeline. The controller reports an analyzer update requirement if an old analyzer returns another style for a requested new profile. Preview cache version 16 regenerates audio without a stem or cue rescan.

The eight comparison files were generated successfully through the actual `mix_passages` implementation, in an isolated CPU-limited analyzer-image process with read-only source/stem mounts and no network. The source hash, input cues, prepared keys, crops, section estimates, timelines and gain treatment are in `2026-11-09-stem-mixing-styles.json`; `subbeats_style_auditions.py` reproduces the comparisons. Audio files remain local, outside Git.

Controller and web TypeScript checks passed in both the development and station checkouts. Focused lint passed for the changed controller and web modules. The admin-query audit passed, Python syntax parsing passed, the UI mechanical detector returned no findings and Git whitespace checks passed. No unit suite, independent listening judgement or browser walkthrough was performed for this change.

An inserted incoming drum loop can bring the drum entrance earlier than the normal eight-bar window, so the loop remains audible.

## Station candidate

The candidate is maintained on `feat/subbeats-draft` in `/home/jaz666/codex/subbeats-draft-pr`. The approved source from development commit `4e8d0852` is carried into `/home/jaz666/Docker/subwave`, preserving its unrelated prompt/skill edits. The station source rollback baseline is `3deda1e6`. No live service has been rebuilt or restarted by Codex. After the source transfer, the owner can rebuild controller, analyzer and web together from the station checkout:

```sh
docker compose --parallel 1 -f docker-compose.yml -f docker-compose.analyzer-gpu.yml -f docker-compose.discord.yml up -d --no-deps --build controller analyzer web
curl --fail http://localhost:7700/api/health
```

Next: connect automatic preview style selection using the established Short exchange preference for apparent mismatches; keep Bass swap optional and Drums first as a conditional alternative. Live Picker integration remains a separate milestone.
