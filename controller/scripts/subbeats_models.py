"""The checksum-pinned Beat This ONNX model shared by grid and cue analysis."""
import hashlib
import os
from pathlib import Path

from beat_this_grid import SMALL0_SHA256

MODELS = {'small0': SMALL0_SHA256}


def model_path(name):
    if name not in MODELS:
        raise ValueError('Choose the small Beat This! preparation method')
    root = os.environ.get('BEAT_THIS_MODEL', '').strip()
    path = Path(root or '/opt/analyzer/models/beat_this-small0.onnx')
    try:
        with path.open('rb') as source:
            valid = hashlib.file_digest(source, 'sha256').hexdigest() == MODELS[name]
    except OSError:
        valid = False
    if not valid:
        raise ValueError('Beat This! model is unavailable or invalid. Rebuild the heavy analyzer, or choose current preparation.')
    return path
