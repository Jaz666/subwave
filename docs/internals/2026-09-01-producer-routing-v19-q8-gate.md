# V19 Q8 gate: rejected for live routing

## Result

V19 was converted to the text-only Q8 artifact
`Subwave-FunctionGemma-270M-Router-v19-Availability-Controller-Path-Q8_0.gguf`
and served in an isolated CPU-only llama.cpp container on port 8099.  V13 on
8098 was never altered.

The V19 Q8 conversion preserved the new availability behaviour:

* permanent journey-withheld controller-path regression: **25/25**, with zero
  unavailable `tracksTowardJourney` selections;
* selected Q8 controller-path checks: **35/35**, including audio/similarity,
  wide routing, and ten recovery decisions.

However, the bounded 100-example Q8 soak produced **108/129 (83.7%)**.  It
failed 21 decisions, predominantly emitting no recovery call after an empty
audio-search or artist-search result.  This violates the router's strict-empty
safe-fallback requirement.  Do not switch the controller to V19.

## Evaluator alignment fixed during the gate

The endpoint evaluator (`model-runner.ts`) had not been reproducing two live
controller behaviours after a tool call: it left an exhausted tool in the
offered list and did not append the controller's recovery/follow-up message.
The Q8 gate now mirrors both behaviours.  This exposed the recovery weakness
instead of hiding it.  Its focused tests and the Producer Router tests pass.

## Operational state

* V13 remains the live controller target at `http://host.docker.internal:8098/v1`.
* The V19 GGUF artifact and Q8 reports remain in
  `/media/ssd/training/router-v19-v18-availability-explicit/` for evidence.
* The disposable V19 server must not be promoted; V13 remains the control and
  rollback.

## Required follow-up

Build a narrowly balanced recovery correction corpus from V19 that covers
empty `searchBySound` and exact artist-search fallbacks using the real
controller messages and offered-tool subsets.  Preserve the 25/25
journey-withheld regression and rerun the same Q8 gates before another live
promotion request.
