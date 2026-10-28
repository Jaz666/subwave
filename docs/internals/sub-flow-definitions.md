# Sub/Flow definitions

The Library editor stores two- or three-track Flow definitions in the active
station's `sub-flows.json`. Saving resolves every track against Navidrome,
rejects missing or blocked tracks and overlapping enabled definitions, and
starts a background check. All members must be consecutive, in album order,
on the same album. The order check uses the complete unfiltered album, including
blocked or archived tracks, and rejects incomplete or ambiguous numbering.
Multi-disc boundaries are supported when their order is unambiguous. Updates
and deletes require the current revision. Disabling does not need the music
server, but enabling checks the track order again.

Definitions saved before the order check, or restored from backup, are marked
for an order check. They remain visible rather than being silently deleted or
changed. Playback integration must recheck the current album order before
admission, since the library may have changed after a definition was saved.

One worker at a time downloads each raw track, checks the response, hashes the
downloaded bytes and decodes the whole file with FFmpeg to measure its duration.
When the library reports a duration, a difference greater than two seconds
fails the check. Downloads are limited to 512 MiB per track and download and
decode operations each have a three-minute timeout. A later edit or deletion
cannot be overwritten by an earlier check. If the controller restarts during
a check, the editor offers the check again.

“Checked at save” describes a baseline, not proof that the original recording
was complete or has not changed since. It also does not mean protected playback
exists. Playback integration must check the same prepared bytes against the
saved fingerprints before admitting a complete Flow; it must not refetch a
different representation after checking. Unknown or stale library durations
cannot guarantee completeness, and decode success is not an audio-quality
guarantee.

Backups include definitions. Restore validates the file before changing state,
then clears fingerprints and marks each restored Flow for another check on the
destination station. Audio files and credentials are not included in this file.
