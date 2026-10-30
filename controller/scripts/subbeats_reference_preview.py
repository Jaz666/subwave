"""Owner-annotated browser auditions. CPU only; no separation or playback hooks."""
import json
from pathlib import Path
from urllib.parse import urlsplit

from subbeats_prepare import STEM_SR, decode
from subbeats_cache import digest
from subbeats_preview import load_region
from subbeats_reference import grids


def validate_reference(value):
    if not isinstance(value, dict):
        raise ValueError('Invalid reference preview.')
    for name in ('out_seconds', 'in_resolve'):
        if type(value.get(name)) not in (int, float) or not 0 < value[name] < 1200:
            raise ValueError('Invalid annotated source time.')
    if type(value.get('bars')) is not int or value['bars'] not in (4, 8, 16, 32):
        raise ValueError('Choose a 4, 8, 16 or 32-bar reference window.')
    for name in ('out_url', 'in_url'):
        if not isinstance(value.get(name), str) or urlsplit(value[name]).scheme not in ('http', 'https'):
            raise ValueError('The original recording is unavailable.')
    # URLs contain credentials; never include them in manifests or fingerprints.
    return {key: value[key] for key in ('out_seconds', 'in_resolve', 'bars')}


def repeat_rhythm(audio, cue, period, length, phase_seconds):
    """Fixed four-bar cycle with a 10ms seam; never shorten a beat to crossfade."""
    import numpy as np
    cycle = 16 * period * STEM_SR
    cue *= STEM_SR
    seam = round(.01 * STEM_SR)
    if cue < seam or cue + cycle + 1 >= audio.shape[1]:
        raise ValueError('A complete four-bar outgoing loop is not prepared. Try another pair.')
    phase = (np.arange(length, dtype=float) + phase_seconds * STEM_SR) % cycle
    axis = np.arange(audio.shape[1])
    result = np.stack([np.interp(cue + phase, axis, channel) for channel in audio])
    tail = phase >= cycle - seam
    blend = .5 - .5 * np.cos(np.pi * (phase[tail] - (cycle - seam)) / seam)
    for channel in range(2):
        before = np.interp(cue + phase[tail] - cycle, axis, audio[channel])
        result[channel, tail] = result[channel, tail] * (1 - blend) + before * blend
    return result.astype(np.float32)


def source_audio(url, folder, record, fetch_source):
    """Verify the full source clock; containers/tags may differ from preparation."""
    import numpy as np
    path = None
    try:
        try:
            path, complete = fetch_source(url, max_bytes=256 * 1024**2)
        except Exception:
            raise ValueError('Could not read the original recording for this preview.') from None
        if not complete:
            raise ValueError('The original recording exceeds the preview download limit (256 MB).')
        audio = decode(path, STEM_SR, 2)
        duration = json.loads((folder / 'analysis.json').read_text())['duration_seconds']
        if abs(audio.shape[1] / STEM_SR - duration) > .05:
            raise ValueError('Original recording timing differs from the prepared audio. Recheck the track.')
        if digest(path) != record['identity']['source_sha256']:
            head, _ = load_region(folder, record, 'head', limit_seconds=8)
            reconstructed = sum(head.values())
            frames = min(audio.shape[1], reconstructed.shape[1], 8 * STEM_SR)
            if frames < STEM_SR:
                raise ValueError('Insufficient audio to verify the original recording.')
            original = audio[:, :frames]
            reference = reconstructed[:, :frames]
            level = float(np.sqrt(np.mean(original**2)))
            error = float(np.sqrt(np.mean((original-reference)**2))) / max(1e-9, level)
            if level < 1e-5 or error > .1:
                raise ValueError('The original recording differs from the prepared audio. Recheck the track.')
        return audio
    finally:
        if path is not None:
            Path(path).unlink(missing_ok=True)


def mix_reference(natural, incoming, loop, period, bars, natural_end):
    """Accepted reference envelope: musical blend, sustained rhythm, one-bar release."""
    import numpy as np
    lead, follow = 4., 8.
    window = bars * 4 * period
    total = round((lead + window + follow) * STEM_SR)
    if natural.shape != (2, total) or loop.shape != (2, total) or incoming.shape[0] != 2:
        raise ValueError('Invalid reference audio coverage.')
    onset = round(lead * STEM_SR)
    if incoming.shape[1] < total - onset:
        raise ValueError('The incoming recording ends before this preview can finish.')
    time = np.arange(total) / STEM_SR
    # Match the extension to the outgoing source using one constant composite gain.
    stop = min(round(natural_end * STEM_SR), total)
    span = round(2 * period * STEM_SR)
    if stop < span:
        raise ValueError('Insufficient natural outgoing audio.')
    source_rms = np.sqrt(np.mean(natural[:, stop-span:stop]**2))
    loop_rms = np.sqrt(np.mean(loop[:, stop-span:stop]**2))
    loop_gain = float(source_rms / max(1e-9, loop_rms))
    if not .25 < loop_gain < 4:
        raise ValueError('The outgoing loop level is unsuitable. Try another pair.')
    extension = np.clip((time - (natural_end - period)) / period, 0, 1)
    outgoing = natural * (1 - extension) + loop * loop_gain * extension
    progress = np.clip((time - lead) / window, 0, 1)
    music_fade = np.cos(progress * np.pi / 2)
    rhythm_release = 1 - np.clip((time - (lead + window)) / (4 * period), 0, 1)
    rhythm_fill = (1 - music_fade) * rhythm_release
    audio = outgoing * music_fade + loop * loop_gain * rhythm_fill
    audio[:, onset:] += incoming[:, :total-onset] * np.sin(progress[onset:] * np.pi / 2)
    edge = round(.03 * STEM_SR)
    audio[:, :edge] *= np.linspace(0, 1, edge)
    audio[:, -edge:] *= np.linspace(1, 0, edge)
    peak = float(np.max(np.abs(audio)))
    if not np.isfinite(audio).all() or peak < 1e-8:
        raise ValueError('The preview contains no usable audio.')
    output_gain = min(1., .98 / peak)
    return (audio * output_gain).astype(np.float32), loop_gain, output_gain


def reference_timeline(period, bars, natural_end, out_start, in_start, in_resolve, duration, loop_start=None):
    def clock(value):
        return f'{int(value // 60)}:{value % 60:04.1f}'
    release = 4 + bars * 4 * period
    events = [
        {'at': 0., 'label': f'Outgoing original audio from source {clock(out_start - 4)}'},
        {'at': 4., 'label': f'{bars}-bar blend starts; outgoing source {clock(out_start)}, incoming source {clock(in_start)}'},
        {'at': 4., 'label': 'Four-bar drums + bass loop supports the fade' +
         (f'; loop source {clock(loop_start)}' if loop_start is not None else '')},
        {'at': release, 'label': f'Incoming annotated release at source {clock(in_resolve)}; one-bar rhythm handover starts'},
        {'at': release + 4 * period, 'label': 'Rhythm handover complete; incoming original alone at matched tempo'},
    ]
    # EOF extension is distinct from the rhythm support which fills the musical fade.
    if natural_end < release + 4 * period:
        events.extend([
            {'at': max(0., natural_end-period), 'label': 'Outgoing original ending blends into drums + bass extension'},
            {'at': natural_end, 'label': 'Outgoing recording ends; loop continues'},
        ])
    events = sorted(events, key=lambda e: e['at'])
    return {'kind': 'reference', 'duration': duration, 'events': [e for e in events if e['at'] <= duration]}


def render_reference(req, folders, records, gains, fetch_source):
    import math
    import numpy as np
    import librosa
    if fetch_source is None:
        raise ValueError('Update the analyzer to read original recordings for reference previews.')
    ref = validate_reference(req['reference'])
    out_parts, out_seed = load_region(folders[0], records[0], 'exit')
    in_parts, in_seed = load_region(folders[1], records[1], 'head')
    out_fits, in_fits = grids(out_parts, out_seed), grids(in_parts, in_seed)
    if len(out_fits) != 1 or len(in_fits) != 1:
        raise ValueError('No unique sustained kick tempo for this annotated pair. Try another pair.')
    out_grid, in_grid = out_fits[0], in_fits[0]
    period, in_period = out_grid['period'], in_grid['period']
    rate = in_period / period
    if abs(rate - 1) > .08:
        raise ValueError('These tempos are too far apart for this preview. Try another pair.')
    region = next(r for r in records[0]['metadata']['stem_regions'] if r['name'] == 'exit')
    base = region['start_sample'] / STEM_SR
    origin = base + out_grid['origin']
    out_start = origin + round((ref['out_seconds'] - origin) / period) * period
    resolve = in_grid['origin'] + round((ref['in_resolve'] - in_grid['origin']) / in_period) * in_period
    in_start = resolve - ref['bars'] * 4 * in_period
    if in_start < 0 or out_start < 4:
        raise ValueError('The annotated window extends before the recording starts. Its reference timing needs checking.')
    unit = 16 * period
    last = min(region['end_sample'] / STEM_SR, base + out_parts['drums'].shape[1] / STEM_SR) - unit - .02
    loop_start = out_start + math.floor((last - out_start) / unit) * unit
    total = round((4 + ref['bars'] * 4 * period + 8) * STEM_SR)
    loop = repeat_rhythm(out_parts['drums'] + out_parts['bass'], loop_start-base, period,
                         total, out_start-4-loop_start) * 10**(gains[0] / 20)
    del out_parts, in_parts
    out_audio = source_audio(req['reference']['out_url'], folders[0], records[0], fetch_source)
    start = round((out_start-4) * STEM_SR)
    natural_end = (out_audio.shape[1]-start) / STEM_SR
    if natural_end <= 0:
        raise ValueError('The outgoing reference is beyond the recording.')
    natural = np.zeros((2, total), dtype=np.float32)
    part = out_audio[:, start:start+total]
    natural[:, :part.shape[1]] = part * 10**(gains[0] / 20)
    del part, out_audio
    in_audio = source_audio(req['reference']['in_url'], folders[1], records[1], fetch_source)
    stop = round((resolve + 10 * max(rate, 1)) * STEM_SR)
    incoming = in_audio[:, round(in_start*STEM_SR):stop].copy() * 10**(gains[1] / 20)
    del in_audio
    incoming = librosa.effects.time_stretch(incoming, rate=rate, n_fft=2048, hop_length=256)
    audio, loop_gain, output_gain = mix_reference(natural, incoming, loop, period, ref['bars'], natural_end)
    timeline = reference_timeline(period, ref['bars'], natural_end, out_start, in_start, resolve, audio.shape[1]/STEM_SR, loop_start)
    return audio, {'timeline': timeline, 'bars': ref['bars'], 'bpm': 60/period, 'incoming_rate': rate,
        'reference': ref, 'outgoing_source_start': out_start, 'incoming_source_start': in_start,
        'incoming_source_resolve': resolve, 'loop_source_start': loop_start, 'loop_bars': 4,
        'loop_gain': loop_gain, 'output_gain': output_gain, 'experimental': True,
        'native_tempo_return': False, 'phrase_verified': False, 'timing_source': 'owner_annotation'}
