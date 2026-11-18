"""Compare engines with the PyTorch stack already imported in both processes."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys
import time

def memory(key):
    for line in Path('/proc/self/status').read_text().splitlines():
        if line.startswith(key+':'):
            return int(line.split()[1])/1024

mode=sys.argv[1]
import torch
torch.set_num_threads(2)
import torchaudio
import demucs
import numpy as np
import librosa
sys.path.insert(0,'/current')
from subbeats_prepare import decode,SR
import subbeats_cues as cues
rows=json.loads(Path('/assessment/container-inputs.json').read_text())
y=decode(Path(rows[0]['path']),SR,1)[0]
baseline=memory('VmRSS')
if mode=='onnx':
    spec=importlib.util.spec_from_file_location('upstream2244','/assessment/upstream/analyze_worker.py')
    upstream=importlib.util.module_from_spec(spec);spec.loader.exec_module(upstream)
    tracker=upstream.DownbeatTracker('/assessment/beat_this-small0.onnx',2);tracker.load()
    predict=lambda z: tracker.track(z,SR,librosa)
else:
    predict=lambda z: cues.predict(z,SR,'small0')
predict(y[:40*SR])
times=[]
for _ in range(3):
    t=time.perf_counter();predict(y[:40*SR]);times.append(time.perf_counter()-t)
t=time.perf_counter();predict(y);elapsed=time.perf_counter()-t
result=dict(backend=mode,torch_stack_imported=True,demucs_model_loaded=False,
            baseline_rss_mib=baseline,peak_rss_mib=memory('VmHWM'),
            end_rss_mib=memory('VmRSS'),warm_40s_times=times,
            full_track_seconds=len(y)/SR,full_track_inference_seconds=elapsed)
Path('/assessment/'+mode+'-resident.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
