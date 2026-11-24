"""Model-free Sub/Beats V2 cue checks on complete shared Beat This grids."""
from pathlib import Path
from bisect import bisect_left
import re
from tempfile import TemporaryDirectory

from subbeats_cache import digest
from subbeats_prepare import SR, decode


def _validate_grid(grid, source_sha256, source_bytes, duration):
    if (not isinstance(grid, dict) or grid.get('backend') != 'beat-this-onnx'
            or grid.get('model') != 'small0' or grid.get('preprocessingVersion') != 1
            or not re.fullmatch(r'[a-f0-9]{64}', str(grid.get('modelSha256', '')))
            or grid.get('sourceSha256') != source_sha256 or grid.get('sourceBytes') != source_bytes):
        raise ValueError('V2 requires complete source-matching Beat This small0 grid evidence')
    start, end = grid.get('windowStartSeconds'), grid.get('windowEndSeconds')
    beats, bars = grid.get('beatsSeconds'), grid.get('downbeatsSeconds')
    if (not isinstance(start, (int, float)) or not isinstance(end, (int, float))
            or start < 0 or end <= start or end > duration + .1
            or not isinstance(beats, list) or not isinstance(bars, list)
            or len(beats) < 64 or len(bars) < 8):
        raise ValueError('V2 grid coverage is too short or outside the complete recording')
    for values in (beats, bars):
        if any(not isinstance(at, (int, float)) or not start <= at <= min(end, duration) for at in values):
            raise ValueError('V2 grid contains a timestamp outside its measured window')
        if any(right <= left for left, right in zip(values, values[1:])):
            raise ValueError('V2 grid timestamps must increase')
    if start > .05 or end < duration - .1:
        raise ValueError('V2 requires a grid covering the complete recording')
    for bar in bars:
        index = bisect_left(beats, bar)
        nearest = min(abs(beats[candidate] - bar) for candidate in (index - 1, index) if 0 <= candidate < len(beats))
        if nearest > .02:
            raise ValueError('V2 downbeats must belong to the measured beat grid')
    return start, end, beats, bars


def prepare_request(req):
    if req.get('complete') is not True:
        raise ValueError('V2 preparation requires the complete recording')
    path = Path(req['path']).resolve(strict=True)
    source_bytes = req.get('source_bytes')
    source_sha256 = req.get('source_sha256')
    if (not isinstance(source_bytes, int) or source_bytes < 1
            or not isinstance(source_sha256, str) or len(source_sha256) != 64
            or path.stat().st_size != source_bytes or digest(path) != source_sha256):
        raise ValueError('V2 source identity is incomplete or has changed')
    audio = decode(path, SR, 1)[0]
    duration = len(audio) / SR
    if duration <= 0 or duration > 1200:
        raise ValueError('V2 requires a complete recording of at most 20 minutes')
    from beat_this_grid import PREPROCESSING_VERSION
    from subbeats_cues import fitted_passages, natural_finish_grid_cues, predict
    from subbeats_models import MODELS
    grid = req.get('grid')
    if grid is None:
        import numpy as np
        beats, bars = predict(audio, SR, 'small0')
        grid = dict(version=1, backend='beat-this-onnx', model='small0',
                    preprocessingVersion=PREPROCESSING_VERSION, modelSha256=MODELS['small0'],
                    sourceSha256=source_sha256, sourceBytes=source_bytes,
                    windowStartSeconds=0., windowEndSeconds=duration,
                    beatsSeconds=np.asarray(beats, dtype=float).tolist(),
                    downbeatsSeconds=np.asarray(bars, dtype=float).tolist())
    try:
        start, end, beats, bars = _validate_grid(grid, source_sha256, source_bytes, duration)
        result = fitted_passages(audio, SR, beats, bars)
    except Exception as error:
        error_reason = str(error)[:1000]
        grid = None
        result = None
    roles = {}
    for role in ('incoming', 'outgoing'):
        if grid is None or result is None:
            roles[role] = dict(status='failed', reason=error_reason,
                               cuePoints=[], coverageStartSeconds=None, coverageEndSeconds=None)
            continue
        try:
            candidates = result.get(role, [])
            if role == 'incoming':
                candidates = [point for point in candidates if start <= point['sourceSeconds'] < end
                    and (point.get('phraseStartSeconds') is None or point['phraseStartSeconds'] >= start)]
                if not candidates:
                    candidates = _incoming_grid_fallback(path, beats, bars, duration)
            else:
                candidates = [point for point in candidates if duration * .5 <= point['sourceSeconds'] < end
                    and point.get('phraseEndSeconds') is not None
                    and point['sourceSeconds'] >= start
                    and point['sourceSeconds'] < point['phraseEndSeconds'] <= end + .1
                    and 0 <= duration - point['phraseEndSeconds'] <= 16.1]
                if not any(point['phraseEndSeconds'] == duration for point in candidates):
                    terminal, _ = natural_finish_grid_cues(audio, SR, beats, bars, result.get('grid'))
                    terminal = [point for point in terminal if duration * .5 <= point['sourceSeconds'] < end
                        and point['sourceSeconds'] < point['phraseEndSeconds'] <= end + .1
                        and point['phraseEndSeconds'] == duration]
                    candidates.extend(point for point in terminal
                        if all(abs(point['sourceSeconds'] - candidate['sourceSeconds']) > 1.
                               for candidate in candidates))
            candidates = candidates[:8]
            roles[role] = dict(
                status='cue-ready' if candidates else 'no-cue',
                reason=None if candidates else ('No supported incoming passage in the measured opening.'
                    if role == 'incoming' else 'No supported phrase reaches the measured recording ending.'),
                cuePoints=candidates,
                coverageStartSeconds=start,
                coverageEndSeconds=end,
            )
        except Exception as error:
            roles[role] = dict(status='failed', reason=str(error)[:1000], cuePoints=[],
                coverageStartSeconds=None, coverageEndSeconds=None)
    if path.stat().st_size != source_bytes or digest(path) != source_sha256:
        raise ValueError('V2 source changed during preparation')
    return dict(ok=True, subbeats_prep_v2_result=dict(
        source=dict(sha256=source_sha256, bytes=source_bytes, durationSeconds=duration),
        grid=grid,
        roles=roles,
    ))


def _incoming_grid_fallback(path, beats, bars, duration):
    """Use independent rhythm support while keeping every cue on Beat This."""
    import librosa
    import numpy as np
    from subbeats_cues import (backprojected_natural_start_incoming, independent_phase_fit,
        opening_grid_incoming, stable_beat_windows, supported_grid_matches)
    from subbeats_prepare import analyze

    windows, _ = stable_beat_windows(beats, bars)
    if not windows:
        return []
    preferred_bpm = float(np.median([window['bpm'] for window in windows[:8]]))
    with TemporaryDirectory(prefix='subbeats-v2-grid-') as work:
        evidence = analyze(path, Path(work), librosa, preferred_bpm=preferred_bpm)
        matches = supported_grid_matches(windows, evidence['supported_regions'], beats)
        if not matches:
            return []
        selected = matches[0]
        with np.load(Path(work) / 'rhythm.npz') as rhythm:
            independent_beats = rhythm['beat_times'].copy()
        phase = independent_phase_fit(selected, beats, independent_beats)
        candidates = opening_grid_incoming(beats, bars, evidence['supported_regions'], duration)
        if candidates is None:
            candidates = backprojected_natural_start_incoming(beats, bars, evidence['supported_regions'], duration)
        if not candidates:
            return []
        for candidate in candidates:
            candidate['timingValidated'] = phase['validated'] and candidate.get('timingValidated', True)
        return candidates
