"""Versioned, integrity-checked Sub/Beats artifacts; never touches regular stems."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile

DEFAULT_BUDGET = 5 * 1024**3


def digest(path):
    with open(path, 'rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def cache_key(identity):
    return hashlib.sha256(json.dumps(identity, sort_keys=True, allow_nan=False).encode()).hexdigest()


def tree_bytes(root):
    return sum(p.stat().st_size for p in root.rglob('*') if p.is_file())


def cached_entry(dest, identity):
    try:
        if dest.is_symlink():
            return None
        record = json.loads((dest / 'manifest.json').read_text())
        if (not isinstance(record, dict) or record.get('identity') != identity
                or not isinstance(record.get('metadata'), dict)
                or not isinstance(record.get('files'), dict) or not record['files']):
            return None
        for name, expected in record['files'].items():
            if Path(name).name != name:
                return None
            target = dest / name
            if target.is_symlink() or target.stat().st_size != expected['bytes'] or digest(target) != expected['sha256']:
                return None
        return record
    except (OSError, ValueError, KeyError, TypeError):
        return None


def prepare_cached(state_dir, identity, build, budget=DEFAULT_BUDGET):
    """One job at a time; publish the whole bundle only after successful checks.

    build(stage) returns JSON metadata and writes flat artifact files. The cap
    is checked before publication; staging may temporarily exceed it. Decode/model
    RAM is separate.
    No automatic eviction yet: at capacity, decline without touching old entries.
    """
    if not isinstance(budget, int) or isinstance(budget, bool) or budget <= 0:
        raise ValueError('cache budget must be a positive byte count')
    parent = Path(state_dir).resolve() / 'subbeats'
    if parent.is_symlink():
        raise ValueError('subbeats cache must be a separate directory, not a symlink')
    parent.mkdir(parents=True, exist_ok=True)
    root = parent / 'v1'
    if root.is_symlink():
        raise ValueError('versioned cache must not be a symlink')
    root.mkdir(exist_ok=True)
    # ponytail: one local writer; integrate controller scheduling before adding parallel jobs.
    with open(root / '.prepare.lock', 'a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError('another Sub/Beats preparation is running') from error
        key = cache_key(identity)
        dest = root / key
        existing = cached_entry(dest, identity)
        if existing is not None:
            return {'cache_hit': True, 'directory': str(dest), **existing}
        if dest.exists() or dest.is_symlink():
            raise RuntimeError(f'cache integrity check failed; inspect/remove this Sub/Beats bundle: {dest}')
        if tree_bytes(root) >= budget:
            raise RuntimeError('Sub/Beats cache budget reached')
        stage = Path(tempfile.mkdtemp(prefix='.pending-', dir=root))
        try:
            metadata = build(stage)
            files = {}
            for p in stage.iterdir():
                if p.is_symlink() or not p.is_file() or p.name == 'manifest.json':
                    raise ValueError('preparer must write flat artifact files only')
                files[p.name] = {'bytes': p.stat().st_size, 'sha256': digest(p)}
            if not files:
                raise ValueError('preparation produced no artifacts')
            record = {'identity': identity, 'metadata': metadata, 'files': files}
            (stage / 'manifest.json').write_text(json.dumps(record, indent=2, allow_nan=False) + '\n')
            if tree_bytes(root) > budget:
                raise RuntimeError('prepared result exceeds remaining Sub/Beats cache budget')
            os.rename(stage, dest)
            return {'cache_hit': False, 'directory': str(dest), **record}
        finally:
            if stage.exists():
                shutil.rmtree(stage)
