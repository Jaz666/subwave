# Story Spark rotation after a pass

Rank previously preceded offer history, so an unused first-ranked story could repeatedly win after the DJ passed. Selection now rotates within the existing specificity/editorial tier: untried stories use extraction rank and section order; passed stories follow, oldest pass first. Local connections and recording/release/artist priorities remain in place.

A turn is spent when an aired link does not express the fact, or when the DJ records an explicit context pass. The latter remains visible to selection after a released reservation expires and across store reopenings. Cancelled or failed offers without a pass do not spend a turn. Pending reservations and detected, confirmed-airing cooldowns retain their existing behaviour. A lone eligible story can still be offered again: a pass is a rotation preference, not a usage cooldown.

History is bounded by the existing 90-day selection window. No migration, model call, provider request or picker change is needed.

Validation covers rank-first initial offers, progression through three passed stories, oldest-pass retry, single-story fallback, cancelled offers, active reservations, confirmed-airing cooldowns, and persisted/released passes through the production database lookup. Requires a controller rebuild.
