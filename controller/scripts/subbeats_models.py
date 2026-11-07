"""Pinned official Beat This! weights for heavy images; never downloaded at runtime."""
import hashlib
from pathlib import Path
import sys
import urllib.request

MODELS = {
    'small0': '6074be2c4d490c5f6101fcc374a1ec72ae93456e23bb6019783b849f5dc7d47b',
    'final0': '8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331',
}


def model_path(name):
    import os
    if name not in MODELS:
        raise ValueError('Choose the small or full Beat This! preparation method')
    root = os.environ.get('SUBBEATS_BEAT_THIS_MODELS', '').strip() or '/opt/analyzer/beat-this'
    path = Path(root) / f'{name}.ckpt'
    try:
        with path.open('rb') as source:
            valid = hashlib.file_digest(source, 'sha256').hexdigest() == MODELS[name]
    except OSError:
        valid = False
    if not valid:
        raise ValueError('Beat This! weights are unavailable or invalid. Rebuild the heavy analyzer, or choose current preparation.')
    return path


if __name__ == '__main__':
    target = Path(sys.argv[1])
    target.mkdir(parents=True, exist_ok=True)
    for name, expected in MODELS.items():
        path = target / f'{name}.ckpt'
        urllib.request.urlretrieve(f'https://cloud.cp.jku.at/public.php/dav/files/7ik4RrBKTS273gp/{name}.ckpt', path)
        with path.open('rb') as source:
            if hashlib.file_digest(source, 'sha256').hexdigest() != expected:
                raise ValueError(f'Invalid {name} weights')
