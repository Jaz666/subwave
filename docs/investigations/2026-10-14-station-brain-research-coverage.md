# Station Brain research coverage and queue action — 14 October 2026

Station Brain now shows research coverage independently of its older encountered-artist shading. Artist rings and the details panel show Stories ready, Researched/nothing usable, Unexplored, Queued, Researching, or Research incomplete. Failed identity/provider work is not presented as successful research with no stories.

The details panel offers Add to research queue or Research again. Queued/running work disables duplicate requests. Explicit requests use the existing quiet-time workers and pacing, reuse cached Wikipedia text, preserve existing stories while replacement extraction runs, and retain operator feedback holds. No music is queued and no playback encounter or confirmed airing is fabricated.

A library artist without a canonical identity is resolved using one verified library track. The library lookup checks artist ID, artist name, album identity and track artist credit. The existing MusicBrainz matcher then hands explicit requests through to artist research even when the automatic queue cap is full. Missing identities remain incomplete. Repeat cached artist research does not wait for a new play, but still yields to broadcast activity. Schema 47 adds an explicit operator_requested job flag; priority alone never bypasses a play gate. The flag is consumed when the requested rescan starts.

Coverage is polled separately from the connection graph cache, so job changes update without rebuilding the map or losing layout/selection. Counts include enabled, sourced stories for the artist and their canonical albums/recordings, with matching title restrictions checked against retained local attachments. Readiness does not bypass per-track relevance, category settings or recent-use cooldowns. Ambiguous names do not inherit another artist’s stories. Disabled browsing uses read-only cache access and hides research actions.

Validation: Sleeve Notes controller suite, web suite, both TypeScript checks, changed-file lint, and desktop/mobile browser checks. The browser checks exercised queue submission, queued-state duplicate prevention, repeat research, incomplete coverage, collapsed mobile controls, overflow and read-only browsing. The temporary preview route and development server were removed. Docker/rebuild operations remain with the station owner.

## Current artist targeting

Target current artist now selects and zooms to the artist on the overview instead of opening an album layer. It prefers retained canonical/local IDs, then uses a unique local display-name match against the current on-air artist. A freshly opened map therefore works before the track has a saved research match; this display lookup creates no research job or canonical identity. Ambiguous names are refused. Targeting reveals an unencountered artist if that filter would hide them, and works repeatedly on the overview or from deeper layers. The current artist highlight uses the same lookup.

Browser validation covered the initial unmatched track (resolve returns 404), hidden unencountered artists, repeated targeting, return from artist/album layers, selected details and zoom. Target current artist issued no artist-album requests. Four focused tests cover identity priority, library ID lookup, unmatched fallback and ambiguous/external refusals.

## Album research queue — 15 October 2026

The selected-album details panel now offers the same Add to research queue / Research again action as artists, with separately polled album coverage. It accepts library albums, retained releases and release groups. Selecting an album does not queue work; only pressing the action does. This adds no automatic research of an artist's whole catalogue.

Library albums are verified against the current Navidrome album identity and their own tracks. A retained track match is reused only when its MusicBrainz release appearances identify the selected title uniquely. Otherwise, one track from that album goes through the existing quiet-time matcher. The chosen album may differ from the recording's original canonical home release. An unresolved or ambiguous result is shown as incomplete, with a retry available; a different album is never substituted. Schema 49 persists the library-album request and its handoff through matching.

Explicit intent follows Wikipedia lookup, optional Genius fallback and extraction. First-time album research does not need an invented playback encounter. Intent persists until extraction completes, including failed first chunks and chunk-size restarts. Repeat fallback requests can restart completed work while preserving active retry windows. Cached Wikipedia rescans reuse the article, preserve current stories during extraction and retain operator holds. Existing broadcast quiet gates and pacing still apply.

Validation: 208 Sleeve Notes controller tests, 175 web tests, both TypeScript checks, changed-file lint (one existing `any` warning in the MusicBrainz worker), admin-query audit and its nine tests, and browser checks for album coverage, the exact queue target, repeat research, queued-state duplicate prevention, mobile overflow and disabled browsing. Tests use temporary databases and mocked providers. The preview server was stopped; the live station was not changed. The owner needs to rebuild controller and web.

## Manual album requests waiting for a first play — 15 October 2026

Read-only station inspection found Animals, Meddle and Pulse waiting at first extraction with operator_requested=0, despite resolved Station Brain album requests. During MusicBrainz matching, retainCanonicalMusicBrainzMatch first creates the normal automatic Wikipedia album job. The explicit album handoff then found that active job and returned without adding manual intent. Its source lookup therefore could not forward the first-play bypass to extraction. The earlier non-canonical-home test missed this ordering because it requested a different album from the automatic one.

Queueing now promotes an existing active album job to explicit operator intent and priority 500, preserving its state, attempts and retry deadline. Source lookup forwards that intent as before. A new real-worker fixture covers the canonical-home ordering, alongside the existing selected-later-album case.

Schema 50 repairs existing active jobs linked to resolved manual album requests whose extraction has not completed since the request. It changes only intent and priority, preserves provider backoff, excludes unrelated automatic jobs, and does not restart completed research. This runs during the normal owner-controlled controller upgrade; no live cache was edited by the coding session. Queued requests will no longer require an invented first play, but still respect quiet time, pacing and retry windows. No requeue or web rebuild is needed for this correction.

Validation: all 220 Sleeve Notes tests pass, including active-job promotion, the matching-worker ordering, one-time recovery and completed/automatic-job exclusions. Controller TypeScript, changed-file lint and whitespace checks pass.
