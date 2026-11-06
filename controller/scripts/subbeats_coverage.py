"""Persistent, source-bound cue coverage under the ordinary shared stem budget.

At most 120 preview seconds and 8% tempo adjustment bound all supported pairs:
130 seconds of original incoming audio and the final 120 outgoing seconds suffice.
New phrase cues retain only their opening/closing passages plus bounded incoming
follow-through. Older immutable base/cue bundles stay intact.
"""
import json
from pathlib import Path

from subbeats_cache import prepare_cached, cached_entry, digest, bundle_folder
from subbeats_cues import TAIL_SECONDS
from subbeats_prepare import STEM_SR, separate_regions, write_flac_region, require_shared_cache

VERSION = 2


def coverage_regions(cues, duration):
    regions = []
    if cues.get('algorithmVersion') in (5, 6, 7, 8, 9):
        if cues.get('incoming'):
            # The supported outgoing decay is <=16 playback seconds. Include
            # its worst permitted tempo adjustment and two incoming bars.
            end=max(c['sourceSeconds']+max(TAIL_SECONDS*1.08,8*60/c['bpm']) for c in cues['incoming'])
            regions.append(('head',0.,min(duration,end+.05)))
        if cues.get('outgoing'):
            regions.append(('exit',min(c['sourceSeconds'] for c in cues['outgoing']),duration))
        return regions
    if cues.get('incoming'):
        regions.append(('head',0.,min(duration,130.)))
    if cues.get('outgoing'):
        regions.append(('exit',max(0.,duration-120.),duration))
    return regions


def prepare_coverage(path,state,folder,parent,cues,*,cache_root,allowance,expected_cache_id):
    from subbeats_preview import load_region
    from subbeats_vocals import measure_vocals
    import analyze_worker as worker
    folder = Path(folder)
    if digest(path) != parent['identity']['source_sha256']:
        raise ValueError('The source changed. Recheck this track before upgrading its coverage.')
    cue_folder = Path(cache_root)/cues['artifactKey']
    identity = dict(mode='cue-coverage',version=VERSION,source_sha256=parent['identity']['source_sha256'],
        bundle_sha256=digest(folder/'manifest.json'),cue_sha256=digest(cue_folder/'manifest.json'),
        separator=parent['identity'].get('separator'))
    duration = json.loads((folder/'analysis.json').read_text())['duration_seconds']
    def build(stage):
        regions = coverage_regions(cues,duration)
        coverage,missing = [],[]
        for name,start,end in regions:
            previous = next((r for r in parent['metadata']['stem_regions'] if r['name']==name),None)
            if previous and previous['start_sample']/STEM_SR<=start and previous['end_sample']/STEM_SR+2/STEM_SR>=end:
                parts,_ = load_region(folder,parent,name,limit_seconds=130,start_seconds=start,end_seconds=end,require_tempo=False)
                gain,_ = write_flac_region(stage,name,parts)
                coverage.append(dict(name=name,start_sample=round(start*STEM_SR),end_sample=round(start*STEM_SR)+parts['vocals'].shape[1],sample_rate=STEM_SR,storage_gain=gain))
            else:
                missing.append((name,start,end))
        if missing:
            expected = identity['separator'] or {}
            if expected and (expected.get('model')!=worker.DEMUCS_MODEL or expected.get('overlap')!=worker.DEMUCS_OVERLAP):
                raise ValueError('Separation settings changed. Recheck this track before upgrading its coverage.')
            with worker._model_lock:
                detector = worker.get_vocal_detector(force=True)
                if detector is None:
                    raise ValueError('Cue coverage needs the heavy analyzer with Demucs.')
                try:
                    coverage.extend(separate_regions(path,stage,missing,detector))
                finally:
                    worker._touch_heavy()
        record = dict(metadata=dict(stem_regions=coverage),files={p.name:{} for p in stage.iterdir()})
        vocals = dict(incoming=None,outgoing=None)
        for role,name in [('incoming','head'),('outgoing','exit')]:
            region = next((r for r in coverage if r['name']==name),None)
            if region:
                parts,_ = load_region(stage,record,name,limit_seconds=130,require_tempo=False)
                vocals[role] = measure_vocals(parts,STEM_SR,region['start_sample']/STEM_SR)
        (stage/'vocals.json').write_text(json.dumps(vocals,allow_nan=False)+'\n')
        if digest(path)!=identity['source_sha256']:
            raise ValueError('Source changed while preparing cue coverage.')
        require_shared_cache(state,expected_cache_id)
        return dict(stem_regions=coverage,**vocals,used_models=bool(missing))
    result = prepare_cached(state,identity,build,cache_root=cache_root,allowance=allowance)
    return dict(version=1,artifactKey=Path(result['directory']).name,
                incoming=result['metadata']['incoming'],outgoing=result['metadata']['outgoing']), bool(not result['cache_hit'] and result['metadata']['used_models'])


def load_coverage(state,stems_root,track_id,key,bundle,cue_key):
    import re
    if not isinstance(key,str) or not re.fullmatch('[a-f0-9]{64}',key):
        raise ValueError('Invalid saved cue coverage. Upgrade this track again.')
    folder = bundle_folder(state,key,stems_root,track_id)
    try:
        identity = json.loads((folder/'manifest.json').read_text())['identity']
        record = cached_entry(folder,identity)
        cue_folder = bundle_folder(state,cue_key,stems_root,track_id)
        if (record is None or identity.get('mode')!='cue-coverage' or identity.get('version') not in (1,VERSION)
                or identity.get('bundle_sha256')!=digest(bundle/'manifest.json')
                or identity.get('cue_sha256')!=digest(cue_folder/'manifest.json')):
            raise ValueError('Saved cue coverage no longer matches this track. Upgrade coverage again.')
        return folder,record
    except (OSError,KeyError,TypeError,json.JSONDecodeError) as error:
        raise ValueError('Saved cue coverage is unavailable. Upgrade coverage again.') from error
