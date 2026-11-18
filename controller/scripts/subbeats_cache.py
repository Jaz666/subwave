"""Versioned, integrity-checked Sub/Beats artifacts; extended artifacts may live inside regular track folders."""
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


def prepare_cached(state_dir, identity, build, budget=DEFAULT_BUDGET, *, cache_root=None, allowance=None):
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
    root = Path(cache_root) if cache_root is not None else parent / 'v1'
    if root.is_symlink():
        raise ValueError('versioned cache must not be a symlink')
    root.mkdir(parents=True, exist_ok=True)
    # ponytail: one cache writer; use region locks only if parallel preparation is needed.
    descriptor = os.open(root / '.prepare.lock', os.O_RDONLY | os.O_CREAT, 0o644)
    with os.fdopen(descriptor, 'r') as lock:
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
        if (allowance['bytes'] <= 0 if allowance is not None else tree_bytes(root) >= budget):
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
            size = tree_bytes(stage)
            if (size > allowance['bytes'] if allowance is not None else tree_bytes(root) > budget):
                raise RuntimeError('prepared result exceeds remaining Sub/Beats cache budget')
            if allowance is not None and not (allowance['root'] / '.subwave-stems').is_file():
                raise ValueError('Shared stem cache went offline')
            os.rename(stage, dest)
            if allowance is not None:
                allowance['bytes'] -= size
            return {'cache_hit': False, 'directory': str(dest), **record}
        finally:
            if stage.exists():
                shutil.rmtree(stage)


def track_cache_root(stems_root, track_id):
    """Extended artifacts belong to their track, below the ordinary stem files."""
    if (not isinstance(track_id, str) or not track_id or track_id.startswith('.')
            or Path(track_id).name != track_id or '\\' in track_id):
        raise ValueError('Invalid shared-cache track id')
    root = Path(stems_root)
    if not root.is_dir() or not (root / '.subwave-stems').is_file():
        raise ValueError('Shared stem cache is offline or unmarked')
    dest = root / track_id / 'subbeats' / 'v1'
    for part in [root / track_id, dest.parent, dest]:
        if part.is_symlink():
            raise ValueError('Shared track cache must not contain symlinks')
    return dest


def bundle_folder(state_dir, key, stems_root=None, track_id=None):
    legacy = Path(state_dir) / 'subbeats' / 'v1' / key
    if stems_root is None:
        return legacy
    shared = track_cache_root(stems_root, track_id) / key
    return shared if shared.exists() or shared.is_symlink() else legacy


def shared_context(req):
    """The controller owns the shared byte budget and serial maintenance slot."""
    remaining = req.get('remaining_bytes')
    if type(remaining) is not int or remaining < 0:
        raise ValueError('Shared cache headroom is required')
    track_cache_root(req['stems_root'], 'cache-check')
    return {'bytes': remaining, 'root': Path(req['stems_root'])}


def migrate_shared(state_dir, stems_root, allowance):
    """Copy, verify, publish, then unlink old referenced bundles; safe to retry.

    Preserve unreferenced experiments and damaged bundles for inspection. The
    legacy writer lock prevents migration racing an older analyzer's publisher.
    """
    parent = Path(state_dir) / 'subbeats'
    root = parent / 'v1'
    if parent.is_symlink() or root.is_symlink():
        raise ValueError('Legacy cache must not be a symlink')
    if not root.exists():
        return 0
    jobs = json.loads((parent / 'queue.json').read_text())['jobs']
    owners, sources = {}, {}
    for job in jobs:
        if job.get('bundleKey'):
            owners.setdefault(job['bundleKey'], set()).add(job['id'])
    moved = 0
    # Match the original publisher: the shared lock may belong to another UID.
    descriptor = os.open(root / '.prepare.lock', os.O_RDONLY | os.O_CREAT, 0o644)
    with os.fdopen(descriptor, 'r') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        entries = []
        for folder in root.iterdir():
            if folder.name.startswith('.') or not folder.is_dir() or folder.is_symlink():
                continue
            try:
                identity = json.loads((folder / 'manifest.json').read_text())['identity']
                record = cached_entry(folder, identity)
            except (OSError, ValueError, KeyError, TypeError):
                record = None
            if record is None:
                continue
            entries.append((folder, record))
            if folder.name in owners:
                sources.setdefault(identity.get('source_sha256'), set()).update(owners[folder.name])
        for folder, record in entries:
            ids = owners.get(folder.name, set())
            if record['identity'].get('mode') == 'structure':
                ids = sources.get(record['identity'].get('source_sha256'), set())
            if not ids:
                continue
            # Reject extra/unverified files as well as symlinks before copying.
            if ({p.name for p in folder.iterdir()} != set(record['files']) | {'manifest.json'}
                    or any(p.is_symlink() or not p.is_file() for p in folder.iterdir())):
                raise ValueError('Legacy bundle contains unsafe entries')
            for track_id in sorted(ids):
                dest_root = track_cache_root(stems_root, track_id)
                dest_root.mkdir(parents=True, exist_ok=True)
                dest = dest_root / folder.name
                if dest.exists() or dest.is_symlink():
                    if cached_entry(dest, record['identity']) != record:
                        raise ValueError('Shared-cache migration collision; old bundle preserved')
                    continue
                size = tree_bytes(folder)
                if size > allowance['bytes']:
                    raise RuntimeError('Not enough shared stem-cache budget to migrate existing bundles')
                stage = Path(tempfile.mkdtemp(prefix='.migrate-', dir=dest_root))
                try:
                    shutil.copytree(folder, stage, dirs_exist_ok=True)
                    if cached_entry(stage, record['identity']) != record:
                        raise ValueError('Migrated bundle failed integrity checks; old bundle preserved')
                    os.rename(stage, dest)
                    allowance['bytes'] -= size
                finally:
                    if stage.exists():
                        shutil.rmtree(stage)
            for track_id in ids:
                final = track_cache_root(stems_root, track_id) / folder.name
                if cached_entry(final, record['identity']) != record:
                    raise ValueError('Shared bundle disappeared; old bundle preserved')
            shutil.rmtree(folder)
            moved += 1
    return moved
