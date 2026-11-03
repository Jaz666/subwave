"""Optional cue evidence on learned bars, independent of existing stem bundles.

Uses official Beat This! on the original full mix, then local arrangement and
ordered-bar repetition. Candidates are for preview, never pair/phrase approval.
"""
import importlib.metadata
import json
from pathlib import Path

from subbeats_cache import cached_entry, digest, prepare_cached

VERSION = 1


def bar_candidates(beats, downbeats, energy, spectrum, chroma):
    import numpy as np
    beats, downbeats = np.asarray(beats), np.asarray(downbeats)
    if (not np.isfinite(beats).all() or not np.isfinite(downbeats).all()
            or np.any(np.diff(beats) <= 0) or np.any(np.diff(downbeats) <= 0)
            or not np.isin(downbeats, beats).all()):
        raise ValueError('Invalid learned beat/bar grid')
    bars = []
    for start, end in zip(downbeats, downbeats[1:]):
        ix = np.flatnonzero((beats >= start) & (beats < end))
        if len(ix) != 4:
            bars.append(None)
            continue
        intervals = np.diff(np.r_[beats[ix], end])
        if np.max(np.abs(intervals / np.median(intervals) - 1)) > .2:
            bars.append(None)
            continue
        bars.append(ix)
    candidates = []
    for i in range(2, len(bars)-2):
        # Never bridge a missed beat or changed bar origin with an ordinal count.
        if any(bar is None for bar in bars[i-2:i+2]):
            continue
        local = np.concatenate(bars[i-2:i+2])
        slope, origin = np.polyfit(np.arange(len(local)), beats[local], 1)
        error = float(np.max(np.abs(beats[local] - (origin+slope*np.arange(len(local))))))
        if error > .035 or not 60 <= 60/slope <= 190:
            continue
        novelty, repeat = 0., 0.
        for width in (1, 2, 4):
            if i < 2*width or i+width > len(bars) or any(bar is None for bar in bars[i-2*width:i+width]):
                continue
            previous, before, after = [np.array(bars[a:b]) for a,b in ((i-2*width,i-width),(i-width,i),(i,i+width))]
            def distance(a,b):
                return float(np.abs(spectrum[:,a] - spectrum[:,b]).sum(axis=0).mean())
            repeat = max(repeat, distance(before,after)-distance(previous,before))
            delta = energy[:,after].mean(axis=(1,2))-energy[:,before].mean(axis=(1,2))
            timbre = float(np.abs(spectrum[:,after].mean(axis=(1,2))-spectrum[:,before].mean(axis=(1,2))).sum())
            ca, cb = chroma[:,before].mean(axis=(1,2)), chroma[:,after].mean(axis=(1,2))
            harmonic = float(np.linalg.norm(ca/max(1e-12,np.linalg.norm(ca))-cb/max(1e-12,np.linalg.norm(cb))))
            novelty = max(novelty, float(np.max(np.abs(delta)))/6, timbre/.35, harmonic/.5)
        # Absolute evidence floors allow an empty result in unchanging material.
        if repeat < .04 and novelty < 1:
            continue
        candidates.append(dict(sourceSeconds=float(downbeats[i]), bpm=float(60/slope),
                               strength=max(repeat*10,novelty),
                               reason='repetition' if repeat*10 >= novelty else 'arrangement'))
    selected = []
    for item in sorted(candidates,key=lambda c:c['strength'],reverse=True):
        if all(abs(item['sourceSeconds']-c['sourceSeconds']) >= 6*60/item['bpm'] for c in selected):
            selected.append(item)
        if len(selected)==8:
            break
    return selected


def predict(y, sr, model):
    from subbeats_models import model_path
    path = model_path(model)
    try:
        import torch
        from beat_this.inference import Audio2Beats
    except ImportError as error:
        raise ValueError('Beat This! preparation needs an updated heavy analyzer. Choose current preparation until it is rebuilt.') from error
    threads = torch.get_num_threads()
    try:
        torch.set_num_threads(2)
        tracker = Audio2Beats(checkpoint_path=str(path), device='cpu', dbn=False)
        return tracker(y, sr)
    finally:
        torch.set_num_threads(threads)


def prepare_cues(path, state_dir, folder, record, model, *, cache_root, allowance, expected_cache_id):
    import librosa
    import numpy as np
    from subbeats_models import MODELS
    from subbeats_prepare import SR, decode, require_shared_cache
    from subbeats_structure import SR as FEATURE_SR, extract
    if model not in MODELS:
        raise ValueError('Unknown cue preparation method')
    identity = dict(mode='cue-points',version=VERSION,model=model,model_sha256=MODELS[model],
                    beat_this='1.1.0',librosa=librosa.__version__,
                    source_sha256=record['identity']['source_sha256'],bundle_sha256=digest(Path(folder)/'manifest.json'))
    def build(stage):
        if digest(Path(path)) != identity['source_sha256']:
            raise ValueError('Cue source no longer matches the prepared stems')
        if importlib.metadata.version('beat-this') != identity['beat_this']:
            raise ValueError('Rebuild the heavy analyzer for the supported Beat This! version')
        y = decode(path,SR,1)[0]
        beats, downbeats = predict(y,SR,model)
        if (not np.isfinite(beats).all() or np.any(beats < 0) or np.any(beats >= len(y)/SR)):
            raise ValueError('Learned grid is outside the decoded recording')
        roles = {}
        for role, name in [('incoming','head'),('outgoing','exit')]:
            region = next((r for r in record['metadata']['stem_regions'] if r['name']==name),None)
            if region is None:
                roles[role] = []
                continue
            start,end = region['start_sample']/region['sample_rate'],region['end_sample']/region['sample_rate']
            b = beats[(beats>=start)&(beats<end)]
            d = downbeats[(downbeats>=start)&(downbeats<end)]
            audio = librosa.resample(y[round(start*SR):round(end*SR)],orig_sr=SR,target_sr=FEATURE_SR)
            if len(b)<20 or len(d)<6:
                roles[role] = []
                continue
            features = extract(audio,b-start,librosa)
            roles[role] = bar_candidates(b,d,*features)
        if digest(Path(path)) != identity['source_sha256']:
            raise ValueError('Cue source changed during preparation')
        require_shared_cache(state_dir,expected_cache_id)
        (stage/'cues.json').write_text(json.dumps(dict(version=VERSION,model=model,**roles),allow_nan=False)+'\n')
        return dict(bundle_key=Path(folder).name,model=model,**roles)
    result = prepare_cached(state_dir,identity,build,cache_root=cache_root,allowance=allowance)
    return dict(version=VERSION,model=model,artifactKey=Path(result['directory']).name,
                incoming=result['metadata']['incoming'],outgoing=result['metadata']['outgoing'])


def load_cues(state, stems_root, track_id, key, bundle):
    import re
    from subbeats_cache import bundle_folder
    if not isinstance(key,str) or not re.fullmatch('[a-f0-9]{64}',key):
        raise ValueError('Prepare cue points for both tracks first')
    folder = bundle_folder(state,key,stems_root,track_id)
    identity = json.loads((folder/'manifest.json').read_text())['identity']
    record = cached_entry(folder,identity)
    if (record is None or identity.get('mode')!='cue-points' or identity.get('version')!=VERSION
            or record['metadata'].get('bundle_key')!=bundle.name
            or identity.get('bundle_sha256')!=digest(bundle/'manifest.json')):
        raise ValueError('Cue points no longer match these stems. Recheck with a cue-point method.')
    return json.loads((folder/'cues.json').read_text())
