"""Offline comparison of production Sub/Beats inference and upstream #2244.

Run each backend in a fresh two-core container, sequentially. Inputs are
read-only recordings; no station state or prepared audio is opened.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import time


def memory(key):
    for line in Path('/proc/self/status').read_text().splitlines():
        if line.startswith(key + ':'):
            return int(line.split()[1]) / 1024


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backend', choices=['torch', 'onnx'])
    parser.add_argument('--root', type=Path, default=Path('/assessment'))
    args = parser.parse_args()
    root = args.root
    started = time.perf_counter()
    import numpy as np
    import librosa
    sys.path.insert(0, '/current')
    import subbeats_cues as cues
    from subbeats_prepare import decode, SR
    imports_seconds = time.perf_counter() - started
    inputs = json.loads((root / 'container-inputs.json').read_text())
    for item in inputs:
        with Path(item['path']).open('rb') as source:
            assert hashlib.file_digest(source, 'sha256').hexdigest() == item['sha256'], item['id']
    if args.backend == 'onnx':
        spec = importlib.util.spec_from_file_location('upstream2244', root / 'upstream/analyze_worker.py')
        upstream = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(upstream)
        load_start = time.perf_counter()
        tracker = upstream.DownbeatTracker(str(root / 'beat_this-small0.onnx'), 2)
        tracker.load()
        load_seconds = time.perf_counter() - load_start
        def predict(y):
            return tracker.track(y, SR, librosa)
    else:
        load_seconds = None  # production predict constructs its model per call
        def predict(y):
            return cues.predict(y, SR, 'small0')
    warm = decode(Path(inputs[0]['path']), SR, 1)[0][:40*SR]
    warm_start = time.perf_counter()
    predict(warm)
    warm_seconds = time.perf_counter() - warm_start
    report = dict(backend=args.backend, inputs=[], imports_seconds=imports_seconds,
                  model_session_load_seconds=load_seconds, first_40s_call_seconds=warm_seconds,
                  rss_after_warm_mib=memory('VmRSS'),
                  versions={name:__import__('importlib.metadata',fromlist=['version']).version(name)
                            for name in ['numpy','librosa','onnxruntime','torch','beat-this']})
    requests = [(item, None) for item in inputs]
    requests.extend((inputs[0], duration) for duration in [12, 20, 40])
    for item, cap in requests:
        decode_start = time.perf_counter()
        y = decode(Path(item['path']), SR, 1)[0]
        if cap is not None:
            y = y[:cap*SR]
        decode_seconds = time.perf_counter() - decode_start
        t = time.perf_counter()
        beats, downbeats = predict(y)
        elapsed = time.perf_counter() - t
        feature_start = time.perf_counter()
        passages = cues.fitted_passages(y, SR, beats, downbeats) if cap is None else None
        row = dict(id=item['id'] if cap is None else item['id']+'-'+str(cap)+'s',
                   source_sha256=item['sha256'], seconds=len(y)/SR,
                   decode_seconds=decode_seconds, inference_seconds=elapsed,
                   passage_seconds=time.perf_counter()-feature_start,
                   beats=np.asarray(beats).tolist(),downbeats=np.asarray(downbeats).tolist(),
                   fitted_passages=passages,peak_rss_mib=memory('VmHWM'))
        report['inputs'].append(row)
        (root / (args.backend+'.json')).write_text(json.dumps(report,indent=2,default=lambda x:x.item())+'\n')
        print(json.dumps({key:value for key,value in row.items()
                          if key not in ['beats','downbeats','fitted_passages']},default=lambda x:x.item()),flush=True)
    report.update(peak_rss_mib=memory('VmHWM'),rss_end_mib=memory('VmRSS'),
                  total_seconds=time.perf_counter()-started)
    (root / (args.backend+'.json')).write_text(json.dumps(report,indent=2,default=lambda x:x.item())+'\n')
    print(json.dumps({key:value for key,value in report.items() if key!='inputs'}),flush=True)


if __name__ == '__main__':
    main()
