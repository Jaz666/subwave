# Research call deferrals — 14 October 2026

Research deliberately stops a Wikipedia chunk or article/Genius album extraction when its work budget expires or when broadcast activity resumes. Previously the shared LLM recorder counted those interruptions as failures, inflating Stats and DJ Doctor's recent failure rate.

The worker now supplies an explicit research-budget or broadcast-priority abort reason. The shared recorder recognises that reason only with a generation cancellation error, retains `ok: false` (there is no usable result), and adds `outcome: deferred` plus the reason. Genuine provider timeouts, authentication errors, invalid responses and untagged cancellations remain failures. Existing retries, queue handling and provider generation health checks are unchanged.

Stats retains the total attempt count and shows deferred attempts separately, excluding them from success-rate and latency calculations. Per-kind rows use completed attempts for their OK denominator. DJ Doctor removes deferrals before selecting its latest 20 completed calls. Debug uses a neutral Deferred label and interruption details. Durable LLM events retain the outcome and reason, and reported usage still counts toward the daily token budget.

This applies to newly recorded calls. Older failure entries are not reclassified by message matching; the in-memory history clears on controller restart. No research result is admitted simply because its call was deferred.

Validation: 30 targeted controller tests passed, including failover and pinned legs, the actual structured research generation path with an adapter that ignores abort, billing, Stats/Doctor history, provider lifecycle, call logging, budgets and research review queue behaviour. Controller and web type checks and changed-file lint passed (controller lint has existing warnings). No station rebuild or Docker commands were run.
