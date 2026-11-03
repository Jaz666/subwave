# Sub/Beats handover — 3 November 2026

This is the starting point for a fresh chat. Scope: cue points, beat/bar/phrase
confidence, and research toward better automatic transition selection. The latest
owner direction is recorded below and in [Sub/Beats development](../internals/sub-beats.md).
Older sections and the [30 October handover](2026-10-30-subbeats-handover.md)
contain historical prototypes; they do not override the current decisions.

## Where to resume

The independent official Beat This! comparison is now complete: five full-mix
references, `small0` and `final0`, one inference each. Read the
[evaluation and owner listening result](subbeats-research-20261103/beat-this-evaluation.md)
and [portable results](subbeats-research-20261103/beat-this-comparison.json).
Neither model preserves every accepted opening. The owner confirms the Urban
`final0` and Gusto `small0` 32-second auditions sound fine. The bounded
[phrase/bar experiment](subbeats-research-20261103/phrase-bar-evaluation.md) now
finds structural candidates at 7.600/22.380s for Urban and 7.720/22.940s for
Gusto. Repetition break recovers the latter release candidate despite weak
novelty, but does not establish a complete vocal phrase. Next: owner listening
to the two chord-marked 32-second auditions in
`/home/jaz666/codex/subbeats-beat-this-20261103/phrase-bars/`, then separate
vocal-edge evidence before applying cues. No automatic phrase planner or
station integration was implemented. Read the reference caveats before interpreting any result,
especially Cübik. Keep this bounded; the owner requested minimal testing/usage.

The owner intends to share relevant findings with Perminder through
[upstream #2248](https://github.com/perminder-klair/subwave/issues/2248), which
tracks the normal Stem Blend Beat This! integration. See the evaluation's
upstream coordination section: our official-model full-mix research does not
validate the PR's ONNX head/tail pipeline. No upstream comment has been posted.

Use **cue points** for track entry/exit positions. A fixed 16-bar approach is no
longer required: the owner accepts other lengths if they simplify development.
Choose musically supported cue-point combinations; overlap length follows the
pair and phrasing. Sixteen bars remains an option. This decision has not changed
the renderer or selected an exhaustive set of candidate durations.

## Workspace and operational boundaries

| Location | State at handover |
| --- | --- |
| `/home/jaz666/codex/subwave-sub-beats` | Development worktree, branch `feat/subbeats-phrase-evidence-20261102`; research documentation and evidence committed here |
| `/home/jaz666/Docker/subwave` | Station integration checkout, branch `test-station/sleeve-notes-clean-20261014`, HEAD `e4e22d34`; no changes by this documentation session |
| `origin` | `https://github.com/perminder-klair/subwave.git`, upstream |
| `jaz666` | `https://github.com/Jaz666/subwave.git`, fork |

Read root `STARTHERE.md`, `CLAUDE.md` and `HANDOFF.md` before edits; use the
relevant scoped guide for code changes. Work in the development worktree.
The owner runs Docker builds and restarts. Do not rebuild/restart services to
perform the next experiment. Do not enable production analysis, enqueue bulk
preparation, mutate library metadata or reanalyse the library merely to compare
models. Research audio already exists locally; prefer isolated offline outputs.
Do not fetch all remotes: a stale `sleeve-notes-source` remote has caused failures.
Fetch the named remote when needed. No PR was created by this research work.

### Important commits

- `36931d07`: structural grid-entry/backwards-projection prototype in development.
- `306840c9`: corresponding station cherry-pick; station notes subsequently reached
  `e4e22d34` (Afro-Left challenge). Source commits do not establish what a running
  container currently has; there was no fresh deployment audit in this session.
- `bdf83085`: DJ mix-alignment research notes.
- `c620722f`: cue-point terminology and flexible transition-length decision.
- This handover commit additionally preserves the text/JSON evidence linked below.

## Musical requirements to preserve

- Automatic operation is the default; optional user tweaking is welcome later.
- Keep complete vocal beginnings, phrase endings and audible tails. Activity
  gates alone do not establish complete sung phrases or safe cuts.
- For sequential vocals, either hand over directly across adjoining bars or
  separate them by multiples of four bars. This still requires validated phrase
  alignment; counting alone cannot approve a transition.
- Preserve outgoing vocals while incoming rhythm arrives where appropriate.
  Rozalla also requires an incoming-vocal-led option: introduce from source start
  over outgoing drums/bass rather than skipping the quiet opening vocals.
- If looping is necessary, use a suitable instrumental cycle without vocal
  pickups/tails crossing its edges. Count the loop's own length separately from
  the total added time; added duration must respect multiples of four bars.
  Repeating an unwanted effect with the beat can invalidate a loop/pair.
- Distinguish beat timing, first beat of a bar, musical phrase position, and
  safe vocal boundaries. None is established just by success at another level.
- Steady local intro/outro tempo is a sensible hypothesis for the target dance
  genres. Mid-track variation need not invalidate the ends. Projection through
  quiet material remains a hypothesis until supported/checked.
- When evidence or a pair is unsuitable, normal Subwave transitions remain the
  intended fallback. Prepared status and role suitability are not pair approval.

Deferred: manual waveform cue-point adjustment snapping to one bar; preview
transition-method choice (requested for a future relevant code change); playlist
search alongside artist/track/album; LLM listening/clash judgement (explicitly
set aside); automatic picker integration; fully applied vocal-led mixing.

## Current implementation and its limits

The existing preparation, role suitability (`regular`, `beat`, `subbeat`), batch
actions, removal of prepared entries/extended files, and Preview Find matches
are documented in [Sub/Beats development](../internals/sub-beats.md). The working
preview baseline was restored to the earlier 16-bar stem approach. Historical
annotated browser mixers in the notes must not be mistaken for an automatic
phrase planner to restore. Inspect current active routes/components before a
new renderer change; unused schema/hook fields may remain from earlier work.

Find matches uses cached evidence. A separate best `vocalSuggestion` is labelled
provisional and **not applied to preview audio**; the renderer's structural plan
and that suggestion can differ. Do not interpret the label as a listening pass.

`controller/scripts/subbeats_prepare.py` uses a separate full-recording Librosa
rhythm-analysis path. `subbeats_structure.py` measures energy, bass, texture and
harmonic changes in beat-synchronous contexts. Landmarks are arrangement-change
candidates, not verified phrase starts. Gusto demonstrates a valid completed
cycle with no prominent novelty peak.

The latest small code increment, `36931d07`, changes structure cache version to
3 and adds `grid_entries` separately from arrangement landmarks, plus
`intro_grid_projection`. Overlapping support runs merge; backwards projection
lists possible earlier beats/bars and preserves a partial opening bar. It does
not promote projections into measured evidence or approve a mix. First supported
grid coverage is not necessarily first audible rhythm. Runtime phrase/bar
approval remains conservative; owner listening annotations live separately.

Validation previously run for that code: `npm --prefix controller test --
analyzer-python` passed, including the three numerical helper cases. Run tests
only through `npm test`; the wrapper isolates station state. No new tests or
model benchmarks were run for the November 3 documentation/research changes;
Markdown whitespace and JSON validity are sufficient for those changes.

## Listening references and corrections

Portable records are in [owner listening anchors](subbeats-research-20261103/owner-listening-anchors.json)
and the chronological [findings](subbeats-research-20261103/findings.md).
These are reference evidence, not executable production approval rules.

| Exact recording | Library ID | Evidence to retain |
| --- | --- | --- |
| Rozalla — Everybody's Free (To Feel Good) | `6OYcg2iOqZu1SZNm3TKwBI` | Owner confirms projected opening beat/bar clicks at ~130.003 BPM; main rhythm near 22.808s; subtle tambourine before it; vocals near 6s |
| Urban Cookie Collective — The Key, the Secret | `4wCdFuyqXRNbyIkPtGCdxQ` | Owner confirms opening clicks at ~129.885 BPM; phrase change near 22.412s, vocals near 7s |
| Gusto — Disco's Revenge (Mole Hole radio edit) | `6nz5kJRZx7MV09QflArHrs` | Owner confirms ~126.072 BPM grid and completed groove release near 22.964s; repeating background vocal fades in near 7s |
| Leftfield — Afro-Left, Leftism, 7:34 | `05ul3rSoyemxeaWWNIMdyo` | Owner confirms corrected 59.3s first strong beat and projected intro clicks at ~130.008 BPM; reports steady 130 through the ending |
| 808 State — Cübik, 808:88:98, 3:33 | `0sejsWk6gftg89Oci3gbG3` | Owner reports MixMeister 124.3 BPM and prefers regular transitions; intrinsic tempo/grid behaviour remains unresolved |

Rozalla/Urban/Gusto confirmations concern their exact opening auditions, not
all phrase boundaries or the entire recording. Gusto's early background vocals
were missed by the energy gate; absence of detections must not mean instrumental.
The owner's earlier description of four groove bars differs from the measured
quarter-note bar count: retain the description and confirmed grid separately,
without rescaling BPM to force agreement.

Afro-Left's original projected accent was at 59.091s and was rejected. The
corrected audition anchors at **59.3s**, a shift of about **209ms**, not 20ms.
Its projected first bar is ~0.227s, with 32 complete intro bars. The owner called
this audition perfect. The library's earlier 172.3 BPM is not the accepted local
tempo. Independent sampled fits near the entry/middle/end are ~130 BPM, but
Librosa chooses differing within-beat phases; that does not supersede listening.
Afro-Left was not prepared or admitted to Sub/Beats by these diagnostics.

**Cübik correction:** the two near-124 auditions actually used 124.478 and
123.122 BPM. The owner hears drift and would not beatmatch it, but those clicks
differ from the reported 124.3; drift alone cannot establish actual tempo
variation. Preserve the owner's transition preference without making it a
calibrated negative ground-truth label for beat tracking. A ~165.686 BPM local
fit is a competing machine hypothesis, not a confirmed musical tempo. A second
library entry, `7sNKyCpWgeIWZ4T28fxPb7`, is on Back to the Old Skool; do not
silently substitute it. Both library entries reported 161.5 BPM on saved first
40-second grids. Neither recording's library analysis was changed.

Older pre-mixed compilation pair trials remain historical listening references
in the October handover: 1998 → Universal Nation worked at both 16 and 32 bars;
Diving Faces → Beachball worked at four bars; Mystery Land → 1998 failed even
with a full-pattern loop. These are pair-specific outcomes, not whole-track
exclusion rules. The owner then moved to standalone dance-track preparation.

### Local audio and diagnostic artifacts

Original artifact directory:
`/home/jaz666/codex/subbeats-phrase-evaluation-20261102/`.
It holds sources, scripts, detailed JSON and `audio/` auditions. Do not regenerate
stems merely to recreate already saved clips. Audio is not committed to Git.

Useful audition files under `audio/`:

- `rozalla-projected-grid.mp3`, `urban-cookie-collective-projected-grid.mp3`,
  `gusto-projected-grid.mp3`: owner-confirmed opening grids.
- `afro-left-grid-anchored-59.3.mp3`: accepted correction; the older
  `afro-left-projected-grid.mp3` has the rejected anchor.
- `cubik-124-grid-80s-balanced.mp3`, `cubik-123-grid-120s-balanced.mp3`,
  `cubik-166-grid-128s-balanced.mp3`: competing hypotheses, not reference truth.

The owner needs the music quieter under diagnostic metronome clicks. The last
Cübik renders used music gain .35 and click amplitudes .72/.92 before a common
peak normalization. Embed local audio with Markdown image syntax and an
absolute path so the desktop app can play it. Never expose authenticated stream
URLs; the saved local audio avoids another download.

## Research completed

### Follow-up: official model runs — 3 November 2026

The [offline comparison](subbeats-research-20261103/beat-this-evaluation.md)
supersedes the earlier not-yet-run status below. A separate CPU-only environment
was installed outside the station. `final0` gives the cleanest Urban Cookie
Collective grid, but shifts a Gusto bar near 31.52s; `small0` preserves that
opening better. Both start early on Rozalla and leave Afro-Left's sparse intro
incomplete. Cübik remains unresolved, with model pulse estimates around the
owner's reported 124.3 BPM in much of the track. All ten raw-click auditions,
logits and original outputs are saved locally; complete timestamp/metric JSON
and reproduction scripts are committed alongside this record. The owner has
since accepted the presented Urban `final0` and Gusto `small0` openings; phrase
approval remains pending. Follow-up source review of djcues and
automatic-cuepoints identifies barwise structural similarity as a useful next
baseline; neither supplies verified vocal-safe cue points.

### Beat This! independently of Subwave PR #2244

Read the [official implementation](https://github.com/CPJKU/beat_this),
[paper](https://arxiv.org/html/2407.21658v1), inference and postprocessing code.
It predicts beats/downbeats, not 4/8/16-bar phrases or vocal phrase completion.
Official Python interfaces expose timestamps and framewise logits, run locally
on CPU/GPU, and offer small/full checkpoints. Long audio is handled in ~30s
chunks: a full-file call does not give whole-track neural context.

Proposed role: learned beat/bar evidence; derive local BPM from accepted beats,
then use timing checks and Librosa structural features. The authors acknowledge
continuity weaknesses and deliberately confident outputs; activation strength
is not calibrated mix-safety confidence. Inspect complete candidate windows,
missed/extra beats and bar-origin changes. Quiet-intro projection still needs
independent evidence. No Beat This! package/model was installed or run here.

[#2244](https://github.com/perminder-klair/subwave/pull/2244) was an open draft at
review, head `dc4bbbc4443eeb6e1f811315d0fae3e6c5f27a8a`. It adds an opt-in small0
ONNX bar grid to standard head/tail analysis, defaults off, and leaves reported
BPM with Librosa. Our extended preparation path would not automatically use it.
Its benchmark claims were read, not reproduced. Recheck status/head before any
integration; only review was requested, not merging or deployment. Upstream
`origin/develop` was fetched through `29df0d23` during review; it was not merged.
The PR head was fetched as `origin/pr-2244` in the development repository.

### Other projects

The preserved [project review](subbeats-research-20261103/project-review.md)
records exact revisions and source links. Read actual implementations, not just
README feature claims:

- **Arkcadian:** closest architectural reference; official Beat This! final0,
  tempo from beat times, bar/tempo checks, bass activity descriptors. Its unknown
  timing can be labelled steady, so do not import that verdict. Vocal detection
  is another RMS gate; intro/outro are first/last vocals, not musical phrasing.
  No explicit code licence was found at the reviewed revision.
- **CueKey:** metrical tempo alternatives and MFCC/chroma arrangement cues;
  downbeats are still every fourth beat and clustering forces a segment count.
  PolyForm Noncommercial licence matters before any distributed code reuse.
- **DynaMix:** mostly simple feature/energy/beat-count heuristics. No vocal-safe
  phrase/loop solution; it calls `feature.key_mode` and `segment.detect_segments`,
  both absent from our installed Librosa 0.11.0 (read-only attribute check).
  MIT licence. No third-party project was installed or executed.

Original clones/report: `/home/jaz666/codex/subbeats-project-review-20261103/`.

### Real-world DJ mix study

See [documented findings](../internals/sub-beats.md#research-observed-dj-transition-practice--3-november-2026)
from [the companion site](https://mir-aidj.github.io/djmix-analysis/) and paper.
Important retained ideas: phrase-related overlap lengths; modest tempo changes;
multiple reasonable cue choices; explicit overlap/source/hand-over events; and
possible later offline mix-to-source alignment for evaluation. Distinguish
study observations from our implementation proposals. In 4/4, 32 beats are
eight bars, not 32 bars or our former 16-bar default. The method retrospectively
aligns a known recording to a mix; it is not prospective pair compatibility,
vocal-safe cutting, or phrase detection. Approximate user timestamps and genre
bias limit its use as validation. No dataset was downloaded or method executed.

## Cache state and safety context (historical observations only)

Sub/Beats uses the shared ordinary stem cache, under each track's managed
`subbeats/v1/<bundleKey>` directory. Regular stems remain separate files in the
same track folder. Both use four Demucs stems; extended windows/24-bit storage
and metadata distinguish Sub/Beats from normal shorter head/tail stems.

Selective quarantine is explicit opt-in. Preserve any historically played track,
any starred/operator-hearted track (regardless of genre/BPM/grid), manual regular
stem inclusions, and prepared Sub/Beats protection. Other automatic admissions
need the broad dance-genre filter and usable tempo/grid evidence. Enabling the
policy requires clear reclaimable-folder/space information and starts quarantine.

Selective exclusions move to `.subbeats-quarantine` for seven days. Settings'
orphan cleanup has different criteria and `.orphan-quarantine`; budget eviction
can remove live entries immediately and is not equivalent to either quarantine.
Quarantine still occupies disk but is outside the live cache budget. Do not
assume played/starred/prepared protection from selective quarantine exempts a
track from all other cleanup mechanisms.

On 2 November an explicitly authorised emergency cleanup removed 208 obsolete
extended bundles and ran the existing budget sweep (7,123 track folders). Current
prepared bundle references were checked and retained at that time. It restored
about 68 GiB free on the SSD; that is not a current free-space measurement.
Later that day the owner's selective cleanup quarantined 34,043 folders (~454
GiB allocated), with eligibility after 9 November ~11:41 GMT. Moving folders did
not itself reclaim space. These dated observations are not authority for early
deletion or a statement of today's cache contents. Runtime cache is at
`/media/ssd/stems`, mounted as `/var/sub-wave/stems`. Recheck only when needed.

Known earlier gaps: no automatic pruning of superseded extended bundles; budget
cleanup coordination differs from quarantine locks; a prepared record may
outlive evicted files. Do not expand phrase-detection work into cache maintenance
without a concrete need/request.

## Next action and acceptance gate

In `/home/jaz666/codex/subwave-sub-beats`, first read the portable anchors and
independent Beat This! assessment. Design the smallest isolated official-model
comparison using existing exact-source audio. Resolve any runtime installation
or resource choice without rebuilding the station. Record model/version, source
identity, timing coverage, local BPM, continuous grid fit, bar-origin behaviour
and observed failures. Prefer full mixes as the initial input, matching the
model's intended use; stems are a later comparison if justified.

That comparison has now been run and two opening auditions accepted; use the
follow-up report and next phrase experiment above instead of repeating
inference. The paragraphs in this section
describe the original experiment scope.

Use audible clicks the owner can hear. A successful result must preserve the
accepted intro grid references, investigate Cübik without assuming tempo drift,
and permit unknown outcomes. Only then attempt arrangement/repetition-based
phrase candidates. Do not install a new automatic picker or renderer while
claiming only to evaluate the model.
