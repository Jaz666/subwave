"""CPU-only structural landmarks, independent of expensive prepared stem bundles.

These are candidate changes, not verified downbeats, musical resolutions or safe
loop seams. Retain multiple positions across the complete recording for audition.
"""
import argparse
import json
from pathlib import Path

from subbeats_cache import DEFAULT_BUDGET, cached_entry, digest, prepare_cached

VERSION = 2
SR = 11025
HOP = 256


def landmarks(times, energy, spectrum, chroma, supported):
    """Compare context on both sides of every measured beat, at several scales."""
    import numpy as np
    times = np.asarray(times, dtype=float)
    energy, spectrum, chroma = [np.asarray(a, dtype=float) for a in (energy, spectrum, chroma)]
    n = len(times)
    if (times.ndim != 1 or not np.isfinite(times).all() or np.any(times < 0)
            or np.any(np.diff(times) <= 0) or any(a.ndim != 2 or a.shape[1] != n
            or not np.isfinite(a).all() for a in (energy, spectrum, chroma))
            or energy.shape[0] != 4):
        raise ValueError('Invalid beat-synchronous structure features')
    if n < 9:
        return []
    # Log-band levels preserve level changes; normalized spectra/chroma also
    # reveal a new part when a mastered track barely changes overall loudness.
    def contexts(a, i, width):
        return a[:, i-width:i].mean(axis=1), a[:, i:i+width].mean(axis=1)
    evidence = []
    for i in range(4, n - 3):
        changes = []
        for width in (4, 16, 32):
            if i < width or i + width > n:
                continue
            before, after = contexts(energy, i, width)
            spec_a, spec_b = contexts(spectrum, i, width)
            harm_a, harm_b = contexts(chroma, i, width)
            delta = after - before
            tonal = float(np.linalg.norm(harm_b / max(1e-8, np.linalg.norm(harm_b))
                                         - harm_a / max(1e-8, np.linalg.norm(harm_a))))
            timbre = float(np.sum(np.abs(spec_b - spec_a)))
            level = float(np.max(np.abs(delta)))
            # Fixed evidence floors avoid inventing landmarks in an unchanging
            # track just because a percentile threshold must select something.
            strength = max(level / 6, timbre / .35, tonal / .5)
            changes.append((strength, width, delta, timbre, tonal))
        best = max(changes, key=lambda c: c[0])
        strength, width, delta, timbre, tonal = best
        if strength < 1 or max(energy[0, i-4:i+4]) < -65:
            continue
        reasons = []
        if delta[0] >= 3: reasons.append('energy_arrival')
        if delta[0] <= -3: reasons.append('energy_release')
        if delta[1] >= 4: reasons.append('bass_arrival')
        if delta[1] <= -4: reasons.append('bass_release')
        if timbre >= .35: reasons.append('texture_change')
        if tonal >= .5: reasons.append('harmonic_change')
        if not reasons: reasons.append('band_energy_change')
        evidence.append({'beat_index': i, 'at_seconds': float(times[i]),
                         'strength': float(strength), 'context_beats': width,
                         'evidence': reasons, 'energy_change_db': float(delta[0]),
                         'bass_change_db': float(delta[1]), 'texture_change': timbre,
                         'harmonic_change': tonal})
    # Compare strongest changes first, suppressing nearby versions of the same
    # boundary only. No intro/outro restriction or fixed 16-bar spacing.
    scores = np.zeros(n)
    for item in evidence:
        scores[item['beat_index']] = item['strength']
    peaks = [e for e in evidence if e['strength'] >= max(scores[e['beat_index']-1:e['beat_index']+2])]
    selected = []
    for item in sorted(peaks, key=lambda e: e['strength'], reverse=True):
        if all(abs(item['beat_index'] - previous['beat_index']) > 2 for previous in selected):
            selected.append(item)
    selected.sort(key=lambda e: e['beat_index'])
    for item in selected:
        i = item['beat_index']
        nearby = [e for e in selected if abs(e['beat_index'] - i) <= 128]
        votes = np.zeros(4)
        for other in nearby:
            votes[other['beat_index'] % 4] += min(4., other['strength'])
        phase = int(np.argmax(votes))
        support = float(votes[i % 4] / max(1e-8, votes.sum()))
        grid = any(r['start_seconds'] <= item['at_seconds'] <= r['end_seconds'] for r in supported)
        item.update({'beat_supported': grid, 'local_bar_phase': phase,
                     'bar_phase_support': support,
                     'confidence': 'medium' if grid and len(item['evidence']) >= 2 and support >= .4 else 'low',
                     'beats_before': i, 'beats_after': n - i - 1,
                     'phrase_verified': False, 'mix_ready': False})
    return selected


def extract(y, times, librosa):
    """Compact full-recording features; no quadratic self-similarity matrix."""
    import numpy as np
    power = np.abs(librosa.stft(y, n_fft=1024, hop_length=HOP)) ** 2
    frequencies = librosa.fft_frequencies(sr=SR, n_fft=1024)
    bands = np.stack([power[(frequencies >= lo) & (frequencies < hi)].sum(axis=0)
                      for lo, hi in ((0, SR / 2 + 1), (30, 250), (250, 2000), (2000, SR / 2 + 1))])
    mel = librosa.feature.melspectrogram(S=power, sr=SR, n_fft=1024, n_mels=32)
    chroma = librosa.feature.chroma_stft(S=power, sr=SR, n_fft=1024, hop_length=HOP, tuning=0)
    del power
    # Each column describes the interval beginning at its measured beat.
    edges = np.clip(np.rint(np.r_[times, len(y) / SR] * SR / HOP).astype(int), 0, bands.shape[1])
    def sync(a):
        sums = np.pad(np.cumsum(a, axis=1, dtype=np.float64), ((0, 0), (1, 0)))
        return (sums[:, edges[1:]] - sums[:, edges[:-1]]) / np.maximum(1, np.diff(edges))
    energy = 10 * np.log10(np.maximum(sync(bands), 1e-12))
    # STFT power has an FFT-dependent scale: calibrate total energy to input RMS.
    rms_db = 10 * np.log10(max(float(np.mean(y**2)), 1e-12))
    energy += rms_db - 10 * np.log10(max(float(np.mean(bands[0])), 1e-12))
    spectrum = sync(mel)
    spectrum /= np.maximum(1e-12, spectrum.sum(axis=0, keepdims=True))
    harmonic = sync(chroma)
    harmonic /= np.maximum(1e-12, np.linalg.norm(harmonic, axis=0, keepdims=True))
    return energy, spectrum, harmonic


def prepare_structure(path, state_dir, bundle_dir, *, budget=DEFAULT_BUDGET, expected_cache_id=None):
    import numpy as np
    import librosa
    from subbeats_prepare import decode, require_shared_cache
    path, bundle_dir = Path(path), Path(bundle_dir)
    if expected_cache_id is not None:
        require_shared_cache(state_dir, expected_cache_id)
    identity = json.loads((bundle_dir / 'manifest.json').read_text())['identity']
    record = cached_entry(bundle_dir, identity)
    if record is None:
        raise ValueError('Prepared rhythm bundle failed integrity checks')
    if digest(path) != identity['source_sha256']:
        raise ValueError('Structure source does not match prepared recording')
    structure_identity = {'source_sha256': identity['source_sha256'], 'mode': 'structure',
                          'structure_version': VERSION, 'librosa': librosa.__version__,
                          'rhythm_sha256': digest(bundle_dir / 'rhythm.npz')}
    def build(stage):
        analysis = json.loads((bundle_dir / 'analysis.json').read_text())
        with np.load(bundle_dir / 'rhythm.npz', allow_pickle=False) as rhythm:
            times = rhythm['beat_times']
        if (times.ndim != 1 or not np.isfinite(times).all() or np.any(times < 0)
                or np.any(np.diff(times) <= 0) or np.any(times >= analysis['duration_seconds'])):
            raise ValueError('Invalid prepared beat times')
        y = decode(path, SR, 1)[0]
        duration = len(y) / SR
        if abs(duration - analysis['duration_seconds']) > .1:
            raise ValueError('Structure source coverage differs from prepared recording')
        if len(times) >= 9:
            energy, spectrum, chroma = extract(y, times, librosa)
            candidates = landmarks(times, energy, spectrum, chroma, analysis['supported_regions'])
            np.savez_compressed(stage / 'structure-features.npz', beat_times=times,
                                energy_db=energy.astype('float32'), spectrum=spectrum.astype('float32'),
                                chroma=chroma.astype('float32'))
        else:
            candidates = []
        result = {'version': VERSION, 'coverage': 'full_recording', 'duration_seconds': duration,
                  'status': 'candidates' if candidates else 'no_clear_landmarks',
                  'candidates': candidates, 'phrase_verified': False, 'pair_ready': False}
        (stage / 'structure.json').write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
        if digest(path) != identity['source_sha256']:
            raise ValueError('Structure source changed during analysis')
        if expected_cache_id is not None:
            require_shared_cache(state_dir, expected_cache_id)
        return {'structure_status': result['status'], 'candidate_count': len(candidates),
                'coverage': 'full_recording', 'pair_ready': False}
    return prepare_cached(state_dir, structure_identity, build, budget)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', type=Path)
    parser.add_argument('--state-dir', type=Path, required=True)
    parser.add_argument('--bundle-dir', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(prepare_structure(args.path, args.state_dir, args.bundle_dir), indent=2))
