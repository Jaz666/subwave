# Sub/Beats handover — 3 November 2026

This is the starting point for a fresh chat. Scope: cue points, beat/bar/phrase
confidence, and research toward better automatic transition selection. The latest
owner direction is recorded below and in [Sub/Beats development](../internals/sub-beats.md).
Older sections and the [30 October handover](2026-10-30-subbeats-handover.md)
contain historical prototypes; they do not override the current decisions.

## Where to resume


Latest owner update: outgoing choices seem satisfactory on the tracks previewed;
apply the same treatment to incoming tracks. Algorithm 4 adds 8/16-bar incoming
passage hypotheses within the saved head, preserves three strongest original
arrivals, and retains accepted Urban final0 22.380s / Gusto small0 22.940s.
All ten outgoing track/model candidate lists are identical to algorithm 3.
The incoming audition plays source zero through the selected arrival and two
bars beyond, retaining quiet prefixes/background groove. It works without an
outgoing selection, reuses audio when changing cues and stops the other players.
Incoming choices are ordered by complete opening duration at the outgoing tempo
against the selected closing passage; source indices are retained. This is a
length guide only: the pair renderer still aligns rhythm handovers. Actual
placement against the full outgoing closing passage and later stem coverage
remain the next rendering step after incoming listening acceptance.

Fresh preparation requires an algorithm-4 analyzer. Existing algorithm-3 outgoing
artifacts remain valid with their source/stem checks, so only incoming tracks
need rechecking to obtain new incoming labels. Rebuild analyzer/controller/web
before that recheck. The owner runs Docker; no bulk preparation or live-state
writes are authorized for these comparisons. See [incoming evidence](subbeats-research-20261103/incoming-phrase-evaluation.md)
and the [method guide](../internals/subbeats-cue-methods.md#incoming-opening-passages-algorithm-4).

Verification: 10 cue Python cases through the analyzer-Python wrapper; 60
controller Sub/Beats cases; seven web selection cases; controller/web typechecks.
Browser checks cover source-zero playback without outgoing selection, cue reset,
source reuse, two-bar stop, closest-length selection, mutually exclusive audio,
original pair indices and desktop/mobile. Library search and all six query-cache
checks pass. The source download now has an explicit, narrowly registered
imperative classification; the admin-query audit passes. No dataset/model run,
new stem separation, Docker build or restart was performed. Development implementation `63398e0f` is pushed. Station source is now
`894880b2`, pushed on `test-station/sleeve-notes-clean-20261014`; its full
28-module schema mirror was regenerated. Code hashes match the tested dev
implementation; the development-only handover stays out of the station checkout.
Source rollback for incoming changes is `77e3b277`. Both worktrees are clean.
The station admin-query audit also passes after integration. No services were
rebuilt or restarted. Named upstream/fork refs were refreshed; upstream main
remains `03a48c21` and develop `1c4a9ff2`.

Next: owner rebuilds analyzer/controller/web with the existing GPU/Discord
overlays, checks `/api/health`, then Beat This! rechecks incoming tracks and
uses **Listen to this opening**. Preserve accepted outgoing algorithm-3 choices.
Confirm complete incoming passages/background groove before changing blend
placement or extending ending stems. Normal Stem Blend/broadcast is unchanged.

### Previous outgoing-stage handoff

Latest owner direction: final quarter was approximate; favour 8/16-bar closing
passages and establish outgoing selection before incoming fitting. Algorithm 3
now searches the second half of the original recording, ranks existing structural
boundaries with 8/16 complete bars to a sustained quieter closing change, and
keeps fade onset as a separate alternative. No bars are subtracted from EOF and
no phrase label is forced on unsupported material. A closing change is not
necessarily the musical endpoint. See [method and limits](../internals/subbeats-cue-methods.md#closing-passage-guidance-algorithm-3)
and [ten track/model comparisons](subbeats-research-20261103/outgoing-phrase-evaluation.md).
Both models rank Rozalla 163.040s first (16 bars to 192.560s), with an 8-bar
alternative at 177.820s; its 188.900s fade remains separate. Urban Cookie
Collective and Afro-Left have closing candidates; Gusto and Cubik have ordinary
candidates only. These are offline checks using saved inference, not listening
approval. Rebuild analyzer/controller/web, then Beat This! recheck selected
tracks. The owner runs Docker; incoming fitting and later stem coverage remain
pending. Verification: nine cue Python cases via the analyzer-Python wrapper, controller
Sub/Beats 59, web selection 6, controller/web typechecks and targeted lint.
Desktop/mobile cue checks, Library search and all six query-cache browser checks
passed on temporary fixture state. The UI detector is clear; the query audit
retains its pre-existing imperative audio-download notice. No Docker commands,
new model inference, library-wide rechecks or incoming changes were performed.
Development implementation `aa80d6e4` is pushed. Station source is now
`77e3b277`, pushed on `test-station/sleeve-notes-clean-20261014`; its full
28-module schema mirror was regenerated. The development-only handover remains
absent from the station checkout. Source rollback for this change is `57db2e97`.
No services were rebuilt or restarted. Upstream refs were refreshed before
integration; main remains release `03a48c21`, develop `1c4a9ff2`.
Next: owner rebuilds analyzer/controller/web using the existing GPU/Discord
overlays, checks `/api/health`, and rechecks Rozalla with Beat This! before
listening from the suggested 2:43 cue through the original ending. Both tracks
need refreshed artifacts before a cue-pair audition. Do not start incoming
matching until the outgoing listening choices have been accepted.

Historical correction before that clarification: outgoing candidates were
restricted to the final quarter.
Development commits `cf8d770f` and `718dce4c` are pushed; station source is
`57db2e97`, with the full station schema mirror regenerated. Source rollback
for this fix is `536e7daa`. No services were rebuilt or restarted. The six
analyzer-adapter cases also pass, including refusing older cue responses. The owner
reported Rozalla’s expected outro around 2:41 versus older candidates at
0:44–1:51. Algorithm 2 now searches the actual ending independently of old
exit-stem coverage and adds sustained fade candidates. The web/API reject earlier
outgoing choices. Source-verified cached inference on Rozalla gives a structural
candidate at 2:43.040 and a fade candidate at 3:08.900; the recording is 3:33.600
and the final quarter begins at 2:40.200. Focused tests/type checks passed. The
owner explicitly allowed a few tests for this fix. Rebuild controller, web and
analyzer, then Beat This! recheck selected tracks; old stems are reused. Pair
mixing may still need later ending-stem coverage, which belongs to the incoming
stage. See the method guide’s final-quarter section for evidence and limits.


Latest owner direction: handle outgoing selection first, then incoming fitting.
Station source includes this outgoing audition at `536e7daa`; development
implementation commits `6a049973` and `d1595f76` are pushed. Source rollback
for this audition alone is `84ec940f`. Controller/web rebuild is pending.
An outgoing-only audition is now implemented in the cue-point Preview section:
select a prepared track and cue, then listen through the original recording's
real end without stretching or fading. One prepared track is sufficient. The
outgoing countdown labels remain relative to track end. Incoming selection is
unchanged. See the method guide's outgoing-first section for details. No tests
or checks were run for these follow-ups, per the owner's instruction. The owner
rebuilds controller and web; no analyzer rebuild/repreparation is needed for
this audition alone. Next: compare outgoing cues by listening and identify which
begins a complete closing passage, before developing incoming fitting.

### Current implementation and station source (3 November)

The owner has ended further boundary-perfection experiments and requested
practical optional preparation/preview methods on the test station. A cue-point
implementation is committed as `d8e1ca02`, with upstream `v1.30.0` reconciled
in merge `d9cc1f59`. The tested station candidate `b5eda6e4` is published on
fork branch `integrate/subbeats-cues-1300-20261103` and has been fast-forwarded
into `/home/jaz666/Docker/subwave` on its existing station branch.
The historical listening tasks below are no longer the next action.

The [method guide](../internals/subbeats-cue-methods.md) records the controls,
limitations, checks and exact rebuild/health commands. Preparation offers the
current method and official Beat This! small/full cue analysis. Preview offers
the current 16-bar exchange and a saved-cue opening/tail blend. No external cue
repository code was copied. Normal Stem Blend's Beat This! PR remains unmerged.

Controller/web lint and typechecking passed on the full station candidate.
Controller checks passed: Sub/Beats 59, Sub/Flow 49, explicit-track rules 101,
pick-time stems 51, orphan purge 84, stem cache 61, and the Python wrapper.
Web library 37 and admin-query 9 tests passed, as did the query audit. An
isolated browser fixture passed the cue controls, mobile layout, library search
and all six query-cache checks. An offline real-stem Urban → Gusto cue preview
rendered successfully (53.148s), retained at
`/home/jaz666/codex/subbeats-beat-this-20261103/station-cue-check/urban-to-gusto-cue-preview.mp3`.
This pair has not received owner listening approval.

**Operational state:** the release/cue integration was `b5eda6e4`; current
station source includes outgoing auditions at `536e7daa`. Whole-integration source rollback is
`e4e22d34`. No station build, restart, live analysis or metadata change was
performed. The owner must rebuild analyzer, controller, web and broadcast
using the existing GPU and Discord overlays. CUDA/AIO images were not built.
Next: owner rebuild and health check, then recheck two tracks with a cue method
and compare the two preview methods. Do not restart perfection experiments.

### Upstream check and resolution evidence

Before station integration, the owner explicitly requested a fresh upstream
check because a new release appeared. The check fetched upstream `main` and
`develop` and inspected the release API, commit changes and merge simulations:

- `v1.30.0` points to main `03a48c21a60c176140ffa24169687f14616b3e19`.
  GitHub published it at 10:34:24 UTC on 3 November, marked **prerelease** at
  inspection. `/releases/latest` still reports 1.29.0; query the specific tag.
  The release's Publish images workflow was queued, so publication of a tag
  does not establish availability of its images.
- The most relevant addition is `c246de5b` / #2250: optional separation of
  missing stems while the next track waits. It defaults off, adds a separate
  300-second analyzer deadline, changes eviction priority/budget accounting,
  and defers normal Stem Blend rendering while separation occupies the only
  worker. This is not Beat This! cue detection.
- `97212119` / #2228 requires recording-identity evidence when restoring
  quarantined stems. #2247 verifies mapped local audio before playback;
  #2251 moves migration column creation under the write lock. Preserve these
  fixes when reconciling the candidate.
- Beat This! PR #2244 remains **open, draft, unmerged**, at
  `dc4bbbc4443eeb6e1f811315d0fae3e6c5f27a8a`; #2248 still tracks its review.
  The new release does not supply that integration. The fetched changes do
  not change the analyzer Dockerfiles/server or our Sub/Beats-specific files;
  `controller/src/music/analyzer.ts` does gain the upstream timeout changes.
- The initial non-mutating `git merge-tree` simulation against the committed development
  branch reports two conflicted paths: `controller/src/music/orphan-purge.ts`
  and `controller/src/music/stem-cache.ts`. Resolution must retain selective
  Sub/Beats cleanup controls, queued-bundle protection/invalidation, upstream
  same-recording quarantine restoration, and upstream queued-track eviction
  priority. This simulation excludes the uncommitted cue implementation.
- The same simulation against station HEAD `e4e22d34` reports 104 conflicted
  paths. A direct upstream pull/merge into that long-diverged station checkout
  is unsuitable as a quick deployment step. Instead, the tested delta from
  development baseline `81264cca` was applied in a separate station-candidate
  worktree; five conflicts were resolved preserving local Flow selection,
  duration rules and documentation alongside upstream explicit-track policy.
  The station's full schema mirror was regenerated. The tested candidate was
  committed/pushed before the station checkout was fast-forwarded to it.

Both development cache conflicts are resolved, retaining selective cleanup
controls and upstream recording-identity checks. Missing/mismatched evidence
stays quarantined; focused tests cover restoration once matching evidence is
available. Upstream queued-track eviction priority and analyzer deadlines are
retained. The release check itself ran no application tests; the later candidate
checks are recorded above. No findings have been posted to Perminder.

### Research evidence (historical next actions superseded above)

The independent official Beat This! comparison is now complete: five full-mix
references, `small0` and `final0`, one inference each. Read the
[evaluation and owner listening result](subbeats-research-20261103/beat-this-evaluation.md)
and [portable results](subbeats-research-20261103/beat-this-comparison.json).
Neither model preserves every accepted opening. The owner confirms the Urban
`final0` and Gusto `small0` 32-second auditions sound fine. The bounded
[phrase/bar experiment](subbeats-research-20261103/phrase-bar-evaluation.md) now
finds structural candidates at 7.600/22.380s for Urban and 7.720/22.940s for
Gusto. Repetition break recovers the latter release candidate despite weak
novelty. The owner has now confirmed both marked auditions land on the expected
musical boundaries, including Gusto's completed groove release. The follow-up
[vocal/groove edge inspection](subbeats-research-20261103/vocal-edge-evaluation.md)
reuses source/hash-verified cached stems: Urban has a low-level vocal-stem tail
after 22.380s, while Gusto's known opening groove is nearly absent from its
vocal stem. The owner clarifies Gusto's early material is a repeating background
vocal groove; the distinct later vocal passage begins around 54s.
Next: owner listening to `urban-vocal-boundaries.mp3` and
`gusto-other-boundaries.mp3` in
`/home/jaz666/codex/subbeats-beat-this-20261103/vocal-edges/` (each source 4–28s),
to distinguish word endings/tails and groove decay across the later markers.
The owner has confirmed Gusto's low background-vocal groove is in `other`,
with a "whomp" on the first beat; no exact source timestamp was specified.
The owner also confirms Urban's second chime at source 22.380s is precisely at
the end of the last sung word. Keep its subsequent tail separate; exact tail
clearance and Gusto's groove decay/loop seam are not yet approved.
Do not hard-cut Urban's vocals at the structural marker or certify Gusto's loop
from absent vocal-gate detections. The earlier marked 32-second auditions remain in
`/home/jaz666/codex/subbeats-beat-this-20261103/phrase-bars/`.
The research phase did not implement an automatic phrase planner or
station integration; the practical candidate above supersedes that status. Read the reference caveats before interpreting any result,
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
| `/home/jaz666/codex/subwave-sub-beats` | Development worktree, branch `feat/subbeats-phrase-evidence-20261102`; implementation and research committed here |
| `/home/jaz666/codex/subwave-cues-station-20261103` | Validated integration candidate, branch `integrate/subbeats-cues-1300-20261103`, HEAD `b5eda6e4` |
| `/home/jaz666/Docker/subwave` | Station integration checkout, branch `test-station/sleeve-notes-clean-20261014`, HEAD `894880b2`; source includes incoming phrase selection/audition, owner rebuild pending |
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
