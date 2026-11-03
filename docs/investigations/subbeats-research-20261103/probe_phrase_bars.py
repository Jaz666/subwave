"""Offline arrangement/repetition descriptors on two listening-accepted openings.

Uses existing Sub/Beats feature extraction; no CBM code, forced segmentation,
model inference, cache publication, or production state access.
Run in the isolated phrase-venv with the research output directory as argument.
"""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import subprocess
import sys

import librosa
import numpy as np

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / 'controller/scripts'))
from subbeats_structure import SR, extract, landmarks


def block_distance(a, b):
    """Mean L1 spectral difference, preserving each beat's place in the block."""
    assert a.shape == b.shape and a.size
    return float(np.abs(a - b).sum(axis=-1).mean())


def bar_evidence(energy, spectrum, chroma):
    """All bar boundaries; no thresholds that force a desired phrase count."""
    rows = []
    for i in range(1, len(energy)):
        changes = []
        for width in (1, 2, 4):
            if i < width or i + width > len(energy):
                continue
            before, after = energy[i-width:i].mean(axis=0), energy[i:i+width].mean(axis=0)
            spectral = block_distance(spectrum[i-width:i].mean(axis=0), spectrum[i:i+width].mean(axis=0))
            ca, cb = chroma[i-width:i].mean(axis=(0, 1)), chroma[i:i+width].mean(axis=(0, 1))
            ca = ca / max(1e-12, np.linalg.norm(ca))
            cb = cb / max(1e-12, np.linalg.norm(cb))
            harmonic = float(np.linalg.norm(ca - cb))
            delta = after - before
            changes.append(dict(contextBars=width, energyChangeDb=float(delta[0]), bassChangeDb=float(delta[1]),
                                textureDistance=spectral, harmonicDistance=harmonic,
                                strength=max(float(np.max(np.abs(delta))) / 6, spectral / .35, harmonic / .5)))
        repetition = []
        for length in (1, 2, 4, 8):
            if i < 2 * length:
                continue
            previous = spectrum[i-2*length:i-length]
            current = spectrum[i-length:i]
            item = dict(blockBars=length, precedingRepeatDistance=block_distance(previous, current),
                        precedingHarmonicDistance=float(np.linalg.norm(chroma[i-2*length:i-length] - chroma[i-length:i], axis=-1).mean()),
                        precedingEnergyDifferenceDb=float(np.abs(energy[i-2*length:i-length] - energy[i-length:i]).mean()))
            if i + length <= len(spectrum):
                item['followingRepeatDistance'] = block_distance(current, spectrum[i:i+length])
                item['spectralRepeatBreakDistance'] = item['followingRepeatDistance'] - item['precedingRepeatDistance']
                item['followingHarmonicDistance'] = float(np.linalg.norm(chroma[i-length:i] - chroma[i:i+length], axis=-1).mean())
            repetition.append(item)
        rows.append(dict(barBoundaryIndex=i, changes=changes, repetition=repetition,
                         repeatBreak=max((r['spectralRepeatBreakDistance'] for r in repetition if 'spectralRepeatBreakDistance' in r), default=0),
                         strength=max((c['strength'] for c in changes), default=0)))
    return rows


def check_descriptors():
    # Constant material must not create novelty; repeating patterns must retain
    # ordering, and a new texture must produce a larger distance than repetition.
    a = np.zeros((12, 4, 3)); a[:, :, 0] = 1
    e = np.zeros((12, 4)); c = np.ones((12, 4, 12))
    assert all(r['strength'] < 1e-10 for r in bar_evidence(e, a, c))
    pattern = a[:4].copy(); pattern[1::2, :, :] = [0, 1, 0]
    assert block_distance(pattern, pattern.copy()) == 0
    assert block_distance(pattern, pattern[::-1]) > 0
    changed = a.copy(); changed[6:, :, :] = [0, 0, 1]
    rows = bar_evidence(e, changed, c)
    assert max(rows, key=lambda r:r['strength'])['barBoundaryIndex'] == 6


def render_markers(base, target, markers):
    """Add a short lower-pitched chord to the already accepted grid audition."""
    sr = 44100
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(base), '-f', 'f32le', '-ar', str(sr), '-ac', '2', 'pipe:1'])
    audio = np.frombuffer(raw, dtype='<f4').reshape(-1, 2).copy()
    for seconds in markers:
        offset = round(seconds * sr)
        length = min(round(.1 * sr), len(audio)-offset)
        t = np.arange(length) / sr
        chord = .18 * sum(np.sin(2*np.pi*f*t) for f in (600, 900, 1200)) * np.hanning(length)
        audio[offset:offset+length] += chord[:, None]
    peak = float(np.max(np.abs(audio)))
    if peak > .95:
        audio *= .95 / peak
    subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', '2', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', '160k', str(target)], input=audio.astype('<f4').tobytes(), check=True)


def main():
    check_descriptors()
    root = Path(sys.argv[1])
    out = root / 'phrase-bars'
    out.mkdir(exist_ok=True)
    comparison = json.loads((root / 'comparison.json').read_text())
    result = dict(scope='Only owner-accepted source 0–32s windows; final partial bar excluded',
                  versions={p:importlib.metadata.version(p) for p in ['librosa', 'numpy', 'scipy']},
                  method='Existing beat-synchronous extraction; all complete four-beat bars; local context changes and ordered spectral block distances',
                  phraseVerified=False, vocalSafety='not assessed', records=[])
    for name, model, owner_ref in [('urban-cookie-collective', 'final0', 22.41195548252519), ('gusto', 'small0', 22.96396023024595)]:
        source = next(r for r in comparison['tracks'] if r['name'] == name and r['model'] == model)
        path = Path(source['sourcePath'])
        with path.open('rb') as f:
            assert hashlib.file_digest(f, 'sha256').hexdigest() == source['sourceSha256']
        raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(path), '-t', '32', '-f', 'f32le', '-ar', str(SR), '-ac', '1', 'pipe:1'])
        y = np.frombuffer(raw, dtype='<f4').copy()
        beats = np.array([t for t in source['beatsSeconds'] if t < 32])
        downbeats = np.array([t for t in source['downbeatsSeconds'] if t < 32])
        energy, spectrum, chroma = extract(y, beats, librosa)
        complete = []
        for start, end in zip(downbeats, downbeats[1:]):
            indices = np.flatnonzero((beats >= start) & (beats < end))
            assert len(indices) == 4, 'Accepted opening lost four-beat bar continuity'
            assert .8 < (end-start)/(4*np.median(np.diff(beats))) < 1.2
            complete.append(indices)
        complete = np.array(complete)
        bar_energy = energy[:, complete].mean(axis=2).T
        bar_spectrum = spectrum[:, complete].transpose(1, 2, 0)
        bar_chroma = chroma[:, complete].transpose(1, 2, 0)
        candidates = bar_evidence(bar_energy, bar_spectrum, bar_chroma)
        for row in candidates:
            row['sourceSeconds'] = float(downbeats[row['barBoundaryIndex']])
        support = [dict(start_seconds=float(beats[0]), end_seconds=float(beats[-1]))]
        legacy = landmarks(beats, energy, spectrum, chroma, support)
        # Owner reference is consulted only after computing every descriptor.
        nearest = min(candidates, key=lambda r:abs(r['sourceSeconds']-owner_ref))
        ranked = sorted(candidates, key=lambda r:r['strength'], reverse=True)
        repeat_ranked = sorted(candidates, key=lambda r:r['repeatBreak'], reverse=True)
        peaks = [r for i,r in enumerate(candidates) if r['repeatBreak'] > 0
                 and r['repeatBreak'] >= max(c['repeatBreak'] for c in candidates[max(0,i-1):i+2])]
        audition_markers = sorted(r['sourceSeconds'] for r in sorted(peaks, key=lambda r:r['repeatBreak'], reverse=True)[:2])
        record = dict(name=name, model=model, sourceSha256=source['sourceSha256'], sourcePath=str(path),
                      firstCompleteBarSeconds=float(downbeats[0]), lastCompleteBarEndSeconds=float(downbeats[-1]),
                      completeBars=len(complete), barTimesSeconds=downbeats.tolist(), candidates=candidates,
                      existingArrangementLandmarks=legacy, ownerReferenceSeconds=owner_ref,
                      nearestReferenceBoundarySeconds=nearest['sourceSeconds'],
                      nearestReferenceNoveltyRank=next(i+1 for i,r in enumerate(ranked) if r is nearest),
                      nearestReferenceRepeatBreakRank=next(i+1 for i,r in enumerate(repeat_ranked) if r is nearest),
                      strongestRepeatBreakSeconds=[r['sourceSeconds'] for r in repeat_ranked[:3]],
                      strongestBoundarySeconds=[r['sourceSeconds'] for r in ranked[:3]],
                      auditionMarkersSeconds=audition_markers,
                      candidateSelection='Up to two largest positive repetition-break local maxima, without shifting boundaries; inspection only, no calibrated phrase selection')
        result['records'].append(record)
        np.savez_compressed(out/f'{name}-features.npz', energy=bar_energy, spectrum=bar_spectrum, chroma=bar_chroma)
        render_markers(root/'audio'/f'{name}-{model}.mp3', out/f'{name}-candidates.mp3', audition_markers)
        print(name, 'complete bars',len(complete),'reference rank',record['nearestReferenceNoveltyRank'],
              'top boundaries',record['strongestBoundarySeconds'], flush=True)
    (out/'results.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')


if __name__ == '__main__':
    main()
