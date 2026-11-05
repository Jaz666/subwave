#!/usr/bin/env python3
"""Managed Sub/Beats preparation; no station settings, DB or playback writes.

Cue preparation uses a source identity plus fitted passages and narrow coverage.
Classic Librosa preparation remains available to older backend callers/CLI tools.
Output is evidence plus stems, never approval of a pair.
"""
import argparse
import importlib.metadata
import json
import math
from pathlib import Path
import subprocess

from subbeats_cache import DEFAULT_BUDGET, digest, prepare_cached

ANALYSIS_VERSION = 1
SR = 22050
HOP = 256
STEM_SR = 44100
STEMS = ('drums', 'bass', 'other', 'vocals')
# Explicit bounded full-recording jobs, not the normal short analysis defaults.
MAX_SECONDS = 1200


def decode(path, sr, channels):
    import numpy as np
    # Decode from sample zero: seeking some MP3 editions changes alignment.
    raw = subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', str(path), '-t', str(MAX_SECONDS + 1),
        '-f', 'f32le', '-ar', str(sr), '-ac', str(channels), 'pipe:1',
    ], timeout=180)
    audio = np.frombuffer(raw, dtype='<f4').reshape(-1, channels).T.copy()
    if not audio.size or audio.shape[1] > MAX_SECONDS * sr or not np.isfinite(audio).all():
        raise ValueError('requires a finite, complete recording of at most 20 minutes')
    return audio


def timing_regions(librosa, beats, envelope):
    import numpy as np
    regions = []
    for start in range(0, len(beats) - 63, 16):
        frames = beats[start:start + 64]
        times = librosa.frames_to_time(frames, sr=SR, hop_length=HOP)
        period, origin = np.polyfit(np.arange(64), times, 1)
        error = float(np.sqrt(np.mean((times - (origin + period * np.arange(64)))**2)))
        regions.append({'start_seconds': float(times[0]), 'end_seconds': float(times[-1]),
                        'bpm': float(60 / period), 'timing_error_ms': error * 1000,
                        'onset_support': float(np.mean(envelope[frames]))})
    if not regions:
        return regions, []
    floor = np.percentile([r['onset_support'] for r in regions], 40)
    supported = [r for r in regions if r['onset_support'] >= floor and r['onset_support'] > 0
                 and r['timing_error_ms'] < 35]
    return regions, supported


def mixing_windows(analysis):
    """Bounded beat-supported suggestions in original-track seconds, not phrases."""
    windows = []
    duration = analysis['duration_seconds']
    bound = analysis.get('late_percussion_drop_seconds')
    for run in analysis.get('supported_regions', []):
        period = 60 / run['bpm']
        start = run['start_seconds']
        end = start + 64 * period
        if end > duration or end > run['end_seconds'] + period + .1:
            continue
        windows.append({'start_seconds':start, 'end_seconds':end, 'bpm':run['bpm'],
                        'timing_error_ms':run.get('timing_error_ms'),
                        'onset_support':run.get('onset_support'),
                        'lead_seconds':start, 'post_seconds':duration-end})
    windows.sort(key=lambda window:window['start_seconds'])
    outgoing = [window for window in windows if bound is None or window['end_seconds'] <= bound]
    return {'version':1, 'incoming':windows[:8], 'outgoing':outgoing[-8:][::-1]}


def analyze(path, stage, librosa):
    import numpy as np
    from scipy import ndimage
    y = decode(path, SR, 1)[0]
    duration = len(y) / SR
    percussive = librosa.effects.percussive(y, margin=3, hop_length=HOP)
    env = librosa.onset.onset_strength(y=percussive, sr=SR, hop_length=HOP)
    seed = float(librosa.feature.tempo(onset_envelope=env, sr=SR, hop_length=HOP)[0])
    ac = librosa.autocorrelate(env, max_size=int(SR / HOP) + 1)
    peaks = np.flatnonzero(ac == ndimage.maximum_filter1d(ac, 3))
    peaks = [i for i in peaks if i > 0 and 60 <= 60 * SR / HOP / i <= 190]
    hypotheses = [seed, seed * 2, seed / 2] + [
        60 * SR / HOP / i for i in sorted(peaks, key=lambda i: ac[i], reverse=True)[:5]]
    regions, supported, beats = [], [], np.array([], dtype=int)
    for bpm in hypotheses:
        if not 60 <= bpm <= 190:
            continue
        _, beats = librosa.beat.beat_track(onset_envelope=env, sr=SR, hop_length=HOP, bpm=bpm, trim=True)
        regions, supported = timing_regions(librosa, beats, env)
        if supported:
            refined = float(np.median([r['bpm'] for r in supported]))
            _, beats = librosa.beat.beat_track(onset_envelope=env, sr=SR, hop_length=HOP, bpm=refined, trim=True)
            regions, supported = timing_regions(librosa, beats, env)
            break
    times = librosa.frames_to_time(beats, sr=SR, hop_length=HOP)
    rms = librosa.feature.rms(y=percussive, hop_length=HOP)[0]
    frame_seconds = librosa.frames_to_time(np.arange(len(rms)), sr=SR, hop_length=HOP)
    seconds = np.arange(math.ceil(duration))
    buckets = np.array([np.mean(rms[(frame_seconds >= t) & (frame_seconds < t + 1)]) for t in seconds])
    smooth = ndimage.median_filter(buckets, size=5, mode='nearest')
    reference = float(np.percentile(smooth[:max(1, int(duration * .8))], 65))
    low = smooth < reference * .35
    edges = np.diff(np.r_[False, low, False].astype(int))
    drops = [int(a) for a, b in zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1))
             if b - a >= 8 and a > duration * .5 and np.mean(low[a:]) >= .8]
    result = {'version': ANALYSIS_VERSION, 'status': 'measured' if supported else 'unmeasurable',
              'duration_seconds': duration, 'sample_rate': SR, 'hop_length': HOP,
              'coverage': 'full_recording', 'regions': regions, 'supported_regions': supported,
              'late_percussion_drop_seconds': drops[0] if drops else None,
              'pair_ready': False}
    result['mixing_windows'] = mixing_windows(result)
    (stage / 'analysis.json').write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
    np.savez_compressed(stage / 'rhythm.npz', beat_times=times, onset=env,
                        percussion_seconds=buckets)
    return result


def requested_regions(analysis, head_seconds):
    """Outgoing coverage ends on measured evidence, including an early beat loss."""
    supported = analysis['supported_regions']
    if not supported:
        return []
    duration = analysis['duration_seconds']
    bound = analysis['late_percussion_drop_seconds']
    bound = duration if bound is None else min(duration, bound)
    eligible = [r for r in supported if r['end_seconds'] <= bound]
    regions = [('head', 0., min(duration, head_seconds))]
    if eligible:
        last = max(eligible, key=lambda r: r['end_seconds'])
        end = last['end_seconds']
        regions.append(('exit', max(0., end + 2 - 90), min(duration, end + 2)))
    return regions


def write_flac_region(stage, name, parts):
    """Shared storage contract for fresh separation and CPU-only conversion."""
    import numpy as np
    import soundfile as sf
    peak = max(float(np.max(np.abs(part))) for part in parts.values())
    storage_gain = .999 / peak if peak >= 1 else 1.
    reconstructed = np.zeros_like(next(iter(parts.values())), dtype=np.float32)
    for stem, part in parts.items():
        target = stage / f'{name}-{stem}.flac'
        sf.write(target, (part * storage_gain).T, STEM_SR, subtype='PCM_24')
        info = sf.info(target)
        if (info.frames, info.channels, info.samplerate) != (part.shape[1], 2, STEM_SR):
            raise ValueError('written stem coverage mismatch')
        saved, sr = sf.read(target, dtype='float32', always_2d=True)
        if sr != STEM_SR or saved.T.shape != part.shape or not np.isfinite(saved).all():
            raise ValueError('invalid written stem')
        restored = saved.T / storage_gain
        if not np.allclose(restored, part, rtol=1e-6, atol=2**-22 / storage_gain):
            raise ValueError('FLAC conversion changed stem samples beyond PCM tolerance')
        reconstructed += restored
    return storage_gain, reconstructed


def separate_regions(path, stage, regions, detector, *, audio=None):
    import numpy as np
    if audio is None:
        audio = decode(path, STEM_SR, 2)
    coverage = []
    for name, start, end in regions:
        first, stop = round(start * STEM_SR), round(end * STEM_SR)
        # The 22.05 kHz analysis endpoint can round up by one analysis
        # sample relative to the independently decoded 44.1 kHz stems.
        if first < 0 or stop > audio.shape[1] + STEM_SR // SR:
            raise ValueError('requested region is outside decoded source coverage')
        stop = min(stop, audio.shape[1])
        if first >= stop:
            raise ValueError('requested region is outside decoded source coverage')
        left, right = max(0, first - 4 * STEM_SR), min(audio.shape[1], stop + 4 * STEM_SR)
        stems = detector.separate(audio[:, left:right])
        reconstructed = np.zeros((2, stop - first), dtype=np.float32)
        parts = {stem: stems[stem][:, first - left:stop - left] for stem in STEMS}
        for part in parts.values():
            if part.shape != reconstructed.shape or not np.isfinite(part).all():
                raise ValueError('invalid separated stem')
        storage_gain, reconstructed = write_flac_region(stage, name, parts)
        source = audio[:, first:stop]
        error = float(np.sqrt(np.mean((reconstructed - source)**2)) / max(1e-12, np.sqrt(np.mean(source**2))))
        if not math.isfinite(error) or error > .1:
            raise ValueError('separated stems do not reconstruct the source within tolerance')
        coverage.append({'name': name, 'start_sample': first, 'end_sample': stop,
                         'sample_rate': STEM_SR, 'context_start_sample': left,
                         'context_end_sample': right, 'storage_gain': storage_gain,
                         'reconstruction_error_relative': error})
    return coverage


def prepare(path, state_dir, *, head_seconds=68., analysis_only=False, budget=DEFAULT_BUDGET, expected_cache_id=None, cache_root=None, allowance=None):
    import librosa
    if expected_cache_id is not None:
        require_shared_cache(state_dir, expected_cache_id)
    if not math.isfinite(head_seconds) or not 40 <= head_seconds <= 600:
        raise ValueError('head coverage must be 40–600 seconds')
    path = Path(path).resolve(strict=True)
    identity = {'source_sha256': digest(path), 'analysis_version': ANALYSIS_VERSION,
                'librosa': librosa.__version__, 'mode': 'analysis' if analysis_only else 'analysis_and_stems',
                'head_seconds': head_seconds, 'exit_seconds': 90}
    if not analysis_only:
        import analyze_worker as worker
        identity['separator'] = {'model': worker.DEMUCS_MODEL, 'overlap': worker.DEMUCS_OVERLAP,
                                 'shifts': 1, 'context_seconds': 4, 'sample_rate': STEM_SR,
                                 'subtype': 'PCM_24-shared-gain-v1', 'demucs': importlib.metadata.version('demucs'),
                                 'torch': importlib.metadata.version('torch')}

    if not analysis_only:
        # Reuse a verified converted bundle without another separation pass.
        from subbeats_cache import cache_key, cached_entry
        legacy = {**identity, 'separator': {**identity['separator'], 'subtype': 'PCM_24-or-FLOAT-v1'}}
        dest = (Path(cache_root) if cache_root is not None else Path(state_dir) / 'subbeats' / 'v1') / cache_key(legacy)
        previous = cached_entry(dest, legacy)
        if previous and previous['metadata'].get('storage_format') == 'PCM_24-shared-gain-v1':
            return {'cache_hit': True, 'directory': str(dest), **previous}

    def build(stage):
        analysis = analyze(path, stage, librosa)
        coverage = []
        if not analysis_only and analysis['supported_regions']:
            with worker._model_lock:
                detector = worker.get_vocal_detector(force=True)
                if detector is None:
                    raise RuntimeError('Demucs unavailable; no prepared bundle published')
                try:
                    coverage = separate_regions(path, stage, requested_regions(analysis, head_seconds), detector)
                finally:
                    worker._touch_heavy()
        if digest(path) != identity['source_sha256']:
            raise ValueError('source changed during preparation')
        if expected_cache_id is not None:
            require_shared_cache(state_dir, expected_cache_id)
        return {'storage_format': 'PCM_24-shared-gain-v1',
                'analysis_status': analysis['status'], 'stem_regions': coverage,
                'pair_ready': False}

    return prepare_cached(state_dir, identity, build, budget, cache_root=cache_root, allowance=allowance)


def prepare_cue_source(path,state_dir,*,expected_cache_id,cache_root,allowance):
    """Source/decoder/separator identity only; cue coverage owns the new stems."""
    import analyze_worker as worker
    path=Path(path).resolve(strict=True)
    identity=dict(mode='cue-source',version=1,source_sha256=digest(path),
        separator=dict(model=worker.DEMUCS_MODEL,overlap=worker.DEMUCS_OVERLAP,
            shifts=1,context_seconds=4,sample_rate=STEM_SR,subtype='PCM_24-shared-gain-v1',
            demucs=importlib.metadata.version('demucs'),torch=importlib.metadata.version('torch')))
    def build(stage):
        duration=decode(path,SR,1).shape[1]/SR
        (stage/'analysis.json').write_text(json.dumps(dict(version=1,duration_seconds=duration,
            supported_regions=[],coverage='full_recording',pair_ready=False))+'\n')
        if digest(path)!=identity['source_sha256']:
            raise ValueError('Source changed during preparation')
        require_shared_cache(state_dir,expected_cache_id)
        return dict(stem_regions=[],pair_ready=False)
    return prepare_cached(state_dir,identity,build,cache_root=cache_root,allowance=allowance)


def cue_suitability(cues,coverage):
    """Role availability, not legacy kick-window or pair approval."""
    from datetime import datetime,timezone
    roles={}
    for role in ('incoming','outgoing'):
        point=next(iter(cues.get(role,[])),None)
        activity=coverage.get(role)
        roles[role]=dict(level='subbeat' if point and activity else 'regular',
            bpm=point['bpm'] if point else None,cueSeconds=point['sourceSeconds'] if point else None,
            leadSeconds=None,postSeconds=None,
            reason='Estimated phrase grid and saved passage coverage; check pair compatibility.' if point and activity else 'No reliable prepared cue passage for this role.',
            **({'vocalActivity':activity} if activity else {}))
    return dict(version=1,assessedAt=datetime.now(timezone.utc).isoformat(),**roles)


def require_shared_cache(state_dir, expected):
    marker = Path(state_dir) / 'subbeats' / '.cache-id'
    try:
        if isinstance(expected, str) and len(expected) >= 16 and marker.read_text().strip() == expected:
            return
    except OSError:
        pass
    raise ValueError('Sub/Beats cache is not shared with this analyzer')


def prepare_request(req):
    """Shared-volume proof is required for managed jobs, including remote analyzers."""
    state_dir = Path(req['state_dir'])
    expected = req.get('cache_id')
    require_shared_cache(state_dir, expected)
    if req.get('complete') is not True:
        raise ValueError('Sub/Beats requires the complete recording')
    from subbeats_cache import shared_context, track_cache_root
    allowance = shared_context(req)
    cache_root = track_cache_root(req['stems_root'], req['track_id'])
    method = req.get('method','classic')
    if method not in ('classic','small0','final0'):
        raise ValueError('Unknown preparation method')
    upgrading = req.get('bundle_key') is not None
    if upgrading:
        if method == 'classic':
            raise ValueError('Coverage upgrades require a saved cue-point method')
        from subbeats_cache import bundle_folder, cached_entry
        from subbeats_cues import load_cues, ALGORITHM_VERSION
        import re
        if not isinstance(req['bundle_key'],str) or not re.fullmatch('[a-f0-9]{64}',req['bundle_key']):
            raise ValueError('Invalid saved bundle key')
        folder = bundle_folder(state_dir,req['bundle_key'],req['stems_root'],req['track_id'])
        identity = json.loads((folder/'manifest.json').read_text())['identity']
        record = cached_entry(folder,identity)
        if record is None:
            raise ValueError('Saved stems failed integrity checks. Recheck this track.')
        saved = load_cues(state_dir,req['stems_root'],req['track_id'],req['cue_key'],folder)
        result = dict(directory=str(folder),cache_hit=True,**record)
        if saved.get('algorithmVersion') not in (5,6,ALGORITHM_VERSION):
            raise ValueError('Rescan this track with Beat This! to replace the older cue analysis.')
        cue_points = dict(version=saved['version'],algorithmVersion=saved.get('algorithmVersion',ALGORITHM_VERSION),
            model=saved['model'],artifactKey=req['cue_key'],durationSeconds=saved['durationSeconds'],incoming=saved['incoming'],outgoing=saved['outgoing'],grid=saved.get('grid'),ending=saved.get('ending'))
    elif method != 'classic':
        result = prepare_cue_source(req['path'],state_dir,expected_cache_id=expected,cache_root=cache_root,allowance=allowance)
    else:
        result = prepare(req['path'], state_dir, expected_cache_id=expected, cache_root=cache_root, allowance=allowance)
    from subbeats_structure import prepare_structure
    structure = None if upgrading or method != 'classic' else prepare_structure(req['path'], state_dir, result['directory'], expected_cache_id=expected, cache_root=cache_root, allowance=allowance)
    from subbeats_suitability import assess_bundle
    suitability = assess_bundle(Path(result['directory']),result) if method == 'classic' else None
    cues = {}
    coverage_used_models = False
    if method != 'classic':
        from subbeats_cues import prepare_cues
        cues['cuePoints'] = cue_points if upgrading else prepare_cues(req['path'],state_dir,result['directory'],result,method,
            cache_root=cache_root,allowance=allowance,expected_cache_id=expected)
        from subbeats_coverage import prepare_coverage
        cues['cueCoverage'],coverage_used_models = prepare_coverage(req['path'],state_dir,result['directory'],result,cues['cuePoints'],
            cache_root=cache_root,allowance=allowance,expected_cache_id=expected)
    if method != 'classic':
        suitability = cue_suitability(cues['cuePoints'],cues['cueCoverage'])
    return {'cache_added_bytes': req['remaining_bytes'] - allowance['bytes'], 'ok': True, 'subbeats_used_models': coverage_used_models or (method != 'classic' and not upgrading) or (not result.get('cache_hit', False) and bool(result['metadata']['stem_regions'])), 'subbeats_result': {
        'status': ('prepared' if result['metadata']['stem_regions'] or (cues and (cues['cuePoints']['incoming'] or cues['cuePoints']['outgoing'])) else 'unmeasurable'),
        'bundleKey': Path(result['directory']).name, 'suitability':suitability, **cues,
        'error': None,
    }, 'subbeats_structure_key': Path(structure['directory']).name if structure else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', type=Path)
    parser.add_argument('--state-dir', required=True, type=Path)
    parser.add_argument('--head-seconds', type=float, default=68.)
    parser.add_argument('--analysis-only', action='store_true')
    args = parser.parse_args()
    try:
        result = prepare(args.path, args.state_dir, head_seconds=args.head_seconds, analysis_only=args.analysis_only)
        print(json.dumps(result, indent=2, allow_nan=False))
    except Exception as error:
        parser.exit(1, f'Sub/Beats preparation failed: {error}\n')


if __name__ == '__main__':
    main()
