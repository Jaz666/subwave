# Synced lyric boundary scan — 2026-11-08

Scan of the 109 prepared Sub/Beats tracks from the station checkout. This is a report only; it did not update cues or vocal analysis. The first pass was captured while LRCLIB requests were pending, so the table below uses a later pass after those lookups settled.

## Coverage

- 55 tracks returned timed lyrics (39 from LRCLIB; 16 from the music server).
- 21 had lyrics without usable timestamps; 31 returned no lyrics; 2 had explicit instrumental lyrics.
- `firstLyricMs` is the first non-instrumental lyric timestamp. It can identify a lyric onset, but may be later than a non-lyrical vocalization.
- `lastLyricStartMs` is only the start of the final timed line. The report has no line-end timestamp, so it is not a measured vocal end and should not be applied as an outro cue.

## First lyric onset differs from current intro cue by at least 5 seconds

| Track | Current intro cue | First lyric timestamp | Difference | Source |
|---|---:|---:|---:|---|
| Rhythm on the Loose — Break of Dawn | 0.9s | 75.5s | +74.6s | lrclib |
| The Supermen Lovers feat. Mani Hoffman — Starlight | 2.0s | 43.0s | +40.9s | lrclib |
| Armand van Helden — The Funk Phenomena | 30.3s | 60.3s | +30.0s | music-server |
| Hot Natured — Benediction (radio edit) | 18.3s | 41.2s | +22.8s | lrclib |
| Urban Cookie Collective — Feels Like Heaven | 7.2s | 29.8s | +22.5s | lrclib |
| N‐Joi — Anthem | 0.0s | 19.0s | +18.9s | lrclib |
| De’Lacy — Hideaway | 0.1s | 17.2s | +17.0s | music-server |
| Lonyo — Summer of Love (radio edit) | 3.6s | 18.4s | +14.9s | lrclib |
| Fatboy Slim — Praise You (radio edit) | 1.9s | 16.7s | +14.8s | lrclib |
| Gorgon City feat. MNEK — Ready for Your Love | 9.3s | 0.5s | -8.8s | lrclib |
| MK — 17 | 3.4s | 11.5s | +8.1s | music-server |
| Rage — Run to You | 30.8s | 38.1s | +7.3s | lrclib |
| Steve Angello & Laidback Luke feat. Robin S — Show Me Love | 0.6s | 6.5s | +5.8s | lrclib |
| Armand van Helden — My My My | 0.1s | 5.9s | +5.8s | lrclib |
| Chris Malinchak — So Good to Me (radio edit) | 6.3s | 11.3s | +5.0s | lrclib |
| CamelPhat & Elderbrook — Cola (radio edit) | 3.1s | 8.1s | +5.0s | lrclib |

## Last lyric start differs from current outro cue by at least 30 seconds

These large gaps show why the last lyric start cannot stand in for the vocal end. They are comparison points for later method work, not proposed outro changes.

| Track | Current outro cue | Last lyric start | Difference | Source |
|---|---:|---:|---:|---|
| Bel Amour — Bel Amour | 171.9s | 58.9s | -112.9s | music-server |
| Sash! — Ecuador | 208.2s | 97.4s | -110.8s | music-server |
| Degrees of Motion — Shine On | 297.9s | 191.6s | -106.3s | lrclib |
| Peggy Gou — Starry Night (edit) | 227.9s | 149.8s | -78.1s | lrclib |
| De’Lacy — Hideaway | 199.5s | 122.3s | -77.2s | lrclib |
| De’Lacy — Hideaway (Deep Dish radio edit) | 199.5s | 122.6s | -76.9s | lrclib |
| Rhythm on the Loose — Break of Dawn | 302.6s | 239.8s | -62.8s | lrclib |
| Route 94 feat. Jess Glynne — My Love | 255.8s | 195.2s | -60.6s | lrclib |
| The Tamperer featuring Maya — Feel It | 168.0s | 107.7s | -60.3s | lrclib |
| Mighty Dub Katz — Magic Carpet Ride 07’ (radio edit) | 188.4s | 133.3s | -55.0s | music-server |
| Armand van Helden — The Funk Phenomena | 242.3s | 194.5s | -47.9s | music-server |
| Undercover — Baker Street | 237.0s | 195.8s | -41.1s | lrclib |
| DJ Jean — The Launch | 186.8s | 149.7s | -37.1s | lrclib |
| The Chemical Brothers — Hey Boy Hey Girl | 290.5s | 259.8s | -30.7s | music-server |

## Owner listening feedback — 2026-11-09

The owner reviewed the 16 onset disagreements above. Green cells in the supplied table identify the preferred existing cue or lyric timestamp; the correction column gives a separate onset where neither candidate was selected. Values below preserve the displayed precision and are listening judgements, not sample-accurate measurements.

| Track | Preferred evidence | Reviewed onset | Notes |
|---|---|---:|---|
| Rhythm on the Loose — Break of Dawn | Lyric timestamp | 75.5s | |
| The Supermen Lovers feat. Mani Hoffman — Starlight | Lyric timestamp | 43.0s | |
| Armand van Helden — The Funk Phenomena | Current cue | 30.3s | Music-server lyric timestamp was 60.3s. |
| Hot Natured — Benediction (radio edit) | Current cue | 18.3s | |
| Urban Cookie Collective — Feels Like Heaven | Current cue | 7.2s | |
| N‐Joi — Anthem | Manual correction | 6.0s | |
| De’Lacy — Hideaway | Lyric timestamp | 17.2s | |
| Lonyo — Summer of Love (radio edit) | Lyric timestamp | 18.4s | |
| Fatboy Slim — Praise You (radio edit) | Lyric timestamp | 16.7s | |
| Gorgon City feat. MNEK — Ready for Your Love | Current cue | 9.3s | |
| MK — 17 | Lyric timestamp | 11.5s | |
| Rage — Run to You | Lyric timestamp | 38.1s | |
| Steve Angello & Laidback Luke feat. Robin S — Show Me Love | Manual correction | 9.0s | |
| Armand van Helden — My My My | Manual correction | 14.0s | Slow fade in; first detectable word. |
| Chris Malinchak — So Good to Me (radio edit) | Lyric timestamp | 11.3s | |
| CamelPhat & Elderbrook — Cola (radio edit) | Lyric timestamp | 8.1s | |

Nine tracks favour the lyric timestamp, four favour the current cue, and three need a separate correction. Among the three music-server lyric candidates, two were preferred and one was rejected. Among the 13 LRCLIB candidates, seven were preferred, three lost to the current cue, and three needed a separate correction. This deliberately selected disagreement sample does not measure accuracy across all 55 timed tracks or the 109-track collection.

## Implications for the next experiment

Source priority chooses which lyric file to inspect; it does not establish that the first timestamp matches the audible first word. Keep that timestamp as candidate evidence until it has been checked against the recording. Possible causes to investigate include omitted opening lyrics, a different edit, and inaccurate line timing; the review alone does not identify which cause applies to each track. My My My also establishes a quiet fade-in case where the target is the first detectable word.

Preserve these listening judgements as comparison evidence for subsequent experiments and preserve explicit manual corrections ahead of future automatic results. Any future automatic confirmation should check words against the audio, since energy or speech activity alone already failed to distinguish vocal grooves reliably in the earlier experiments. Unresolved disagreements should retain their uncertainty and remain eligible to air; they should not each create a required operator review.

The outro question still needs end evidence: synced LRC timestamps alone mark line starts. This listening review supplied intro judgements only. No cue or live library entry was changed by recording this feedback.

## LRCLIB version audit — 2026-11-09

The owner suggested that mismatched track versions could account for the rejected timings. Read the station's cached LRCLIB IDs from `lyrics_external` and fetched their metadata and search alternatives from LRCLIB's public API. Requests were spaced by at least 1.1 seconds; no lyrics cache or cue was updated. Alternative timings below are first nonempty timed text and are candidates, not newly confirmed audible onsets. The search responses are not guaranteed to enumerate every record.

Current client behaviour in `controller/src/music/lrclib.ts`: ask `/api/get` with artist, full title, album and rounded duration; immediately accept a synced or instrumental result. Only if that does not supply one, search using title and lead artist. Search filters on duration within two seconds and folded artist/title substring agreement, then takes the first synced result. Search does not rank album identity, explicit edit/remix agreement, or closest duration. The cache retains the selected external ID and lyric text, but not the selected record's artist/title/album/duration metadata. A synced cached result is retained without a scheduled recheck.

| Track | Station duration | Selected LRCLIB record | Selected duration / onset | Alternative findings |
|---|---:|---|---|---|
| Benediction (radio edit) | 198s | [3507632](https://lrclib.net/api/get/3507632) | 198s / 41.17s | Title includes Radio Edit. Other radio-edit records within two seconds start around 0.07s, including a similarly named compilation. Neither timing group matches the owner's preferred 18.3s. |
| Ready for Your Love | 198s | [8254847](https://lrclib.net/api/get/8254847) | 198s / 0.45s | All 11 synced search candidates within two seconds start at 0.45s; none recovered the preferred 9.3s. These are not 11 independent confirmations of the audio timing. |
| Anthem | 198s | [29922027](https://lrclib.net/api/get/29922027) | 198s / 18.96s | One search candidate within two seconds; no alternative recovered the owner's 6.0s correction. |
| Show Me Love | 184s | [9747087](https://lrclib.net/api/get/9747087) | 182s / 6.5s | [33069994](https://lrclib.net/api/get/33069994), credited to Steve Angello and labelled with the same compilation, is also 182s but starts at 9.13s. That agrees closely with the owner's 9.0s correction. Other nearby-duration records also use 9.13s. |
| My My My | 378s | [30438222](https://lrclib.net/api/get/30438222) | 378s / 5.9s | One search candidate within two seconds; its album is Pacha Ibiza, while the station uses the 30 Years compilation. No returned alternative recovered the owner's 14.0s correction. |
| Feels Like Heaven | 210s | [9738654](https://lrclib.net/api/get/9738654) | 210s / 29.76s | Selected artist, title, album and duration all agree with the library. Other returned records within two seconds start at 28.21s–29.76s; none recovered the preferred 7.2s. |

Show Me Love demonstrates that choosing a different LRCLIB record can recover a reviewed onset. It does not establish whether the rejected record belongs to a different audio edit or has incorrect timestamps. Exact metadata and duration agreement also failed to guarantee correct timing in Feels Like Heaven. Version mismatch, missing opening lines, timing errors and compilation-specific changes remain possible causes; do not label all rejected records as confirmed version mismatches.

Investigate candidate selection and preserve matched metadata before adding another detector. Album/edit agreement can help rank candidates, but cannot alone confirm the recorded audio. Retain ambiguity as non-blocking uncertainty, preserve owner corrections, and use the reviewed onsets above to judge any selection change.
