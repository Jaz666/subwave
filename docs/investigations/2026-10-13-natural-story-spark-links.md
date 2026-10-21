# Natural Story Spark links

## Audit

Reviewed the 14 Offered Sparks generated after the controller rebuild at 11:46:41 UTC on 13 October, through 14:17 UTC. Thirteen had confirmed airings. Seven passed on the offered fact; two combined it reasonably with a track introduction. The remaining five included two fact-only lines, one forced transition and two changes to the factual subject.

Examples: Wolf Alice's formation fact omitted the track title; The Cure's ranking fact omitted artist and track. The Ramones line invented a transition with “a fact that brings us the track”. James / Hey turned the track title into the band's name. Van Morrison / Cyprus Avenue attached teenage performing history to the particular song. These problems were already present in generated speech, before TTS trimming.

The research packet and structured speech description both required the fact in the opening sentence. That is a plausible contributor to research readouts; the audit cannot isolate model behaviour or voice settings. Live settings were unreadable, and the available raw-request log was older than the rebuild. Read-only audit artifacts are under `/home/jaz666/subwave-review-notes/dj-link-integration-20261013/`.

## Change

- Make a natural DJ introduction identifying the supplied artist and track the primary task. Keep the presenter's voice.
- Describe the Spark as optional research material; remove the fact-first requirement from both the packet and structured response schema. A supported detail may fit anywhere in the link.
- Reserve speech space for identification before the Spark or other framing. Pass on the Spark when both cannot fit naturally, including one-liners.
- Label artist and track identities separately, and require biography, album and recording facts to retain their actual subjects. Explicitly guard the two subject errors found in the audit.
- Preserve relationships, attribution and significant qualifiers such as ranked-list editions. Discourage forced transitions and invented causal links.

Generation remains one call. Private decisions stay out of speech, and claim detection, selection gates, speech limits and TTS tracking retain their existing behaviour.

## Validation

157 tests passed across Sleeve Notes, verified facts, intro budgeting and vocal runway. The mocked SDK test exercises the production generation path and confirms identification-first speech can still register the researched fact, without a private pass overriding it. Packet checks cover the audited identities, subject boundaries and short-link guidance; these check the instructions, not live model compliance.

Changed-file ESLint: no errors (existing `any` warnings). Controller typecheck reports only the same ten pre-existing fixture errors in `llm-pure`, `speech-label-boundary`, `speech-year-routing` and `track-length-lookahead`.

No live provider/model calls, live database writes or Docker commands were performed. This follow-up requires a controller rebuild. Review new generated and aired lines afterwards to measure actual integration and factual-subject accuracy.
