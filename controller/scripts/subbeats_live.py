"""One bounded, model-free live handoff. The parent owns this process group.

Reuse the audition planner/renderer's saved evidence and source checks, then
publish two lossless parts with a 300ms identical overlap at incoming entry.
All scratch/downloads stay in the request's owned directory for timeout cleanup.
"""
import json
import hashlib
import os
from pathlib import Path
import re
import shutil
import signal
import sys
import tempfile
import time


class LiveRenderError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def split_handoff(audio, entry, sample_rate):
    """Two parts share identical samples over the existing clip-seam overlap."""
    overlap = round(.3 * sample_rate)
    if type(entry) is not int or entry < 0 or entry + sample_rate > len(audio) or (entry and entry < sample_rate):
        raise ValueError('The live handoff cannot be split into playable requests.')
    parts = [('in', audio[entry:])]
    if entry:
        parts.insert(0, ('out', audio[:entry + overlap]))
    return parts


def _file_sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _read_stembeats_window(window, expected, side, root):
    import numpy as np
    import soundfile as sf
    directory = Path(window['directory'])
    if (directory.is_symlink() or not directory.is_dir()
            or not directory.resolve().is_relative_to(root.resolve())):
        raise LiveRenderError('window-coverage', 'Stem Beats window is outside its owned workspace.')
    stamp_path = directory / f'{side}-stembeats.json'
    if stamp_path.is_symlink() or not stamp_path.is_file():
        raise LiveRenderError('window-coverage', 'Stem Beats completion evidence is missing.')
    stamp = json.loads(stamp_path.read_text())
    if any(stamp.get(key) != value for key, value in expected.items()):
        raise LiveRenderError('window-coverage', 'Stem Beats completion evidence does not match this pair.')
    if (stamp.get('side') != side or stamp.get('version') != 1 or stamp.get('device') != 'cpu'
            or stamp.get('model') != 'htdemucs' or stamp.get('sample_rate') != 44100
            or type(stamp.get('samples')) is not int
            or stamp['samples'] != round(expected['end_ms'] * 44.1) - round(expected['start_ms'] * 44.1)):
        raise LiveRenderError('window-coverage', 'Stem Beats window coverage is invalid.')
    parts = {}
    for name in ('drums', 'bass', 'other', 'vocals'):
        path = directory / f'{side}-{name}.flac'
        if path.is_symlink() or not path.is_file():
            raise LiveRenderError('window-coverage', 'Stem Beats extraction is incomplete.')
        info = sf.info(path)
        if (info.samplerate, info.channels, info.frames) != (44100, 2, stamp['samples']):
            raise LiveRenderError('window-coverage', 'Stem Beats stem format or coverage is invalid.')
        audio, sample_rate = sf.read(path, dtype='float32', always_2d=True)
        if sample_rate != 44100 or audio.shape != (stamp['samples'], 2) or not np.isfinite(audio).all():
            raise LiveRenderError('window-coverage', 'Stem Beats stem audio is invalid.')
        parts[name] = audio.T
    return parts


def render_live_v2(req):
    """Render a pair from source-bound V2 windows; never read V1 bundles."""
    from subbeats_prepare import STEM_SR, decode
    from subbeats_cue_preview import passage_plan
    from subbeats_cue_matching import live_handoff_timing
    from subbeats_handoff import mix_handoff, VocalConflictError
    from analyze_worker import make_shared_dir, shared_output
    import numpy as np
    import soundfile as sf

    transition_id = req['transitionId']
    if req.get('version') != 2 or not re.fullmatch(r'[a-f0-9-]{36}', transition_id):
        raise LiveRenderError('invalid-timing', 'Unsupported Stem Beats handoff request.')
    if req.get('mixStyle') not in ('long-blend', 'short-exchange', 'bass-swap', 'drums-first'):
        raise LiveRenderError('invalid-timing', 'Unsupported handoff mix style.')
    root = Path(req['stemsRoot']) / 'stembeats' / 'pick-time'
    state = Path(req['stateDir'])
    dest = state / 'transitions'
    if dest.is_symlink():
        raise ValueError('Transition storage must not be a symlink.')
    make_shared_dir(dest)
    work = dest / f'.stembeats-{transition_id}'
    work.mkdir()
    paths = [dest / f'subbeats-{transition_id}-{role}.wav' for role in ('out', 'in')]
    published = False
    reply = dict(version=2, transitionId=transition_id, mixStyle=req['mixStyle'],
                 evidenceFingerprint=req['evidenceFingerprint'])
    old_temp = tempfile.tempdir
    try:
        tempfile.tempdir = str(work)
        roles = req['roles']
        if (len(roles) != 2 or [role['side'] for role in roles] != ['tail', 'head']
                or [role['id'] for role in roles] != [req['outgoingId'], req['incomingId']]):
            raise LiveRenderError('invalid-timing', 'Stem Beats roles do not match the selected pair.')
        sources = []
        for role in roles:
            source = role['source']
            path = Path(source['path'])
            if path.is_symlink() or not path.is_file() or path.stat().st_size != source['bytes']:
                raise LiveRenderError('source-mismatch', 'A complete source recording changed before rendering.')
            if _file_sha256(path) != source['sha256']:
                raise LiveRenderError('source-mismatch', 'A complete source recording differs from V2 preparation.')
            audio = decode(path, STEM_SR, 2)
            if abs(audio.shape[1] / STEM_SR - source['durationSeconds']) > .05:
                raise LiveRenderError('source-mismatch', 'Source timing differs from V2 preparation.')
            sources.append(audio)
        try:
            plan = passage_plan(roles[0]['cue'], roles[1]['cue'],
                                roles[0]['source']['durationSeconds'], roles[1]['source']['durationSeconds'])
            timing = live_handoff_timing(plan, roles[1]['cue']['bpm'], release_beats=16)
        except (ValueError, KeyError, TypeError) as error:
            raise LiveRenderError('invalid-timing', 'The saved cues cannot form a complete handoff.') from error
        if timing['incomingResumeSample'] / STEM_SR >= roles[1]['source']['durationSeconds']:
            raise LiveRenderError('invalid-timing', 'The incoming original recording ends before the tempo release completes.')
        candidate = dict(outgoingCueIndex=roles[0]['cueIndex'], incomingCueIndex=roles[1]['cueIndex'],
                         outgoingBars=None, incomingBars=None, timing=timing,
                         originalLeadInSeconds=0., lyricEvidence=[None, None])
        out_expected = roles[0]['window']['evidence']
        in_expected = roles[1]['window']['evidence']
        for index, evidence in enumerate((out_expected, in_expected)):
            source = roles[index]['source']
            if (evidence['side'] != roles[index]['side'] or evidence['source_sha256'] != source['sha256']
                    or evidence['source_bytes'] != source['bytes']):
                raise LiveRenderError('source-mismatch', 'Stem Beats window and complete source fingerprints differ.')
        out_parts = _read_stembeats_window(roles[0]['window'], out_expected, 'tail', root)
        in_parts = _read_stembeats_window(roles[1]['window'], in_expected, 'head', root)
        if (round(out_expected['start_ms'] * STEM_SR / 1000) != timing['outgoingStartSample']
                or round(out_expected['end_ms'] * STEM_SR / 1000) != round(plan['out_end'] * STEM_SR)
                or in_expected['start_ms'] != 0
                or round(in_expected['end_ms'] * STEM_SR / 1000) != timing['incomingResumeSample']):
            raise LiveRenderError('window-coverage', 'Stem Beats windows do not cover the selected transition plan.')
        out_frames = round(roles[0]['source']['durationSeconds'] * STEM_SR) - timing['outgoingStartSample']
        out_offset = timing['outgoingStartSample'] - round(out_expected['start_ms'] * STEM_SR / 1000)
        in_frames = timing['incomingResumeSample']
        if (out_offset < 0 or out_frames <= 0
                or any(part.shape[1] < out_offset + out_frames for part in out_parts.values())
                or any(part.shape[1] < in_frames for part in in_parts.values())):
            raise LiveRenderError('window-coverage', 'Stem Beats windows are shorter than the exact handoff sample ranges.')
        out_parts = {name: part[:, out_offset:out_offset + out_frames] for name, part in out_parts.items()}
        in_parts = {name: part[:, :in_frames] for name, part in in_parts.items()}
        with tempfile.TemporaryDirectory(prefix='.handoff-', dir=work) as scratch:
            try:
                audio, vocal = mix_handoff(out_parts, in_parts, sources, plan, candidate, req['gainsDb'],
                                           req['mixStyle'], Path(scratch), time.monotonic() + min(120., max(0, (req['deadlineMs'] - time.time() * 1000) / 1000)))
            except VocalConflictError as error:
                raise LiveRenderError('vocal-conflict', 'The measured vocals conflict at this handoff.') from error
        if time.time() * 1000 >= req['deadlineMs']:
            raise TimeoutError('The handoff exceeded its commitment deadline.')
        entry = timing['incomingEntryFrame']
        for role, data in split_handoff(audio.T, entry, STEM_SR):
            path = paths[0 if role == 'out' else 1]
            with shared_output(str(path)) as temporary:
                sf.write(temporary, data, STEM_SR, subtype='FLOAT', format='WAV')
        published = True
        return dict(reply, status='rendered', reason='V2 windows and complete source recordings verified.',
                    sourceVerified=True, timing=timing, vocal=vocal,
                    clipPath=str(paths[1]), leadPath=str(paths[0]) if entry else None)
    finally:
        tempfile.tempdir = old_temp
        if not published:
            for path in paths:
                path.unlink(missing_ok=True)
        shutil.rmtree(work, ignore_errors=True)


def render_live(req):
    if req.get('version') == 2:
        return render_live_v2(req)
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
    except BaseException as error:
        # Emit only controlled codes: arbitrary exception text can carry URLs
        # with credentials, local paths or subprocess output.
        code = error.code if isinstance(error, LiveRenderError) else 'timeout' if isinstance(error, TimeoutError) else 'render-failed'
        print(json.dumps({'error': {'code': code}}), flush=True)
        sys.exit(1)
