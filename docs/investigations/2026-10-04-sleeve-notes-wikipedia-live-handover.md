# Sleeve Notes Wikipedia live pilot — 4 October 2026 handover

**Fresh-chat starting point.** The owner reset the station database, rebuilt/restarted the controller, and is letting the Wikipedia collector run overnight. Review the growing sample tomorrow before changing prompts, limits, or the database. The implementation plan and earlier design rationale are in [the Wikipedia rewrite plan](2026-10-04-sleeve-notes-wikipedia-rewrite-plan.md).

## Current result

The live extractor asks the local model to read an article chunk and return up to **20 ranked, source-close facts**. It makes one free-text call per Wikipedia chunk, with a 900-token output cap and 45-second abort. A deterministic source screen maps complete list items to evidence and retains supported claims.

The 20-fact path is working within the intended time range when llama.cpp has sufficient VRAM. In the first successes, chunks took 14.1, 24.8 and 19.4 seconds, parsed 20 facts each, and passed 16, 6 and 3 respectively through the source screen. Across the 28 recorded chunks at 20:18 UTC, 560 sparks were parsed and 225 retained. Mean time was 20.2 seconds; median 19.0; range 11.8–34.6 seconds. Twenty-five of 28 were under the 30-second target; all finished before the 45-second timeout.

The retained count is not a quality verdict. The source matcher is deliberately strict and can reject reasonable wording; inspect examples of both retained and rejected items tomorrow. No human audit of the latest 225 claims has been completed.

## Slowdown finding

The repeated timeouts coincided with llama.cpp generating at **11–15 tokens/s**. With Fish stopped, the same 2,013-token prompt produced 514 output tokens at 51.37 tokens/s; the research job parsed 20 and retained 16 in 14.1 seconds. A 9,951-token chunk then produced 607 tokens at 41.12 tokens/s in 24.8 seconds.

After Fish restarted, a 3,831-token chunk ran at 43.47 tokens/s and completed in 19.4 seconds. At the observed slow point, Fish used about 5.5 GB VRAM and llama.cpp about 5.1 GB; after Fish restarted, Fish used about 4.4 GB and llama.cpp about 6.1 GB. The roughly one-gigabyte shift and speed recovery strongly suggest that VRAM headroom or placement during model loading affects throughput. The logs do not establish whether weights, KV cache, or working buffers moved. Fish being enabled is not sufficient by itself to cause the slowdown; its evolving VRAM footprint remains worth monitoring.

llama.cpp is configured with `LLAMA_ARG_N_GPU_LAYERS=-1` and `--sleep-idle-seconds 5`, so it can unload and compete for VRAM again on a later request. The owner has another TTS engine planned for evaluation.

## Live code and operating constraints

- At the 4 October handover, `controller/src/sleeve-notes/wikipedia-extract.ts` used 20 sparks per chunk and a 30,000-character ceiling (about 7,300 prompt tokens using the measured Hole ratio).
- `controller/src/sleeve-notes/llm-researcher.ts`: prompt requests the strongest facts, close to source wording, and only a numbered list; 900 output tokens.
- `controller/src/sleeve-notes/research-worker.ts`: 45-second chunk timeout and quiet-state abort.
- Earlier on 5 October, a generic in-process TTS activity counter was added to the Sleeve Notes quiet gate. The owner has since resolved the local VRAM clash between Wikipedia extraction and the TTS engine, so the latest working change allows those renders to overlap.
- The 5-fact limit was briefly edited locally and reverted before deployment. The source and live limit were 20 at this handover. Any in-progress scan whose planned chunk count changes restarts at chunk 1 under the new plan, while already retained claims remain in the database.
- Owner rebuilt/restarted the controller after the generic TTS gate change. The lower chunk ceiling still needs the owner-run production rebuild before it is live.
- Root `CLAUDE.md` says the assistant must not run Docker or Docker Compose commands when working with the station owner. The owner runs builds, restarts, and status commands.
- No tests were run during this investigation.

## Database snapshot at 20:18 UTC, 4 October

- Wikipedia artist extraction: 22 jobs complete, 1 in `retry-at`.
- Wikipedia album extraction jobs: 9 queued.
- Wikipedia release-group biography fetches: 9 complete, 4 failed.
- Completed Wikipedia scan chunks: 28; 225 Wikipedia claims, 56 Genius claims, and 212 MusicBrainz-series claims in the claim table (493 total).
- Moderation-candidate table: 0 rows after the reset.

Counts are a snapshot and will have changed by the next review. The DB lives at `state/sleeve-notes.db`.

## Tomorrow's review

1. Read the latest database counts and per-chunk timing/yield; do not infer health from job counts alone.
2. Sample retained claims across artists for factual support, usable wording, duplicates, stale details, and source/evidence alignment.
3. Inspect rejected parsed sparks where `parsed_count` is much larger than `retained_count`; determine whether the screen is too strict or the model is embellishing.
4. Confirm the Recycle Bin remains empty of extraction rejects and that automatic collection has not created generic DJ rejections.
5. Compare llama.cpp and Fish VRAM again if speed changes. The current target is under 30 seconds per chunk, with 45 seconds the hard ceiling.
6. Keep the 20-fact limit and the database intact while collecting this baseline. Decide on prompt or source-screen changes only after reviewing the sample.


## 5 October morning follow-up

The station ran on autopilot overnight, with Wikipedia extraction as its only LLM work. The owner reports that all extracts completed without timeouts except one long David Gilmour article, which reached the 45-second limit. A subsequent daytime extract logged `station left quiet state`, confirming a separate interruption path when Subwave activity resumes.

The working tree now proposes a smaller extraction unit for the next live comparison: 20,000 characters (roughly 4,800 prompt tokens by the Hole calibration), up to 10 facts, and a 500-token output cap. Source matching, claim screening, and the quiet gate remain unchanged. This will increase calls per article; compare per-chunk completion and interruption rates, plus total model time per article. This change requires the owner-run controller rebuild and has not been tested or deployed here.

The quiet gate yields to interactive picker/request agents, queue drains, pending boundary speech, and show handoffs. It allows TTS renders, including queued link renders, to overlap with research because the owner reports the local VRAM clash is resolved. Autonomous and forced DJ segment agents are background activity because the controller can stand them down or delay airing; the non-air debug comparison run is background too. They no longer cancel or delay a Sleeve Notes chunk. Those calls can still overlap on the same LLM service, so monitor chunk latency and keep the 45-second deadline as the safety bound. This gate adjustment is local and requires the owner-run controller rebuild; it has not been tested or deployed here.

## 6 October adaptive-size review

The overnight profile recorded 303 successful chunks averaging 9.42 seconds and 2,914 source characters, plus three 45-second deadlines. The owner reports about 983 tokens per call. The station therefore used roughly ten seconds of each two-minute research interval.

The adaptive calculation was targeting a 35-second **P95 input-normalized latency**. On the latest 40 success/deadline attempts for the active prompt/model profile, P95 was 9.71 ms per source character, which recommended 3,603 characters and was clamped to the 4,000-character minimum. Actual chunks averaged below that cap because article section/paragraph boundaries can produce smaller chunks. Short chunks include fixed per-call overhead, so the P95-per-character ratio penalized them disproportionately and pinned the cap at its floor even as average call latency fell.

The local adjustment now targets a 30-second P75 input-normalized latency, while retaining the 45-second abort, the existing 25% shrink after a deadline, and the extra 15% reduction when at least 20% of the recent sample hits the deadline. The same sample yields a roughly 7,000-character cap. This is a sizing change only; prompt, claim limit, screening, and saved progress are unchanged. It requires the owner-run controller rebuild and an overnight measurement before judging whether it reaches the desired average without increasing deadline hits.

Existing scan plans are deliberately monotonic: their saved `chunk_characters` is kept when it is smaller than the new recommendation, so this adjustment applies to new scans but does not restart or enlarge scans already in progress. At this snapshot, 135 active scans were at 4,000 characters with 1,027 sections remaining in total; 114 more scans were at 20,000 characters and almost complete. Applying a larger plan to the 135 active scans immediately would require replanning and replaying their source text, so leave them intact for this test unless the owner explicitly wants that progress reset.
