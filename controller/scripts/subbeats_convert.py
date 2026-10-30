#!/usr/bin/env python3
"""CPU-only FLAC conversion of verified prepared bundles; queue keys stay stable."""
import argparse
import copy
import ctypes
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import tempfile

from subbeats_cache import cached_entry, digest
from subbeats_prepare import STEMS, STEM_SR, write_flac_region

FORMAT = 'PCM_24-shared-gain-v1'


def exchange(left, right):
    # Linux's atomic exchange keeps the prepared path valid throughout commit.
    libc = ctypes.CDLL(None, use_errno=True)
    rename = libc.renameat2
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(left), -100, os.fsencode(right), 2):
        raise OSError(ctypes.get_errno(), 'atomic bundle exchange failed')


def convert_bundle(root, key):
    import numpy as np
    import soundfile as sf
    if not re.fullmatch('[a-f0-9]{64}', key):
        raise ValueError('invalid bundle key')
    source = root / key
    manifest = json.loads((source / 'manifest.json').read_text())
    original = cached_entry(source, manifest['identity'])
    if original is None:
        raise ValueError(f'original bundle failed integrity checks: {key}')
    if original['metadata'].get('storage_format') == FORMAT:
        return {'key': key, 'converted': False, 'bytes': sum(v['bytes'] for v in original['files'].values())}
    if original['identity'].get('separator', {}).get('subtype') != 'PCM_24-or-FLOAT-v1':
        raise ValueError('unsupported original stem format')
    record = copy.deepcopy(original)
    before = sum(v['bytes'] for v in original['files'].values())
    stage = Path(tempfile.mkdtemp(prefix='.convert-', dir=root))
    swapped = False
    committed = False
    try:
        stem_files = set()
        for region in record['metadata']['stem_regions']:
            name = region['name']
            if name not in ('head', 'exit'):
                raise ValueError('unsupported stem region')
            parts = {}
            old_gain = region.get('storage_gain', 1.)
            if not np.isfinite(old_gain) or old_gain <= 0:
                raise ValueError('invalid original storage gain')
            for stem in STEMS:
                options = [f'{name}-{stem}.{ext}' for ext in ('flac', 'wav')
                           if f'{name}-{stem}.{ext}' in original['files']]
                if len(options) != 1:
                    raise ValueError('missing or ambiguous original stem')
                filename = options[0]
                samples, sr = sf.read(source / filename, dtype='float32', always_2d=True)
                expected = region['end_sample'] - region['start_sample']
                if sr != STEM_SR or samples.shape != (expected, 2) or not np.isfinite(samples).all():
                    raise ValueError('invalid original stem coverage/samples')
                parts[stem] = samples.T / old_gain
                stem_files.add(filename)
            region['storage_gain'], restored = write_flac_region(stage, name, parts)
            baseline = sum(parts.values())
            error = float(np.sqrt(np.mean((restored - baseline)**2)))
            if not np.isfinite(error) or error > max(1e-6, float(np.sqrt(np.mean(baseline**2))) * 1e-5):
                raise ValueError('converted stem sum changed beyond PCM tolerance')
            region['conversion_rms_error'] = error
        for filename in original['files'].keys() - stem_files:
            shutil.copyfile(source / filename, stage / filename)
        record['metadata']['storage_format'] = FORMAT
        record['files'] = {p.name: {'bytes': p.stat().st_size, 'sha256': digest(p)} for p in stage.iterdir()}
        after = sum(v['bytes'] for v in record['files'].values())
        if after >= before:
            return {'key': key, 'converted': False, 'reason': 'no space saving', 'bytes': before}
        (stage / 'manifest.json').write_text(json.dumps(record, indent=2, allow_nan=False) + '\n')
        if cached_entry(stage, original['identity']) is None:
            raise ValueError('converted bundle failed integrity checks')
        # Verify the original is still exactly the version we read.
        if cached_entry(source, original['identity']) != original:
            raise ValueError('original bundle changed during conversion')
        exchange(stage, source)
        swapped = True
        if cached_entry(source, original['identity']) != record:
            exchange(stage, source)
            swapped = False
            raise ValueError('published conversion failed verification; restored original')
        committed = True
        return {'key': key, 'converted': True, 'before': before, 'after': after}
    finally:
        # If exchanged, stage contains the old bundle, deleted only after verification.
        # A process kill may leave it for inspection; no automatic adoption/removal.
        if stage.exists() and (not swapped or committed):
            shutil.rmtree(stage)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state-dir', required=True, type=Path)
    args = parser.parse_args()
    parent = args.state_dir / 'subbeats'
    root = parent / 'v1'
    if parent.is_symlink() or root.is_symlink():
        raise ValueError('cache must not be a symlink')
    queue = json.loads((parent / 'queue.json').read_text())
    if not queue.get('paused') or any(j['status'] in ('queued', 'running') for j in queue['jobs']):
        raise ValueError('pause preparation and finish pending work before conversion')
    with (root / '.prepare.lock').open('r') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for key in dict.fromkeys(j['bundleKey'] for j in queue['jobs'] if j['status'] == 'prepared'):
            print(json.dumps(convert_bundle(root, key)), flush=True)


if __name__ == '__main__':
    main()
