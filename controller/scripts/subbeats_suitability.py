"""Per-role evidence for the existing 16-bar preview; no model or stem writes.

A track level is not approval of a pair. Tempo adjustment, incoming prefix,
manual shifts and vocal/phrase compatibility still need pair-specific checks.
"""
from datetime import datetime, timezone
import json
import math
from pathlib import Path

from subbeats_preview import kick_grid, load_region

VERSION = 1


def basic_grid(analysis, region, outgoing):
    start = region['start_sample'] / region['sample_rate']
    end = region['end_sample'] / region['sample_rate']
    candidates = []
    for run in analysis.get('supported_regions', []):
        bpm = run['bpm']
        if not isinstance(bpm,(int,float)) or not math.isfinite(bpm) or bpm <= 0:
            raise ValueError('Invalid tempo evidence; recheck the prepared track')
        # Match the preview's normalized tempo range, including half/double aliases.
        while bpm < 90:
            bpm *= 2
        while bpm > 180:
            bpm /= 2
        period = 60 / bpm
        anchor = run['start_seconds']
        # Analysis ends at the last beat onset; a 64-beat mix includes its tail.
        limit = min(end, run['end_seconds'] + period + .1)  # allow measured onset residuals
        first = anchor + max(0, math.ceil((start - anchor) / period)) * period
        cue = first + max(0, math.floor((limit - first - 64 * period) / period)) * period if outgoing else first
        if cue + 64 * period <= limit + 1e-6:
            candidates.append((cue, bpm))
    return (max(candidates) if outgoing else min(candidates)) if candidates else None


def assess_role(folder, record, analysis, outgoing):
    name = 'exit' if outgoing else 'head'
    region = next((r for r in record['metadata'].get('stem_regions', []) if r['name'] == name), None)
    result = {'level':'regular', 'bpm':None, 'cueSeconds':None, 'leadSeconds':None,
              'postSeconds':None, 'reason':f'No prepared {name} region with a supported 16-bar beat grid.'}
    if region is None:
        return result
    basic = basic_grid(analysis, region, outgoing)
    if basic:
        result.update(level='beat', bpm=basic[1], cueSeconds=basic[0],
                      reason='A supported 16-bar beat grid is available in this region.')
    if not any(run['end_seconds'] > region['start_sample'] / region['sample_rate']
               and run['start_seconds'] < region['end_sample'] / region['sample_rate']
               for run in analysis.get('supported_regions', [])):
        return result
    # Exactly the loader and kick fitting used by the current stem preview.
    parts, bpm = load_region(folder, record, name)
    from subbeats_prepare import STEM_SR
    from subbeats_vocals import measure_vocals
    result['vocalActivity'] = measure_vocals(parts, STEM_SR, region['start_sample'] / region['sample_rate'])
    try:
        fits = kick_grid(parts['drums'], bpm, outgoing, all_candidates=True)
        cue, period = fits[0]
    except ValueError as error:
        result['reason'] += ' Stem preview: ' + str(error).replace(' Try another pair.', '').replace(' Prepare another track.', '')
        return result
    seconds = min(part.shape[1] for part in parts.values()) / STEM_SR
    windows = [{'cueSeconds':region['start_sample'] / region['sample_rate'] + point,
                'bpm':60 / beat, 'leadSeconds':point, 'postSeconds':max(0.,seconds-point-64*beat)}
               for point,beat in fits if outgoing or seconds-point-64*beat >= 8 - 1 / STEM_SR]
    result['windows'] = windows
    after = seconds - cue - 64 * period
    if not outgoing and after < 8 - 1 / STEM_SR:
        result['reason'] += ' The incoming region lacks the preview’s eight-second follow-through.'
        return result
    result.update(level='subbeat', bpm=60 / period,
                  cueSeconds=region['start_sample'] / region['sample_rate'] + cue,
                  leadSeconds=cue if outgoing else None,
                  postSeconds=max(0., after) if not outgoing else None,
                  reason='Cached stems pass the 16-bar kick-grid and coverage checks for this role.')
    return result


def assess_bundle(folder, record):
    analysis = json.loads((Path(folder) / 'analysis.json').read_text())
    return {'version':VERSION, 'assessedAt':datetime.now(timezone.utc).isoformat(),
            'incoming':assess_role(folder,record,analysis,False),
            'outgoing':assess_role(folder,record,analysis,True)}


def assess_request(req):
    from subbeats_prepare import require_shared_cache
    from subbeats_cache import bundle_folder, cached_entry
    from re import fullmatch
    require_shared_cache(req['state_dir'], req['cache_id'])
    key = req['bundle_key']
    if not isinstance(key,str) or not fullmatch('[a-f0-9]{64}',key):
        raise ValueError('Invalid prepared bundle key')
    folder = bundle_folder(req['state_dir'],key,req['stems_root'],req['track_id'])
    identity = json.loads((folder / 'manifest.json').read_text())['identity']
    record = cached_entry(folder,identity)
    if record is None:
        raise ValueError('Prepared bundle failed integrity checks; recheck the track')
    return {'ok':True, 'cache_added_bytes':0, 'subbeats_result':{
        'status':'prepared' if record['metadata'].get('stem_regions') else 'unmeasurable',
        'bundleKey':key, 'error':None, 'suitability':assess_bundle(folder,record)}}
