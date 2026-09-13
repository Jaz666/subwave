# Sleeve Notes — Phase 0 provider decision

**Decision date:** 2026-09-13  
**Status:** complete — Genius is approved as the first provider for a strictly
bounded, non-lyric metadata and relationship scope.

## Decision

Implement the Genius adapter only to the restricted contract in this document.
A review of [`genius-mcp`](https://github.com/federicogarciav/genius-mcp) and
an authenticated live test confirm that `GET /songs/:id` supplies
`song_relationships`, credit lists, and custom performances through the
official API.

The public API reference does not describe every returned field in its response
schema, so the live test is the source of the field-level contract below.
Undocumented public endpoints used by that project remain out of scope. This
approval is for a personal, non-commercial station using the official API; any
commercial distribution or broader reuse needs Genius's written permission.

The reviewed client also calls `GET /albums/:id` and
`GET /albums/:id/tracks` on `api.genius.com` with the same bearer-token
authentication. That makes direct album lookup a candidate for the later
release-enrichment review, rather than a reason to use the project's
undocumented album-search or artist-discography endpoints. It is not approved
by this Phase 0 track-only contract: its response fields and retention policy
must be reviewed before implementation.

## What the supported Genius API establishes

The review used Genius's public API documentation and Terms of Service on
2026-09-13. The authenticated spike used a station-owned client access token
only against documented endpoints; no page scraping or undocumented request was
used.

| Area | Finding | Sleeve Notes consequence |
| --- | --- | --- |
| Authentication | Read-only endpoints accept a client access token; requests use HTTPS and `Authorization: Bearer …`. | A server-held credential would be required for any background lookup. |
| Search | `GET /search?q=…` searches Genius-hosted song documents. | It can identify a candidate song, but does not establish an allowed editorial claim. |
| Song detail | The public reference documents `GET /songs/:id`, credits, descriptions, and referents. The authenticated capture confirms `song_relationships` and custom performances on this official endpoint. | Parse only the identity, relationship, and credit allowlist below. |
| Relationships | The live official response contained `samples`, `sampled_in`, `covered_by`, `interpolated_by`, `remixed_by`, and `translations` relationship groups with linked song identities. | Retain each directed relationship source-scoped; only `samples`, `sampled_in`, `cover_of`, and `covered_by` enter the initial Sleeve Notes model. |
| Quotas | The public documentation does not publish a numeric request quota or retention limit. | Use a deliberately conservative operational ceiling: one in-flight request and no more than one request per second, with exponential retry and immediate backoff on `429` or `5xx`. This is a safety ceiling, not a claimed Genius quota. |
| Attribution and retention | The API documentation describes request/response mechanics but does not grant a broad content-reuse licence. Genius's current Terms reserve rights in Genius Content, prohibit scraping, and limit commercial use absent written authorization. | Retain only structured IDs, names, relationship labels, dates, source URL, retrieval time, and required source attribution. Do not retain or transform Genius prose, annotations, images, or lyrics. |

Primary sources:

- [Genius API documentation](https://docs.genius.com/) — endpoints,
  authentication, response format, and the documented song/referent schema.
- [Genius Terms of Service](https://genius.com/static/terms) — last updated
  January 13, 2026; applies to Genius APIs as part of the Service.
- [`genius-mcp`](https://github.com/federicogarciav/genius-mcp) — technical
  evidence that a working integration attempts to read relationships and
  credits from the official song endpoint; its README separately identifies
  its undocumented endpoints.

## Lyrics exclusion boundary

The provider contract cannot rely on a keyword check, a content classifier, or
a later discard step. A provider is eligible only if each endpoint it calls is
documented to provide structured fields that can be reduced to a bounded
allowlist containing no lyrics, referent fragments, annotation body,
description prose, or page-rendered content. The adapter must project only that
allowlist before any persistence, logging, prompting, or API exposure.

For Genius, `/referents`, `/annotations/:id`, and every `lyricsgenius`
undocumented endpoint fail this test and are prohibited. `GET /songs/:id` is
approved only through the explicit field allowlist below; no other response
field may reach stored data, a prompt, an API response, or a log.

The adapter must not request `text_format`, nor call any referent or annotation
endpoint. It must not inspect response descriptions or any lyric-status,
annotation, image, embed, media, or translation field.

## Authenticated response capture

Using the station-owned client access token, the disposable test made the two
official requests described by the provider flow:

1. `GET /search?q=The Verve Bitter Sweet Symphony` returned HTTP 200 and ten
   hits; the selected hit exposed an ID, title, and primary artist.
2. `GET /songs/50429` returned HTTP 200. Its `song_relationships` groups had
   both `type` and `relationship_type` keys. Non-empty groups included
   `samples`, `sampled_in`, `covered_by`, `interpolated_by`, `remixed_by`, and
   `translations`. The response had no `lyrics` text field.

Only this sanitized summary was retained; the token and raw response were not
written to the repository or station state.

## Genius field allowlist

The adapter may read these fields and nothing else:

```text
song: id, title, full_title, url, release_date,
      primary_artist { id, name, url },
      primary_artists [{ id, name, url }],
      featured_artists [{ id, name, url }],
      writer_artists [{ id, name, url }],
      producer_artists [{ id, name, url }],
      custom_performances [{ label, artists [{ id, name, url }] }],
      song_relationships [{ type | relationship_type, url,
        songs [{ id, title, full_title, url, release_date_components,
          primary_artist { id, name, url } }] }]
```

The raw HTTP response is transient. Parse it into this small value, discard the
raw payload, and do not log it. A value outside the shape is ignored. The
initial adapter accepts only `samples`, `sampled_in`, `cover_of`, and
`covered_by`; it records the source URL and the visible attribution `Genius`.

## Conservative local-resolution spike

This spike deliberately tested only local identity resolution. It made no
provider call and retained no provider data. The disposable sample was drawn
read-only from the station's sidecar library database on 2026-09-13:

- eight artist/title pairs projected as exact provider metadata all resolved
  back to their original local identity;
- an exact `Blue Monday` / `New Order` lookup produced ten local tracks,
  demonstrating that alternate local releases are valid multiple attachments,
  not a reason to choose one arbitrarily;
- the same title with a different artist produced zero attachments.

The spike supports this resolution rule for a future approved provider:

1. Normalize Unicode and whitespace; case-fold; remove only release-format
   suffixes that the source explicitly identifies as such.
2. Require an exact normalized **title and primary artist** match for an
   automatic local attachment.
3. Attach every matching local track ID. Do not select a preferred release or
   compilation duplicate.
4. If either identity field is absent, differs, or leaves multiple distinct
   artist/title identities, record `ambiguous` or `unavailable`; never force a
   same-title match.
5. Keep the provider entity external-only until the result is confident.

This is intentionally narrower than fuzzy search. Fuzzy matching may later be
used to propose a review candidate, but not to create a playable local link.

## Required contract for a future provider

A provider may enter implementation only with this documented contract:

```text
capabilities
  documented endpoint list and field allowlist
  explicit lyric-exclusion evidence
  supported claim and relationship types
  storage / display / transformation / speech permissions
  attribution requirements
  numeric quota and published backoff guidance

fetch(input)
  background-only, bounded, rate-limited
  returns only allowlisted structured fields
  returns no raw payload, lyrics, annotations, or page HTML

normalize(response)
  produces source-scoped identities, claims, relationships, and evidence
  preserves source URL and required attribution
  never upgrades a source assertion into a stronger fact

resolve(target)
  local-only exact-match process
  returns confident local IDs, ambiguous, unavailable, or no-match
```

The implementation review must reject a provider when any `capabilities` item
is unknown. Credentials alone do not satisfy this contract.

## Follow-up provider criteria

Research the next candidate only if its official documentation can show all of
the following before code starts: structured non-lyric claims or relationships;
a response field allowlist that prevents lyric retrieval; explicit rights for
the intended storage/transformation/exposure; published quota guidance; and
attribution requirements that can be preserved in the Notes audit surface.
