#!/usr/bin/env python3
"""Explicit local Sub/Beats preparation; no station settings, DB or playback writes.

Uses Librosa for full-recording rhythm evidence and the normal worker's Demucs
separator for requested regions. This development entrypoint precedes worker/API
queue integration. Output is evidence plus stems, never approval of a pair.
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
        regions.append(('exit', max(0., end - 64 * 60 / last['bpm'] - 8), min(duration, end + 2)))
    return regions


def separate_regions(path, stage, regions, detector):
    import numpy as np
    import soundfile as sf
    audio = decode(path, STEM_SR, 2)
    coverage = []
    for name, start, end in regions:
        first, stop = round(start * STEM_SR), round(end * STEM_SR)
        if stop > audio.shape[1] or first >= stop:
            raise ValueError('requested region is outside decoded source coverage')
        left, right = max(0, first - 4 * STEM_SR), min(audio.shape[1], stop + 4 * STEM_SR)
        stems = detector.separate(audio[:, left:right])
        reconstructed = np.zeros((2, stop - first), dtype=np.float32)
        for stem in STEMS:
            part = stems[stem][:, first - left:stop - left]
            if part.shape != reconstructed.shape or not np.isfinite(part).all():
                raise ValueError('invalid separated stem')
            # Separation can exceed full scale while stems cancel in the sum.
            # Float WAV preserves those samples without clipping or rescaling.
            floating = np.max(np.abs(part)) >= 1
            target = stage / f'{name}-{stem}.{"wav" if floating else "flac"}'
            sf.write(target, part.T, STEM_SR, subtype='FLOAT' if floating else 'PCM_24')
            info = sf.info(target)
            if (info.frames, info.channels, info.samplerate) != (stop - first, 2, STEM_SR):
                raise ValueError('written stem coverage mismatch')
            saved, sr = sf.read(target, dtype='float32', always_2d=True)
            if sr != STEM_SR or saved.T.shape != part.shape or not np.isfinite(saved).all():
                raise ValueError('invalid written stem')
            reconstructed += saved.T
        source = audio[:, first:stop]
        error = float(np.sqrt(np.mean((reconstructed - source)**2)) / max(1e-12, np.sqrt(np.mean(source**2))))
        if not math.isfinite(error) or error > .1:
            raise ValueError('separated stems do not reconstruct the source within tolerance')
        coverage.append({'name': name, 'start_sample': first, 'end_sample': stop,
                         'sample_rate': STEM_SR, 'context_start_sample': left,
                         'context_end_sample': right, 'reconstruction_error_relative': error})
    return coverage


def prepare(path, state_dir, *, head_seconds=68., analysis_only=False, budget=DEFAULT_BUDGET, expected_cache_id=None):
    import librosa
    if expected_cache_id is not None:
        require_shared_cache(state_dir, expected_cache_id)
    if not math.isfinite(head_seconds) or not 40 <= head_seconds <= 600:
        raise ValueError('head coverage must be 40–600 seconds')
    path = Path(path).resolve(strict=True)
    identity = {'source_sha256': digest(path), 'analysis_version': ANALYSIS_VERSION,
                'librosa': librosa.__version__, 'mode': 'analysis' if analysis_only else 'analysis_and_stems',
                'head_seconds': head_seconds}
    if not analysis_only:
        import analyze_worker as worker
        identity['separator'] = {'model': worker.DEMUCS_MODEL, 'overlap': worker.DEMUCS_OVERLAP,
                                 'shifts': 1, 'context_seconds': 4, 'sample_rate': STEM_SR,
                                 'subtype': 'PCM_24-or-FLOAT-v1', 'demucs': importlib.metadata.version('demucs'),
                                 'torch': importlib.metadata.version('torch')}

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
        return {'analysis_status': analysis['status'], 'stem_regions': coverage,
                'pair_ready': False}

    return prepare_cached(state_dir, identity, build, budget)


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
    result = prepare(req['path'], state_dir, expected_cache_id=expected)
    return {'ok': True, 'subbeats_used_models': not result.get('cache_hit', False) and bool(result['metadata']['stem_regions']), 'subbeats_result': {
        'status': ('prepared' if result['metadata']['stem_regions'] else 'unmeasurable'),
        'bundleKey': Path(result['directory']).name,
        'error': None,
    }}


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
