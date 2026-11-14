"""Show #2244's tail route losing an available learned grid on BPM failure."""
import json
import sys
import types

import numpy as np

sys.path.insert(0, '/assessment/upstream')
import analyze_worker as worker

calls = []

def fail_tempo(**kwargs):
    raise RuntimeError('fixture: legacy tempo failed')

class Tracker:
    def track(self, y, sr, librosa):
        calls.append('track')
        return np.asarray([.1,.6,1.1,1.6,2.1]), np.asarray([.1,2.1])

librosa = types.SimpleNamespace(
    to_mono=lambda y: y.mean(axis=0),
    feature=types.SimpleNamespace(rms=lambda **kwargs: np.ones((1,40))),
    frames_to_time=lambda frames, **kwargs: np.asarray(frames)*.5,
    beat=types.SimpleNamespace(beat_track=fail_tempo),
)
worker.get_downbeat_tracker = lambda: Tracker()
worker.measure_loudness = lambda *args: (-14., -1.)
worker.silence_edges_ms = lambda *args: (0.,0.,20000.)
y = np.full((1,20*22050), .1, dtype=np.float32)
tail = worker.facet_tail(y, 22050, 180., 200., librosa)
assert calls == [], 'the tail caller bypasses bar_grid when the legacy tempo step throws'
assert 'bars' not in tail and 'beats' not in tail
direct = worker.bar_grid(y[0], 22050, librosa, [], offset_s=180.)
assert calls == ['track'] and direct[1] == [180100,182100]
print(json.dumps(dict(tail_grid=tail.get('bars'), tail_tracker_calls=0,
                     available_helper_bars=direct[1], finding='confirmed')))
