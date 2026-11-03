"""Isolated full-mix comparison; writes only to the supplied research directory.

Run with the separate Beat This! environment, not the station Python environment:
  python compare_beat_this.py /home/jaz666/codex/subbeats-beat-this-20261103
"""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import subprocess
import sys
import time

import numpy as np
import torch
from beat_this.inference import Audio2Frames
from beat_this.model.postprocessor import Postprocessor


OLD = Path('/home/jaz666/codex/subbeats-phrase-evaluation-20261102')
COMP = Path('/media/satadrive/Compilations')
SOURCES = [
    ('rozalla', '6OYcg2iOqZu1SZNm3TKwBI', COMP / "90s Dance Anthems/90s Dance Anthems Disk 2/01 Rozalla - Everybody's Free [To Feel Good].mp3", 8634574, 32),
    ('urban-cookie-collective', '4wCdFuyqXRNbyIkPtGCdxQ', COMP / '90s Dance Anthems/90s Dance Anthems Disk 2/02 Urban Cookie Collective - The Key, The Secret.mp3', 8992299, 32),
    ('gusto', '6nz5kJRZx7MV09QflArHrs', COMP / '30 Years - Three Decades of Dance (2021)/CD 01/16 - Disco’s Revenge (Mole Hole radio edit).mp3', 9369940, 32),
    ('afro-left', '05ul3rSoyemxeaWWNIMdyo', OLD / 'afro-left-source.audio', None, 75),
    ('cubik', '0sejsWk6gftg89Oci3gbG3', OLD / '0sejsWk6gftg89Oci3gbG3.audio', None, 128),
]


def sha256(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def reference(name):
    if name == 'cubik':
        return None
    if name == 'afro-left':
        return 59.3, 130.0081983357983
    j = json.loads((OLD / f'{name}-projected-grid.json').read_text())
    return j['anchor_seconds'], j['bpm']


def window_metrics(beats, downbeats, start, end):
    b = beats[(beats >= start) & (beats < end)]
    d = downbeats[(downbeats >= start) & (downbeats < end)]
    result = dict(startSeconds=start, endSeconds=end, beatCount=len(b), downbeatCount=len(d))
    if len(b) < 3:
        return result
    gaps = np.diff(b)
    period = float(np.median(gaps))
    irregular = np.flatnonzero(np.abs(gaps / period - 1) > .2)
    result.update(medianIntervalBpm=60 / period, firstBeatSeconds=float(b[0]), lastBeatSeconds=float(b[-1]),
                  irregularIntervals=[dict(atSeconds=float(b[i]), gapSeconds=float(gaps[i])) for i in irregular])
    # Sequential-index fitting is meaningful only when no gap is grossly irregular.
    if not len(irregular):
        slope, origin = np.polyfit(np.arange(len(b)), b, 1)
        residual = b - (origin + slope * np.arange(len(b)))
        result.update(fittedBpm=60 / slope, fitP95Ms=float(np.percentile(np.abs(residual), 95) * 1000))
    indices = np.searchsorted(beats, d)
    result['beatsBetweenDownbeats'] = np.diff(indices).tolist()
    return result


def anchor_metrics(beats, downbeats, ref, end):
    if ref is None:
        return dict(verdict='unknown; 124.3 BPM is an owner report without a calibrated phase anchor')
    anchor, bpm = ref
    period = 60 / bpm
    expected = anchor + np.arange(-int(anchor / period) - 1, int((end - anchor) / period) + 1) * period
    expected = expected[(expected >= 0) & (expected < end)]
    b = beats[(beats >= 0) & (beats < end)]
    d = downbeats[(downbeats >= 0) & (downbeats < end)]
    nearest = np.min(np.abs(expected[:, None] - b[None, :]), axis=1) if len(b) else np.full(len(expected), end)
    phase = ((b - anchor + period / 2) % period - period / 2) * 1000
    bar_phase = ((d - anchor + 2 * period) % (4 * period) - 2 * period) * 1000
    return dict(scopeEndSeconds=end, referenceBpm=bpm, referenceDownbeatSeconds=anchor,
                expectedBeatCount=len(expected), predictedBeatCount=len(b), expectedWithin50ms=int(sum(nearest <= .05)),
                beatPhaseP95Ms=float(np.percentile(np.abs(phase), 95)) if len(phase) else None,
                downbeatBarPhaseMs=np.round(bar_phase, 1).tolist(),
                caveat='50ms is an exploratory tolerance, not calibrated acceptance; owner reference is intro-only')


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    versions = {p: importlib.metadata.version(p) for p in ['beat-this', 'torch', 'torchaudio', 'numpy', 'soxr', 'einops', 'rotary-embedding-torch']}
    upstream = subprocess.check_output(['git', '-C', str(out / 'upstream'), 'rev-parse', 'HEAD'], text=True).strip()
    result = dict(versions=versions, upstreamRevision=upstream, device='cpu', threads=2, float16=False,
                  postprocessing='official minimal; dbn=False', input='full original mixes, ffmpeg mono 22050 Hz float32; no trimming',
                  scope='five recordings, two checkpoints, one inference each; no training-set exclusion established', tracks=[])
    for model_name in ['small0', 'final0']:
        print(f'Loading {model_name}', flush=True)
        tracker = Audio2Frames(checkpoint_path=model_name, device='cpu')
        post = Postprocessor(type='minimal')
        checkpoint = Path(torch.hub.get_dir()) / 'checkpoints' / f'beat_this-{model_name}.ckpt'
        for name, track_id, source, size, intro_end in SOURCES:
            assert size is None or source.stat().st_size == size, f'Source size mismatch: {name}'
            target = out / f'{name}-{model_name}.npz'
            meta_path = out / f'{name}-{model_name}.json'
            if meta_path.exists():
                result['tracks'].append(json.loads(meta_path.read_text()))
                continue
            signal = np.frombuffer(subprocess.check_output(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(source), '-f', 'f32le', '-ac', '1', '-ar', '22050', 'pipe:1']), dtype='<f4').copy()
            duration = len(signal) / 22050
            print(f'{model_name}: {name}, {duration:.2f}s', flush=True)
            started = time.monotonic()
            beat_logits, downbeat_logits = tracker(signal, 22050)
            beats, downbeats = post(beat_logits, downbeat_logits)
            elapsed = time.monotonic() - started
            assert np.all(np.diff(beats) > 0) and np.all(np.diff(downbeats) > 0)
            assert np.all(np.isin(downbeats, beats)) and np.all((beats >= 0) & (beats <= duration))
            np.savez_compressed(target, beats=beats, downbeats=downbeats, beat_logits=beat_logits.numpy(), downbeat_logits=downbeat_logits.numpy())
            row = dict(name=name, trackId=track_id, model=model_name, sourcePath=str(source), sourceSha256=sha256(source),
                       sourceBytes=source.stat().st_size, durationSeconds=duration, checkpointSha256=sha256(checkpoint),
                       inferenceSeconds=elapsed, beatCount=len(beats), downbeatCount=len(downbeats),
                       beatsSeconds=beats.tolist(), downbeatsSeconds=downbeats.tolist(),
                       wholeTrack=window_metrics(beats, downbeats, 0., duration),
                       opening=anchor_metrics(beats, downbeats, reference(name), intro_end),
                       windows=[window_metrics(beats, downbeats, start, min(start + 30, duration)) for start in np.arange(0., duration, 30.)])
            meta_path.write_text(json.dumps(row, indent=2) + '\n')
            result['tracks'].append(row)
            (out / 'comparison.json').write_text(json.dumps(result, indent=2) + '\n')
            print(f'  {elapsed:.1f}s; {len(beats)} beats; opening {row["opening"]}', flush=True)
        del tracker
    (out / 'comparison.json').write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    main()
