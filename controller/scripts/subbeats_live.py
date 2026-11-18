"""One bounded, model-free live handoff. The parent owns this process group.

Reuse the audition planner/renderer's saved evidence and source checks, then
publish two lossless parts with a 300ms identical overlap at incoming entry.
All scratch/downloads stay in the request's owned directory for timeout cleanup.
"""
import json
import os
from pathlib import Path
import re
import shutil
import signal
import sys
import tempfile
import time


def split_handoff(audio, entry, sample_rate):
    """Two parts share identical samples over the existing clip-seam overlap."""
    overlap = round(.3 * sample_rate)
    if type(entry) is not int or entry < 0 or entry + sample_rate > len(audio) or (entry and entry < sample_rate):
        raise ValueError('The live handoff cannot be split into playable requests.')
    parts = [('in', audio[entry:])]
    if entry:
        parts.insert(0, ('out', audio[:entry + overlap]))
    return parts


def render_live(req):
    from subbeats_prepare import require_shared_cache, STEM_SR
    from subbeats_cue_matching import plan_live_pair
    from subbeats_preview import render_preview
    from analyze_worker import fetch_audio, make_shared_dir, shared_output
    import numpy as np
    import soundfile as sf

    transition_id = req['transitionId']
    if req.get('version') != 1 or not re.fullmatch(r'[a-f0-9-]{36}', transition_id):
        raise ValueError('Unsupported live handoff request.')
    state = Path(req['stateDir'])
    require_shared_cache(state, req['cacheId'])
    dest = state / 'transitions'
    if dest.is_symlink():
        raise ValueError('Transition storage must not be a symlink.')
    make_shared_dir(dest)
    work = dest / f'.subbeats-{transition_id}'
    work.mkdir()  # exclusive: never adopt another request's scratch directory
    paths = [dest / f'subbeats-{transition_id}-{role}.wav' for role in ('out', 'in')]
    published = False
    reply = dict(version=1, transitionId=transition_id, mixStyle=req['mixStyle'],
                 evidenceFingerprint=req['evidenceFingerprint'])
    old_temp = tempfile.tempdir
    try:
        tempfile.tempdir = str(work)
        plan = plan_live_pair(req['jobs'], req['outgoingId'], req['incomingId'], req['mixStyle'])
        if not plan['plans']:
            return dict(reply, status='unavailable', reason=plan['reason'])
        # Very short requests can be swallowed by the mixer's cross buffer.
        candidate = next((c for c in plan['plans'] if c['timing']['incomingEntryFrame'] == 0
                          or c['timing']['incomingEntryFrame'] >= STEM_SR), None)
        if candidate is None:
            return dict(reply, status='unavailable', reason='The outgoing-only segment is too short for a live clip seam.')
        jobs = [next(job for job in req['jobs'] if job['id'] == track_id)
                for track_id in (req['outgoingId'], req['incomingId'])]
        preview_req = dict(state_dir=str(state), cache_id=req['cacheId'], stems_root=req['stemsRoot'],
            track_ids=[job['id'] for job in jobs], out_key=jobs[0]['bundleKey'], in_key=jobs[1]['bundleKey'],
            method='cue-points', auto_plan=False, mix_style=req['mixStyle'],
            cue_keys=[job['cuePoints']['artifactKey'] for job in jobs],
            coverage_keys=[job['cueCoverage']['artifactKey'] for job in jobs],
            cue_indices=[candidate['outgoingCueIndex'], candidate['incomingCueIndex']],
            lyric_evidence=[job.get('lyricEvidence') for job in jobs], source_urls=req['sourceUrls'],
            out_gain_db=req['gainsDb'][0], in_gain_db=req['gainsDb'][1],
            handoff=dict(version=1, evidenceFingerprint=req['evidenceFingerprint'], candidate=candidate))
        preview = render_preview(preview_req, fetch_source=fetch_audio, preview_root=work / 'preview')
        timeline = preview['subbeats_timeline']
        timing = candidate['timing']
        if (timeline.get('kind') != 'subbeats-handoff' or not timeline['handoff']['sourceVerified']
                or timeline['handoff']['timing'] != timing):
            raise ValueError('The renderer did not honour the live handoff plan.')
        audio, sr = sf.read(preview['subbeats_preview'], dtype='float32', always_2d=True)
        if sr != STEM_SR or audio.shape != (timing['clipFrames'], 2) or not np.isfinite(audio).all():
            raise ValueError('The handoff returned invalid audio.')
        entry = timing['incomingEntryFrame']
        segments = split_handoff(audio, entry, STEM_SR)
        for role, data in segments:
            path = paths[0 if role == 'out' else 1]
            with shared_output(str(path)) as temporary:
                sf.write(temporary, data, STEM_SR, subtype='FLOAT', format='WAV')
        if time.time() * 1000 >= req['deadlineMs']:
            raise ValueError('The handoff exceeded its commitment deadline.')
        published = True
        return dict(reply, status='rendered', reason='Saved stems and original sources verified; lossless handoff parts published.',
                    candidate=candidate, sourceVerified=True, clipPath=str(paths[1]), leadPath=str(paths[0]) if entry else None)
    finally:
        tempfile.tempdir = old_temp
        if not published:
            for path in paths:
                path.unlink(missing_ok=True)
        shutil.rmtree(work, ignore_errors=True)


def main():
    # The service/local client also kills the process group. This alarm gives
    # Python a chance to unwind locks and temp files before the hard kill.
    def expired(_signum, _frame):
        raise TimeoutError('Live handoff deadline exceeded.')
    signal.signal(signal.SIGTERM, expired)
    signal.signal(signal.SIGALRM, expired)
    req = json.loads(sys.stdin.readline())
    budget = min(120., (req['deadlineMs'] - time.time() * 1000) / 1000)
    if budget <= 0:
        raise TimeoutError('Live handoff deadline expired before admission.')
    signal.setitimer(signal.ITIMER_REAL, budget)
    result = render_live(req)
    signal.setitimer(signal.ITIMER_REAL, 0)
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    try:
        main()
    except BaseException:
        # Stream URLs include credentials. Return a fixed error rather than
        # serialising an arbitrary library/subprocess exception or traceback.
        print(json.dumps({'error': 'The live handoff could not finish within its saved coverage and time budget.'}), flush=True)
        sys.exit(1)
