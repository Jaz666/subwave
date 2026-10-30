"""Experimental cache-only 16-bar audition. CPU only; no station playback hooks."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile

from subbeats_cache import cached_entry, digest, tree_bytes
from subbeats_prepare import STEMS, STEM_SR, require_shared_cache

VERSION = 6
PREVIEW_BUDGET = 200 * 1024**2


def fit_grid(peaks, bpm, duration, outgoing=False, *, beats=64, phrase_origin=None, reference_period=None, source_start=0):
    import numpy as np
    period = 60 / bpm
    candidates = peaks[(peaks >= (4 if outgoing and phrase_origin is None else 0)) & (peaks + beats * period <= duration)]
    if phrase_origin is not None:
        counts = np.rint((candidates + source_start - phrase_origin) / reference_period).astype(int)
        candidates = candidates[(counts % 16 == 0) & (np.abs(candidates + source_start - phrase_origin - counts * reference_period) <= .25 * period)]
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


def kick_grid(drums, bpm, outgoing=False, **grid):
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
    return fit_grid(peaks * hop / STEM_SR, bpm, len(mono) / STEM_SR, outgoing, **grid)


def load_region(folder, record, name):
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
        frames = min(expected, 90 * STEM_SR)
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


def preserve_cue_phase(source_cue, rate, detected_cue, period):
    """Refine sub-beat timing without renumbering an already measured opening."""
    expected = source_cue / rate
    offset_beats = round((detected_cue - expected) / period)
    refined = detected_cue - offset_beats * period
    if abs(refined - expected) > .15 * period or refined < -.05 * period:
        raise ValueError('Tempo matching did not preserve the incoming beat phase. Try another pair.')
    return max(0., refined)


def load_structure(root, folder, record, librosa_version):
    from subbeats_cache import cache_key
    from subbeats_structure import VERSION as structure_version
    identity = {'source_sha256': record['identity']['source_sha256'], 'mode': 'structure',
                'structure_version': structure_version, 'librosa': librosa_version,
                'rhythm_sha256': digest(folder / 'rhythm.npz')}
    dest = root / 'v1' / cache_key(identity)
    if not dest.exists():
        return None, None
    if cached_entry(dest, identity) is None:
        raise ValueError('The structure map failed integrity checks. Recheck the track.')
    return json.loads((dest / 'structure.json').read_text()), digest(dest / 'manifest.json')


def render_preview(req):
    import numpy as np
    import librosa
    import soundfile as sf
    from re import fullmatch
    bar_shift = validate_bar_shift(req.get('bar_shift', 0))
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
    structure, structure_hash = load_structure(root, folders[1], records[1], librosa.__version__)
    fingerprint = json.dumps({'structure': structure_hash, 'version': VERSION, 'librosa': librosa.__version__, 'keys': keys, 'gains_db': gains, 'bar_shift': bar_shift,
                              'manifests': [digest(p / 'manifest.json') for p in folders]}, sort_keys=True)
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
        if tree_bytes(previews) >= PREVIEW_BUDGET:
            raise ValueError('The preview cache is full (200 MB).')
        out_parts, out_bpm = load_region(folders[0], records[0], 'exit')
        in_parts, in_bpm = load_region(folders[1], records[1], 'head')
        phrase_bars = None
        if structure is not None:
            # Source-zero head grid supplies an explicit, inferred phrase origin.
            head, head_bpm = load_region(folders[0], records[0], 'head')
            head_cue, head_period = kick_grid(head['drums'], head_bpm)
            del head
            if head_cue >= head_period:
                raise ValueError('The outgoing opening does not establish phrase phase. Try another pair.')
            region = next(r for r in records[0]['metadata']['stem_regions'] if r['name'] == 'exit')
            for bars in (16, 8, 4):
                try:
                    out_cue, period = kick_grid(out_parts['drums'], out_bpm, True, beats=bars * 4,
                        phrase_origin=head_cue, reference_period=head_period,
                        source_start=region['start_sample'] / STEM_SR)
                    phrase_bars = bars
                    break
                except ValueError:
                    continue
            if phrase_bars is None:
                raise ValueError('No complete phrase-aligned exit fits the prepared audio. Try another pair.')
        else:
            out_cue, period = kick_grid(out_parts['drums'], out_bpm, True)
        if phrase_bars:
            for bars in (b for b in (16, 8, 4) if b <= phrase_bars):
                try:
                    in_cue, in_period = kick_grid(in_parts['drums'], in_bpm, beats=bars * 4)
                    phrase_bars = bars
                    break
                except ValueError:
                    if bars == 4:
                        raise
        else:
            in_cue, in_period = kick_grid(in_parts['drums'], in_bpm)
        rate = in_period / period
        if abs(rate - 1) > .08:
            raise ValueError('These tempos are too far apart for this preview. Try another pair.')
        if abs(rate - 1) > .0001:
            in_parts = {name: librosa.effects.time_stretch(part, rate=rate) for name, part in in_parts.items()}
            detected_cue, _ = kick_grid(in_parts['drums'], 60 / period, beats=(phrase_bars or 16) * 4)
            in_cue = preserve_cue_phase(in_cue, rate, detected_cue, period)
        out_parts = {name: part * 10**(gains[0] / 20) for name, part in out_parts.items()}
        in_parts = {name: part * 10**(gains[1] / 20) for name, part in in_parts.items()}
        plan = None
        if phrase_bars:
            from subbeats_phrases import plan_phrase, mix_phrase, phrase_timeline
            candidates = [{**c, 'at_seconds': c['at_seconds'] / rate} for c in structure['candidates']]
            plan = plan_phrase(in_cue, period, in_parts['drums'].shape[1] / STEM_SR,
                               out_parts['drums'].shape[1] / STEM_SR, out_cue, candidates,
                               bar_shift=bar_shift, allowed_bars=tuple(b for b in (16, 8, 4) if b <= phrase_bars))
            phrase_bars = plan['bars']
            plan['incoming_reference_source_seconds'] = plan['incoming_reference'] * rate
            plan['outgoing_source_start_seconds'] = region['start_sample'] / STEM_SR + out_cue
            audio, intro_vocals = mix_phrase(out_parts, in_parts, plan, STEM_SR)
            timeline = phrase_timeline(plan, intro_vocals)
            timeline['duration'] = audio.shape[1] / STEM_SR
        else:
            audio = mix_preview(out_parts, in_parts, out_cue, in_cue, period, bar_shift)
            prefix = in_parts['vocals'][:, :round(in_cue * STEM_SR)]
            intro_vocals = bool(prefix.size and np.sqrt(np.mean(prefix**2)) > 1e-3)
            timeline = preview_timeline(in_cue, period, intro_vocals, audio.shape[1] / STEM_SR, bar_shift)
            timeline['events'][0]['label'] += '; phrase map unavailable, beat matching only'
        stage = Path(tempfile.mkdtemp(prefix='.pending-', dir=previews))
        try:
            sf.write(stage / 'preview.wav', audio.T, STEM_SR, subtype='PCM_16')
            metadata = {'timeline': timeline, 'phrase_plan': plan,
                        'bars': phrase_bars or 16, 'bar_shift': bar_shift, 'bpm': 60 / period, 'incoming_rate': rate,
                        'experimental': True, 'native_tempo_return': False, 'phrase_verified': False}
            record = {'identity': {'fingerprint': fingerprint}, 'metadata': metadata,
                      'files': {'preview.wav': {'bytes': (stage / 'preview.wav').stat().st_size,
                                                'sha256': digest(stage / 'preview.wav')}}}
            (stage / 'manifest.json').write_text(json.dumps(record, indent=2) + '\n')
            require_shared_cache(state, req['cache_id'])
            if tree_bytes(previews) > PREVIEW_BUDGET:
                raise ValueError('The preview cache is full (200 MB).')
            os.rename(stage, dest)
        finally:
            if stage.exists():
                shutil.rmtree(stage)
    return {'ok': True, 'subbeats_preview': str(dest / 'preview.wav'),
            'subbeats_timeline': record['metadata']['timeline']}
