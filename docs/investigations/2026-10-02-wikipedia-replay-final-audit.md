# Wikipedia Sleeve Notes replay: final audit

The completed preview is `state/sleeve-notes-research-previews/wikipedia-replay-full-v12.json`.
It is preview-only and has not changed the Sleeve Notes database.

## Additive first merge prepared on 2 October

An additive merge script now selects 691 proposals across 520 frozen sources
whose Full wording appears directly in the retained evidence. It holds all
proposals from the 16 entities with known errors below; the other 1,288
proposals remain in the original preview for later review. This selection is
automated and should not be mistaken for a complete human review of every
Short anchor.

The live database was backed up consistently to
`state/sleeve-notes-research-previews/sleeve-notes-before-wikipedia-additive-2026-10-02.db`.
The host user could not write the root-owned live database. A copy of that
backup confirmed that the script would add 690 claims and supply one existing
claim with Short wording without disabling any claims. The operator then ran:

```bash
cd /home/jaz666/Docker/subwave/controller
sudo ./node_modules/.bin/tsx scripts/sleeve-notes-wikipedia-additive-merge.ts \
  --file=/home/jaz666/Docker/subwave/state/sleeve-notes-research-previews/wikipedia-replay-full-v12.json \
  --apply=yes
```

Read-only verification of the live database found 690 new Wikipedia claim
rows, no missing backup rows, and no previously enabled claim disabled. The
enabled Wikipedia total rose from 2,472 in the backup to 3,162 live; enabled
claims with Short wording rose from 52 to 743. Two other claim rows arrived
while the station continued running.

The command is idempotent: repeating it keeps existing rows, including their
Full wording, evidence and enabled state. It fills only blank Short wording
on an exact-key match. It does not require a controller rebuild.

## Final counts

| Source type | Frozen sources | Proposed claims | Claims per source | Sources with no proposal | Existing claims on those empty sources |
| --- | ---: | ---: | ---: | ---: | ---: |
| Artist | 1,268 | 1,610 | 1.27 | 451 | 518 |
| Release group | 1,200 | 396 | 0.33 | 905 | 825 |
| Total | 2,468 | 2,006 | 0.81 | 1,356 | 1,343 |

All 2,468 sources completed; there were no failed requests. The 27,158
rejected candidates are mostly incomplete, unsupported, wrong-category, or
shape failures. The drop in yield after source 1,268 coincides with the
transition from artist articles to release-group articles. It is not a
within-artist drift over the replay.

The current 2,429 Wikipedia claims are spread across the frozen source
entities. The 1,112 sources with at least one proposal currently have 1,086
claims; replacing those sources with their 2,006 proposals would increase the
Wikipedia total to about 3,349 before individual review decisions. Applying
all 2,468 sources, including empty replacements, would instead disable the
1,343 current claims on empty sources. Preserve those empty-source claims.

## Apply policy

1. Keep the original completed preview unchanged as the audit record.
2. Prepare a separate review copy containing only sources with at least one
   proposal. Omit empty sources from the apply batch; do not mark them as
   reviewed empty replacements.
3. Review the risk cases below and a stratified sample from artist and
   release-group proposals before bulk decisions. A model acceptance is a
   proposal, not proof of factual support.
4. Revise or reject only the identified claim within a source. Other useful
   proposals from that source can stay.
5. Run the apply script without `--apply=yes` first. The preflight checks
   every reviewed candidate against the frozen source and verifies source
   revisions and hashes. Apply only after the reviewed batch passes.
6. Later research can revisit sources that produced no proposal, particularly
   album pages. The replay need not be rerun merely to fix the individual
   wording defects below.

## Targeted decisions to prepare in the review copy

| Entity | Problem | Decision |
| --- | --- | --- |
| Carly Simon | `Boys in the Trees was produced by Carly Simon` is not supported by the selected evidence, which only describes a Top 10 album. | Reject. |
| Suzanne Vega | Short says Lenny Kaye and Steve Addabbo `produced Suzanne Vega`; the evidence describes songs they produced. | Revise Short to name the songs, or reject if the Full cannot be made self-contained. |
| Talking Heads | Short changes `first collaboration with Brian Eno` to `Brian Eno produced Talking Heads' first album`. | Revise Short to `Talking Heads first collaborated with Brian Eno on More Songs About Buildings and Food`. |
| Papa Roach | Short ends at `Guns N`. | Revise Short to `Papa Roach toured with Guns N' Roses in October 2006`. |
| The Walker Brothers | Full is the fragment `Originally recorded by Frankie Valli the previous year`; Short changes the object to the Walker Brothers. | Reject. |
| DEVO | Full is a sentence fragment about a cover of `Head Like a Hole`. | Reject or revise to a complete supported sentence. |
| London Calling | Evidence says The Clash asked Guy Stevens to produce the album; Full says he produced it. | Reject pending stronger evidence. |
| Let's Dance | Short says Jim Yukich directed the song; source says he directed its video. | Revise Short to `Jim Yukich directed the Let's Dance music video`. |
| Mercy | Short says Duffy herself credits `Mercy` as her signature song; source does not say she made that assessment. | Revise Short to `Mercy is considered Duffy's signature song`. |
| Pale Green Ghosts | Short makes Sinéad O'Connor sound like a co-producer; source says she sang backing vocals. | Revise Short to `Birgir Þórarinsson produced Pale Green Ghosts; Sinéad O'Connor sang backing vocals`. |
| Paranoid | Short drops Cosmo Lee's attribution for a superlative opinion. | Revise Short to `Cosmo Lee called Paranoid the heaviest album recorded in E Standard tuning`. |
| The Final Cut | Short drops the key `last Pink Floyd album` relationship. | Revise Short to `The Final Cut was Pink Floyd's last album featuring Roger Waters`. |
| Penguin Cafe Orchestra | Full is only `Recorded between 1977 and 1980`. | Reject or revise to a complete sentence naming the album. |
| Dragon New Warm Mountain I Believe in You | Full is a producer phrase without a main clause. | Reject or revise to a complete supported sentence. |
| Kintsugi | Full is a producer and studio phrase without a main clause. | Reject or revise to a complete supported sentence. |
| London 0 Hull 4 | The proposed fact is about a football result, not the album's music or creation. | Reject. |

These are diagnostic examples, not an estimate of the overall error rate.
The sampled proposals also contain many useful, directly supported stories.
Avoid tightening the live researcher based on these individual misses while
the bulk review can correct them without another long replay.

## Story-type coverage and next investigation

The Notes Research tab shows the 80 most recently updated claims across all
providers. At the completion checkpoint, 75 of those 80 were newly collected
Genius credits or musical connections. This recency sample contained one
track story and no release stories. The most recent 80 Wikipedia claims,
considered separately, contained 21 release stories and three track stories.
The readout is therefore not a representative measure of Wikipedia story
quality or lifetime coverage.

The deeper coverage gap is real:

- The current enabled Wikipedia store has 339 release stories and 106 track
  stories. Genius deliberately collects structured credits and cover/sample
  relationships; it does not research prose about an individual recording.
- In the completed replay, 1,200 release-group articles produced only 169
  release-story proposals and 396 proposals across all allowed categories.
  905 release-group sources produced no proposal.
- Separately, 814 release-group lookups found no matching Wikipedia article
  through the current MusicBrainz/Wikidata path, so those releases never
  reached extraction or the replay. The corresponding jobs are labelled
  `failed`, but all 814 provider outcomes are `no-match`; the only two actual
  failed provider requests were retries. Existing `failed` jobs are not
  automatically queued again by the missing-job backfill.
- Artist articles supplied another 341 release-story proposals and all 106
  track-story proposals. Those song stories are incidental discoveries from
  artist biographies rather than a dedicated track path.
- A release-group rejection sample shows many useful facts that the model
  expressed as context-dependent `the album` or `it` claims. It also shows
  unsupported, routine release, and non-music material that should stay
  rejected. Changing the validator globally would mix those together.

The next investigation should separate album coverage from recording stories:

1. Audit a fixed sample of release-group rejections whose evidence contains
   a concrete recording, production, collaboration, or concept fact. Check
   whether the article title and selected passage safely identify the album
   before changing subject resolution. Pilot any change on those frozen
   sources and compare both yield and factual errors.
2. Inspect a fixed sample of the 814 no-match release groups. Check whether
   a relevant English Wikipedia article exists but lacks the expected source
   link, or whether no article exists. Improve matching only where identity
   can be established, and report no-match separately from request failures.
3. Define a dedicated recording-story source path. MusicBrainz and Genius
   structured metadata establish identity and relationships, but do not
   currently provide bounded prose about the song's creation or cultural
   context. Keep this path within the same encounter-based queue and provider
   budget model.
4. Add separate readout counts for story categories by provider and entity
   type, so the operator can see album and track coverage without the latest
   Genius writes pushing them out of an 80-row activity window.

## Candidate album source: Genius descriptions

The first checked no-match examples, *Contact Note* by Jon Hopkins and
*Eingya* by Helios, genuinely lack Wikipedia articles. Further Wikipedia
matching will not solve this part of the coverage gap. Genius album-level
descriptions are a promising additional source, subject to a small pilot:

- Use an album identity associated with a confidently matched Genius song,
  then verify album title and primary artist against the local canonical
  release group. Do not attach a deluxe, live, or compilation biography to a
  different album merely because a song appears on both.
- Fetch each unique album at most once through the existing Genius request
  reservation and quiet-work gate. Give album requests a lower queue priority
  than already encountered songs; avoid a library-wide backfill initially.
- Retain only the album identity, URL, and bounded description text as a
  separately attributed source. Do not retain lyrics or the raw API payload.
- Feed the description through the same evidence-backed Full/Short proposal
  and review path. Start with a small sample of albums without a usable
  Wikipedia release story, measuring description availability, useful claim
  yield, mismatches, and unsupported or editorial claims before expansion.

The current Genius adapter retains only song credits and cover/sample links.
It does not retain song-to-album identity or album descriptions, so this is a
new collector and extraction path, not a change to the Wikipedia replay.

### Initial Genius album pilot implementation

The controller now selects at most 20 distinct, previously encountered
MusicBrainz album groups with a retained Genius song ID and no enabled
release-group story. Each album gets one durable Genius job. The job re-reads
one known Genius song to obtain its album ID, then requests the Genius album
description through the existing three-requests-per-minute reservation,
single-flight worker, and quiet gate. The returned title and artist must both
match the local canonical album before bounded plain description text is
retained. A second, distinct researcher job produces evidence-backed Full and
Short proposals in the release-group categories. Existing Wikipedia claims
are untouched. An album with no matching Genius bio completes without adding
a source or claim. The 20-job cap is durable across controller restarts; there
is no automatic whole-library backfill.

This implementation is prepared in the checkout and requires a controller
rebuild before the pilot starts. Inspect the first retained Genius album
sources and claims in Notes Research/Explore before increasing the cap.

### First live pilot correction

The first live run skipped *Echoes, Silence, Patience & Grace* despite a
substantial biography on its Genius album page. The station recorded two
successful album-pilot API requests for that job, so the album-detail fetch
had completed. The first parser accepted `description.plain` only; the page
exposes a substantial `description_preview`. The parser now accepts that
preview when a usable plain description is absent, and logs the specific
reason for subsequent skips. A one-time database migration requeues completed
pilot album jobs that retained no Genius album source, so the Foo Fighters
case and any other early misses can be retried under the same request budget
after the controller rebuild. This is a likely parser diagnosis until the
retry shows its exact result; the API response body was not retained.

The retry logged `album detail has no plain description or preview`. Inspecting
the public album page's own album data showed that its biography is carried
by `description_annotation.annotations[0].body`, while
`description_preview` is visible in that page data but absent from the album
API response the controller received. The collector now checks the album
description annotation and, if the album response gives only its annotation
ID, fetches that annotation through the authenticated Genius API using the
same shared request reservation. It does not fetch or parse album HTML. A
second one-time migration requeues completed pilot jobs without an album
source; the next live log will reveal whether the API actually exposes the
annotation path for this album.

### Genius album research pilot: first rejection audit

The first three completed biography extraction jobs (Billie Eilish, Foo
Fighters, and Tycho) retained no claims, despite substantial saved biographies.
The durable LLM event log shows the model proposed mostly copied source
sentences with album-title topics and unresolved references such as “the
album” and “it”. The few Full claims that crossed validation then received
Short anchors that discarded the story, including “Tycho made Weather”. This
is an extraction and compression problem, not a missing Genius biography.

Genius album biographies now receive concise album-specific Full and Short
instructions. Wikipedia research continues to use its existing instructions.
Migration v15 requeues only completed Genius album *research* jobs with a
stored source, reusing that source without another Genius API request or
removing existing claims. The next run also logs rejection counts by reason
for Genius album jobs. Inspect the retried claims before expanding the pilot.

The first retry retained two Tycho claims but none for Billie Eilish or Foo
Fighters. Its model records show that shorter instructions alone did not stop
the local model choosing catalogue and promotional sentences. The next pilot
revision presents only potential story passages to the Genius album researcher;
the original saved biography remains the validator's source of truth. For
nearby pronoun-led passages, the exact opening identity sentence is included
in the evidence receipt so the album and artist can be named without inference.
When an accepted Full fits the Short limit unchanged, it is reused rather than
sent through a lossy compression step. Migration v16 retries completed Genius
album research jobs from saved biographies, retaining any existing claims.

The next retry exposed a flaw in that passage filter. It hid the opening
Foo Fighters identity sentence and misclassified Billie Eilish's album-title
origin sentence because its quote contained “was … album”. It retained only
“Foo Fighters worked with producer Gil Norton” from that album. The filter
has been removed. The album researcher is now asked to consider one supported
identity fact as well as separate creative details, and its repair step must
name the album in every Full claim. For the first four contiguous source
sentences, the exact opening identity passage may be included in the evidence
receipt to resolve later “the album”, “the band”, and named-member references.
Migration v17 requeues completed Genius album research from saved biographies;
no new Genius requests are needed for those retries.

### Source-first album pilot

Whole-biography and per-passage LLM selection both missed or rewrote relevant
facts under the station's local model. The album pilot now creates bounded
extractive Full candidates from the saved biography's own sentences. It
resolves clear album and person references using adjacent source text; the
controller still checks exact evidence and named details. The model is used
for Short compression, with a supported Full kept when Short fails. Such a
Full-only Genius album claim is eligible only when the measured vocal runway
exceeds 18 seconds; shorter or unknown runways choose another Short-equipped
claim or the ordinary link.

The read-only preview at
`state/sleeve-notes-research-previews/genius-album-source-first-2026-10-02T16-34-31-359Z.json`
retained four Foo Fighters facts (album identity, sound/demos, Gil Norton, and
Grohl's lyric inspiration), Billie Eilish's album identity and synthesizer
title origin, and two Tycho facts. A separate five-album preview also retained
John Grant's production location and a Manic Street Preachers story. Some
valid facts are Full-only; older, overlapping claims remain in the station
until operator review. Migration v18 retries completed Genius album research
jobs once from their saved biographies without another Genius API request or
removing existing claims.
