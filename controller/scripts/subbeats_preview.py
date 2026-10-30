"""Isolated beat-only and owner-annotated browser auditions. CPU only."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile

from subbeats_cache import cached_entry, digest, tree_bytes
from subbeats_prepare import STEMS, STEM_SR, require_shared_cache

VERSION = 5
PREVIEW_BUDGET = 200 * 1024**2


def trim_previews(previews):
    """Under the preview lock, recycle only verified generated audition folders."""
    from re import fullmatch
    candidates = []
    for folder in previews.iterdir():
        if folder.is_symlink() or not folder.is_dir() or not fullmatch('[a-f0-9]{64}', folder.name):
            continue
        try:
            manifest = folder / 'manifest.json'
            record = json.loads(manifest.read_text())
            identity = record['identity']
            fingerprint = json.loads(identity['fingerprint'])
            if (set(identity) == {'fingerprint'} and isinstance(fingerprint, dict)
                    and type(fingerprint.get('version')) is int
                    and set(record['files']) == {'preview.wav'}
                    and {p.name for p in folder.iterdir()} == {'manifest.json', 'preview.wav'}
                    and hashlib.sha256(identity['fingerprint'].encode()).hexdigest() == folder.name
                    and cached_entry(folder, identity)):
                candidates.append((manifest.stat().st_mtime_ns, folder))
        except (OSError, ValueError, KeyError, TypeError):
            continue
    for _, folder in sorted(candidates):
        if tree_bytes(previews) <= PREVIEW_BUDGET:
            break
        shutil.rmtree(folder)
    if tree_bytes(previews) > PREVIEW_BUDGET:
        raise ValueError('The preview cache is full (200 MB); unrecognised files have been kept.')


def fit_grid(peaks, bpm, duration, outgoing=False, beats=64):
    import numpy as np
    if type(beats) is not int or beats not in (16, 32, 64, 128):
        raise ValueError('Kick fit requires 4, 8, 16 or 32 complete bars')
    period = 60 / bpm
    candidates = peaks[(peaks >= (4 if outgoing else 0)) & (peaks + beats * period <= duration)]
    for start in (candidates[::-1] if outgoing else candidates):
        slots = start + np.arange(beats) * period
        indices = np.abs(peaks[:, None] - slots).argmin(axis=0)
        found = peaks[indices]
        good = np.abs(found - slots) <= .13 * period
        if not good[:16].all() or good.mean() < .85:
            continue
        fitted, origin = np.polyfit(np.arange(beats)[good], found[good], 1)
        if abs(fitted / period - 1) > .03 or np.max(np.abs(found[good] - (origin + np.arange(beats)[good] * fitted))) > .13 * period:
            continue
        if origin < 0 or origin + beats * fitted > duration:
            continue
        return float(origin), float(fitted)
    raise ValueError('No sustained four-to-the-floor run fits the prepared region. Try another pair.')


def kick_grid(drums, bpm, outgoing=False, beats=64):
    import numpy as np
    from scipy.signal import butter, sosfiltfilt, find_peaks
    mono = drums.mean(axis=0)
    band = sosfiltfilt(butter(3, [35, 160], btype='bandpass', fs=STEM_SR, output='sos'), mono)
    hop = 256
    count = len(band) // hop
    energy = np.sqrt(np.mean(band[:count * hop].reshape(count, hop)**2, axis=1))
    if count < 16 or np.max(energy) < 1e-5:
        raise ValueError('No clear kick pattern in the prepared drums. Try another pair.')
    peaks, _ = find_peaks(energy, distance=max(1, round(.65 * 60 / bpm * STEM_SR / hop)),
                          prominence=max(1e-6, float(np.percentile(energy, 95)) * .15))
    return fit_grid(peaks * hop / STEM_SR, bpm, len(mono) / STEM_SR, outgoing, beats)


def load_region(folder, record, name, limit_seconds=90):
    import numpy as np
    import soundfile as sf
    region = next((r for r in record['metadata']['stem_regions'] if r['name'] == name), None)
    if not region:
        raise ValueError(f'The {name} stem region is missing. Prepare another track.')
    gain = region.get('storage_gain', 1.)
    if not np.isfinite(gain) or not 0 < gain <= 1:
        raise ValueError('Invalid cached stem level. Recheck the track.')
    parts = {}
    for stem in STEMS:
        names = [f'{name}-{stem}.{ext}' for ext in ('flac', 'wav') if f'{name}-{stem}.{ext}' in record['files']]
        if len(names) != 1:
            raise ValueError('Missing or ambiguous cached stems. Recheck the track.')
        path = folder / names[0]
        expected = region['end_sample'] - region['start_sample']
        info = sf.info(path)
        if (info.samplerate, info.channels, info.frames) != (STEM_SR, 2, expected):
            raise ValueError('Invalid cached stem coverage. Recheck the track.')
        # Keep audition memory bounded even for explicitly prepared long heads.
        frames = min(expected, limit_seconds * STEM_SR)
        data, sr = sf.read(path, frames=frames, dtype='float32', always_2d=True)
        if sr != STEM_SR or data.shape != (frames, 2) or not np.isfinite(data).all():
            raise ValueError('Invalid cached stem coverage. Recheck the track.')
        parts[stem] = data.T / gain
    analysis = json.loads((folder / 'analysis.json').read_text())
    bpms = [r['bpm'] for r in analysis['supported_regions']
            if r['end_seconds'] > region['start_sample'] / STEM_SR and r['start_seconds'] < region['end_sample'] / STEM_SR]
    if not bpms:
        raise ValueError('No supported beat evidence in this stem region. Try another pair.')
    bpm = float(np.median(bpms))
    if not np.isfinite(bpm) or bpm <= 0:
        raise ValueError('Invalid cached tempo evidence. Recheck the track.')
    while bpm < 90:
        bpm *= 2
    while bpm > 180:
        bpm /= 2
    return parts, bpm


def preview_timeline(in_cue, period, intro_vocals, duration, bar_shift=0):
    """Describe the actual mixer envelopes, not inferred musical phrases."""
    shift = validate_bar_shift(bar_shift) * 4 * period
    lead = max(4., in_cue - shift + 2., -shift)
    incoming = round((lead - in_cue + shift) * STEM_SR) / STEM_SR
    events = [{'at': 0., 'label': 'Outgoing instrumental lead' if intro_vocals else 'Outgoing lead'}]
    events.append({'at': incoming, 'label': 'Incoming opening enters; outgoing vocals withheld' if intro_vocals else 'Incoming instruments begin entering'})
    events.append({'at': lead, 'label': 'Beats aligned; 16-bar exchange starts' if not bar_shift else '16-bar exchange starts'})
    if bar_shift:
        events.append({'at': lead + shift, 'label': f'Incoming beat reference ({bar_shift:+d} bars); beats remain matched'})
    if not intro_vocals:
        events.extend([
            {'at': lead + 8 * period, 'label': 'Outgoing vocal fade complete; four-bar vocal gap starts'},
            {'at': lead + 24 * period, 'label': 'Incoming vocal fade starts'},
            {'at': lead + 32 * period, 'label': 'Incoming vocal fade complete'},
        ])
    events.extend([
        {'at': lead + 32 * period - in_cue + shift, 'label': 'Incoming instruments reach full mix level'},
        {'at': lead + 32 * period, 'label': 'Outgoing instruments begin fading'},
        {'at': lead + 64 * period, 'label': 'Exchange complete; incoming track alone at matched tempo'},
    ])
    merged = []
    for event in sorted(events, key=lambda event: event['at']):
        if merged and abs(event['at'] - merged[-1]['at']) < 1e-6:
            merged[-1]['label'] += '; ' + event['label']
        else:
            merged.append(event)
    return {'duration': duration, 'events': merged}


def mix_preview(out_parts, in_parts, out_cue, in_cue, period, bar_shift=0):
    import numpy as np
    overlap = 64 * period
    shift = validate_bar_shift(bar_shift) * 4 * period
    lead = max(4., in_cue - shift + 2., -shift)
    if lead > out_cue:
        raise ValueError('This opening needs an outgoing loop beyond the prepared lead. Try another pair.')
    tail = 8.
    total = round((lead + overlap + tail) * STEM_SR)
    incoming_start = round((lead - in_cue + shift) * STEM_SR)
    needed = total - incoming_start
    if in_parts['drums'].shape[1] < needed:
        raise ValueError('The incoming head needs more prepared coverage for this preview. Try another pair.')
    first = round((out_cue - lead) * STEM_SR)
    stop = first + round((lead + overlap) * STEM_SR)
    if stop > out_parts['drums'].shape[1]:
        raise ValueError('The outgoing exit is too short for a 16-bar preview. Try another pair.')
    time = np.arange(total) / STEM_SR - lead
    mix = np.zeros((2, total), dtype=np.float32)
    prefix = in_parts['vocals'][:, :round(in_cue * STEM_SR)]
    intro_vocals = bool(prefix.size and np.sqrt(np.mean(prefix**2)) > 1e-3)
    for stem in STEMS:
        # Four bars of space between vocal exchanges; no overlapping lead vocals.
        if stem == 'vocals':
            out_env = np.clip((8 * period - time) / (8 * period), 0, 1)
            in_env = np.clip((time - 24 * period) / (8 * period), 0, 1)
            if intro_vocals:
                out_env[:] = 0
                in_env[:] = 1
        else:
            out_env = np.clip((64 * period - time) / (32 * period), 0, 1)
            in_env = np.clip((time + in_cue - shift) / (32 * period), 0, 1)
        outgoing = out_parts[stem][:, first:stop]
        mix[:, :outgoing.shape[1]] += outgoing * out_env[:outgoing.shape[1]]
        # Short onset ramp avoids introducing the incoming prefix abruptly.
        in_env[incoming_start:incoming_start + round(.1 * STEM_SR)] *= np.linspace(0, 1, round(.1 * STEM_SR))
        mix[:, incoming_start:] += in_parts[stem][:, :needed] * in_env[incoming_start:]
    edge = round(.03 * STEM_SR)
    mix[:, :edge] *= np.linspace(0, 1, edge)
    mix[:, -edge:] *= np.linspace(1, 0, edge)
    peak = float(np.max(np.abs(mix)))
    if not np.isfinite(mix).all() or peak < 1e-8:
        raise ValueError('The preview contains no usable audio.')
    mix *= min(1., .98 / peak)
    return mix


def validate_bar_shift(value):
    if type(value) is not int or not -2 <= value <= 2:
        raise ValueError('Incoming bar shift must be a whole number from -2 to +2.')
    return value


def render_beat_preview(folders, records, gains, bar_shift):
    import numpy as np
    import librosa
    out_parts, out_bpm = load_region(folders[0], records[0], 'exit')
    in_parts, in_bpm = load_region(folders[1], records[1], 'head')
    out_cue, period = kick_grid(out_parts['drums'], out_bpm, True)
    in_cue, in_period = kick_grid(in_parts['drums'], in_bpm)
    rate = in_period / period
    if abs(rate - 1) > .08:
        raise ValueError('These tempos are too far apart for this preview. Try another pair.')
    if abs(rate - 1) > .0001:
        in_parts = {name: librosa.effects.time_stretch(part, rate=rate) for name, part in in_parts.items()}
        in_cue, _ = kick_grid(in_parts['drums'], 60 / period)
    out_parts = {name: part * 10**(gains[0] / 20) for name, part in out_parts.items()}
    in_parts = {name: part * 10**(gains[1] / 20) for name, part in in_parts.items()}
    audio = mix_preview(out_parts, in_parts, out_cue, in_cue, period, bar_shift)
    prefix = in_parts['vocals'][:, :round(in_cue * STEM_SR)]
    intro_vocals = bool(prefix.size and np.sqrt(np.mean(prefix**2)) > 1e-3)
    metadata = {'timeline': preview_timeline(in_cue, period, intro_vocals, audio.shape[1] / STEM_SR, bar_shift),
                'bars': 16, 'bar_shift': bar_shift, 'bpm': 60 / period, 'incoming_rate': rate,
                'experimental': True, 'native_tempo_return': False, 'phrase_verified': False}
    return audio, metadata


def render_preview(req, fetch_source=None):
    import numpy as np
    import librosa
    import soundfile as sf
    from re import fullmatch
    bar_shift = validate_bar_shift(req.get('bar_shift', 0))
    reference = None
    if req.get('reference') is not None:
        from subbeats_reference_preview import validate_reference
        reference = validate_reference(req['reference'])
        if bar_shift:
            raise ValueError('Annotated previews use the saved release point. Reset the bar shift.')
    state = Path(req['state_dir'])
    require_shared_cache(state, req['cache_id'])
    keys = [req['out_key'], req['in_key']]
    if keys[0] == keys[1] or any(not isinstance(k, str) or not fullmatch('[a-f0-9]{64}', k) for k in keys):
        raise ValueError('Choose two different prepared tracks.')
    root = state / 'subbeats'
    if root.is_symlink() or (root / 'v1').is_symlink():
        raise ValueError('Prepared cache must not be a symlink.')
    records, folders = [], []
    for key in keys:
        folder = root / 'v1' / key
        try:
            identity = json.loads((folder / 'manifest.json').read_text())['identity']
        except (OSError, ValueError, KeyError) as error:
            raise ValueError('A prepared bundle is unavailable. Recheck the track.') from error
        record = cached_entry(folder, identity)
        if record is None:
            raise ValueError('A prepared bundle failed integrity checks. Recheck the track.')
        records.append(record); folders.append(folder)
    gains = [float(req.get(name, 0)) for name in ('out_gain_db', 'in_gain_db')]
    if any(not np.isfinite(g) or not -120 <= g <= 40 for g in gains):
        raise ValueError('Invalid preview playback level.')
    fingerprint = json.dumps({'version': VERSION, 'librosa': librosa.__version__, 'keys': keys, 'gains_db': gains, 'bar_shift': bar_shift,
                              'reference': reference, 'manifests': [digest(p / 'manifest.json') for p in folders]}, sort_keys=True)
    key = hashlib.sha256(fingerprint.encode()).hexdigest()
    previews = root / 'previews'
    if previews.is_symlink():
        raise ValueError('Preview cache must not be a symlink.')
    previews.mkdir(exist_ok=True)
    with (previews / '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        dest = previews / key
        if dest.exists():
            record = cached_entry(dest, {'fingerprint': fingerprint})
            if record is None:
                raise ValueError('The saved preview failed integrity checks.')
            return {'ok': True, 'subbeats_preview': str(dest / 'preview.wav'),
            'subbeats_timeline': record['metadata']['timeline']}
        if reference is not None:
            from subbeats_reference_preview import render_reference
            audio, metadata = render_reference(req, folders, records, gains, fetch_source)
        else:
            audio, metadata = render_beat_preview(folders, records, gains, bar_shift)
        stage = Path(tempfile.mkdtemp(prefix='.pending-', dir=previews))
        try:
            sf.write(stage / 'preview.wav', audio.T, STEM_SR, subtype='PCM_16')
            record = {'identity': {'fingerprint': fingerprint}, 'metadata': metadata,
                      'files': {'preview.wav': {'bytes': (stage / 'preview.wav').stat().st_size,
                                                'sha256': digest(stage / 'preview.wav')}}}
            (stage / 'manifest.json').write_text(json.dumps(record, indent=2) + '\n')
            require_shared_cache(state, req['cache_id'])
            trim_previews(previews)
            os.rename(stage, dest)
        finally:
            if stage.exists():
                shutil.rmtree(stage)
    return {'ok': True, 'subbeats_preview': str(dest / 'preview.wav'),
            'subbeats_timeline': record['metadata']['timeline']}
