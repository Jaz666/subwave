# Silero vocal-stem comparison — 8 November 2026

## Purpose

Listening review of Sub/Beats' existing stem-energy vocal estimate against Silero VAD v5.1.2 run on the same cached Demucs vocal stem. Silero threshold: **0.5**. Times are source-track seconds. Silero's 32 ms windows are grouped into spans with at least 250 ms activity, allowing 150 ms gaps. Results describe speech-like activity; they do not certify sung-vocal absence or safe edit points.

This is an offline comparison. It does not change Library rows, saved Sub/Beats records, or the running analyzer image. The implementation and pinned model are in the working tree; no production rebuild was done.

## Before and after

| Track / coverage | Before: current stem-energy estimate | After: Silero on that vocal stem | Listening review |
| --- | --- | --- | --- |
| **Agnelli & Nelson — [“Everyday” vocal stem](</media/ssd/stems/3CZAByVhRxf1wrPPNX1PUG/head-vocals.flac>)**, head 0–40.00s | Sub/Beats energy measurement on the cached head stems: **0.00–19.35**, **21.10–33.40**, **35.30–40.00**. First range is open/uncertain at the coverage edge. Separately, the saved Library ranges were 0.104–4.122, 5.050–9.845, 14.687–18.936, 21.362–26.482, 27.121–33.181, and 35.550–39.996. | **15.23–16.83**, **16.99–18.34**, **18.66–19.01**, **21.89–22.24**, **22.78–23.07**, **23.26–24.42**, **27.68–28.45**, **29.57–30.14**, **31.17–32.32**, **35.84–38.56**. | **Pending.** Does Silero's first span line up with the heard vocal onset around 14–15s? Are the later gaps genuinely speech-free? |
| **Agnelli & Nelson — [“El Niño” vocal stem](</media/ssd/stems/75cQfewXIS03M3D1qiDnO8/subbeats/v1/4254e9520e6fcabc9ed71758c74970c9ec514b1c1541250c1836b351d1284f9a/exit-vocals.flac>)**, exit coverage 192.20–226.55s | Stem-energy estimate: **192.20–222.85** (open/uncertain at the start of coverage). | **194.60–195.75**, **198.31–199.53**, **199.75–201.48**, **202.95–206.86**, **207.66–209.13**, **210.25–211.50**, **212.91–214.41**, **215.27–215.56**, **215.98–216.30**. | **Pending; important tail check.** The owner hears vocals through the closing bar (about 220.65s). Does listening confirm vocal activity after Silero's last span? If so, this is a clear Silero false negative for sung/wordless tail material. |

## How to review

For each row, compare the vocal stem in the time ranges immediately before, within, and after Silero's spans. In Everyday, especially inspect 12–20s and the pauses within 21–40s. In El Niño, inspect the last Silero span through the owner-marked closing bar at approximately 220.65s. Mark each result as **matches**, **false positive**, **missed vocal**, or **uncertain**; listening remains the reference.

## Readout so far

Everyday is promising at the first onset: the new stem-based Silero result starts at 15.23s, near the owner's 14–15s estimate, while the saved Library detector includes earlier ranges. El Niño raises a concrete concern: the current Silero implementation stops at 216.30s even though the existing energy estimate and owner listening place vocal activity later. Do not use this two-track result to replace the standard Stem pipeline detector yet.

The initial Silero pilot used a separate timestamp-merging helper and reported a later El Niño span end (about 221.70s). The table above is from the current Sub/Beats implementation run on the cached coverage stem. That difference makes the El Niño tail a priority for the listening check and shows why the final production helper needs validation against varied singing styles.

## Reproducibility

- Model: Silero VAD v5.1.2 ONNX, SHA-256 `2623a2953f6ff3d2c1e61740c6cdb7168133479b267dfef114a4a3cc5bdd788f`.
- Input: the existing station's cached Demucs vocal stems, no new separation pass.
- Everyday: `3CZAByVhRxf1wrPPNX1PUG/head-vocals.flac`, 0–40s.
- El Niño: cue-coverage artifact `4254e9520e6fcabc9ed71758c74970c9ec514b1c1541250c1836b351d1284f9a/exit-vocals.flac`, source offset 192.203s.
- Both detectors were computed over the same decoded stem coverage. Nothing was written to station state.

Two tracks are a pilot, not an accuracy claim. If listening confirms the onset benefit and El Niño tail miss, the next evidence set should include quiet/wordless singing and known vocals allocated to Demucs' `other` stem before proposing a wider Stem-pipeline change.
