# Selected-passage preview and missing coverage — 3 November 2026

Trigger: sidecar 422 reported that the selected closing cue was beyond saved
outgoing stems. The older preparation ends at percussion loss; new outro cues
can be later. The owner also corrected an assumption about Gusto's menu order:
use the selected saved arrival, never assume the first or seventh option has a
particular bar count.

## Scope and implementation

Cue choices/parent stem bundles stay immutable. Plan the complete outgoing
ending plus incoming source-zero opening. A promoted closing cue's later change
is the handover; an unlabelled outgoing cue keeps its prior handover meaning.
Place incoming source zero at `handover - arrival/rate`, after applying the
existing maximum 8% incoming tempo adjustment. Retain four seconds before the
earlier of outgoing closing cue/incoming entry when available. The preview ends
at the later of outgoing EOF or two incoming bars after the handover. Refuse
plans beyond 120 seconds or incoming source coverage. No synthetic loop.

Use existing saved stems only when the whole required window fits. Otherwise
verify original source hash and timing, separate the contiguous required window
with the existing Demucs/context/reconstruction checks, read the needed samples,
and discard temporary stems. Complete windows avoid a new splice between
separately estimated stems. The published WAV is cached by renderer version,
source/stem/cue identities, indices and gains. Repeating the same selection needs
no source fetch or separation. Changing a selection can require new work;
per-track bundles/shared cache budgets are not changed. Credentials stay out of
saved artifacts. Model use is reported correctly to sidecar idle management.

## Real-track check

[Exact result](passage-preview-result.json). Offline original audio is checked
against saved source SHA-256. Previously verified Gusto head FLACs are checked
against their saved manifest. Isolated parent/cue manifests represent the missing
outgoing coverage; this is not a direct copy of private live-station bundles.
No station cache, library metadata, queue or services are written.

- Official cached htdemucs checkpoint; CPU, two Torch threads, no weight download.
- Librosa 1.0.0 / Torch 2.7.1+cpu in the existing isolated stem environment.
- Rozalla closing cue 163.040s; later change 192.560s; source EOF 213.600s.
- Saved Gusto 16-bar arrival 30.560s; incoming rate 1.0325623.
- Preview starts at outgoing source 158.963723s and incoming source zero enters
  at preview 4.000s. Arrival meets the closing change at preview 33.596277s.
- Output 54.636281s, finite PCM16 stereo with peak below 0.981.
- Only outgoing coverage was extended; incoming head was reused.
- Cached repeat fetched nothing, used no models, and left no temporary regions.

The first render took 90.9 seconds. Render/probe/audio remain outside Git at
`/home/jaz666/codex/subbeats-beat-this-20261103/passage-preview/` and
`probe-passage-preview.py` in its parent. Run with the existing
`/home/jaz666/codex/driving-beat-evaluation-20261028/.venv-stems/bin/python`.
Source audio is not committed. Timing/coverage success does not establish
subjective transition quality; owner listening remains necessary.

Focused checks and station-source handoff are recorded in the main handover.
Rebuild analyzer/controller/web together, then retry the selected pair. Existing
cue choices need no recheck for this renderer change.
