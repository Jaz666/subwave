"""Complete handoff auditions from saved stems and verified original recordings.

Rubber Band's offline time map preserves pitch while releasing incoming tempo.
No separation, queue writes or implicit extension of saved stem coverage.
"""
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

from subbeats_prepare import STEM_SR, STEMS

VERSION = 1
RENDERER_VERSION = 2


def cache_identity(timing):
    if timing['incomingRate'] == 1.:
        return dict(version=RENDERER_VERSION, engine='native')
    command = shutil.which('rubberband')
    if not command:
        raise ValueError('Complete handoff previews need Rubber Band. Rebuild the analyzer or install rubberband-cli for a local worker.')
    result = subprocess.run([command, '--version'], capture_output=True, text=True, check=True, timeout=5)
    return dict(version=RENDERER_VERSION, engine='rubberband-r3',
                engineVersion=(result.stdout + result.stderr).strip()[:100])


def stretch_parts(parts, timing, scratch, deadline):
    """One multichannel process applies an identical time map to all stems."""
    import numpy as np
    import soundfile as sf
    entry = timing['incomingEntryFrame']
    total = timing['clipFrames'] - entry
    inserted = (timing['loop']['lengthSamples'] * timing['loop']['repeats']) if timing.get('loop') else 0
    source_frames = timing['incomingResumeSample'] + inserted
    if any(part.shape != (2, source_frames) or not np.isfinite(part).all() for part in parts.values()):
        raise ValueError('Incoming stems do not match the handoff source clock.')
    rate = timing['incomingRate']
    if rate == 1.:
        if source_frames != total:
            raise ValueError('The native-tempo handoff clock is inconsistent.')
        return parts
    start = timing['releaseStartFrame'] - entry
    finish = timing['releaseEndFrame'] - entry
    release = finish - start
    if not 0 <= start < finish < total:
        raise ValueError('Invalid tempo release window.')
    # Sample the integrated output-time rate every 50ms through the release.
    # Rubber Band's key frames are (input sample, output sample); they also
    # anchor the steady sections and exact final duration. No pitch option.
    # Zero is implicit. An explicit 0->0 anchor can make the R3 engine reset
    # stretching to unity (upstream rubberband issue #124). Map only points
    # inside the material and supply the overall duration separately.
    targets = sorted({start, finish, total - 1, *range(start, finish, round(.05 * STEM_SR))})
    anchors = []
    for target in targets:
        ramp = min(release, max(0, target - start))
        source = rate * min(target, start) + rate * ramp + (1 - rate) * ramp * ramp / (2 * release)
        source += max(0, target - finish)
        anchors.append((round(source), target))
    anchors[-1] = (source_frames - 1, total - 1)
    if any(a[0] >= b[0] or a[1] >= b[1] for a, b in zip([(0, 0)] + anchors, anchors)):
        raise ValueError('The tempo map is not monotonic.')
    source = np.concatenate([parts[name] for name in STEMS], axis=0).T
    # The CLI can clamp samples internally. Leave ample processing headroom,
    # undo this gain afterward, and refuse evidence of internal clipping.
    scale = min(1., .125 / max(1e-8, float(np.max(np.abs(source)))))
    input_file, output_file, map_file = (scratch / name for name in ('input.wav', 'output.wav', 'time-map.txt'))
    sf.write(input_file, source * scale, STEM_SR, subtype='FLOAT')
    map_file.write_text(''.join(f'{a} {b}\n' for a, b in anchors))
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ValueError('The handoff render exceeded its time budget.')
    try:
        process = subprocess.run([shutil.which('rubberband') or 'rubberband', '-q', '-3', '--no-threads',
                        '--ignore-clipping', '--time', format(total / source_frames, '.17g'),
                        '--timemap', str(map_file), str(input_file), str(output_file)],
                       capture_output=True, check=True, timeout=remaining)
    except (subprocess.SubprocessError, OSError) as error:
        raise ValueError('The pitch-preserving handoff render failed or exceeded its time budget.') from error
    messages = process.stderr.decode(errors='replace')
    if 'NaN or Inf' in messages or 'no time stretch will happen' in messages:
        raise ValueError('The tempo renderer could not honour the timing map; handoff refused.')
    audio, sample_rate = sf.read(output_file, dtype='float32', always_2d=True)
    if abs(audio.shape[0] - total) > 2:
        raise ValueError(f'The tempo renderer returned {audio.shape[0]} frames for {total} planned; handoff refused.')
    if (sample_rate != STEM_SR or audio.shape[1] != 2 * len(STEMS) or not np.isfinite(audio).all()
            or float(np.max(np.abs(audio))) >= .999):
        raise ValueError('The tempo renderer returned invalid length, level or audio.')
    if len(audio) < total:
        audio = np.pad(audio, ((0, total - len(audio)), (0, 0)), mode='edge')
    audio = audio[:total].T / scale
    return {name: audio[2 * index:2 * index + 2] for index, name in enumerate(STEMS)}


def mix_handoff(out_parts, in_parts, sources, plan, candidate, gains, mix_style, scratch, deadline):
    """Render the same stem envelopes, then match both ends to original audio."""
    import numpy as np
    from subbeats_cue_preview import insert_incoming_drum_loop, mix_passages
    from subbeats_vocals import measure_vocals
    from subbeats_vocal_confidence import assess_pair, shift_lyrics
    timing = candidate['timing']
    first, entry = timing['outgoingStartSample'], timing['incomingEntryFrame']
    incoming_vocals = measure_vocals(in_parts, STEM_SR)
    loop = timing.get('loop')
    loop_plan = None
    if loop:
        loop_plan = dict(startSeconds=loop['startSample'] / STEM_SR, loopSeconds=loop['lengthSamples'] / STEM_SR,
                         repeats=loop['repeats'], bars=2)
        start, stop = loop_plan['startSeconds'], loop_plan['startSeconds'] + loop_plan['loopSeconds']
        if any(p['startSeconds'] < stop and p['endSeconds'] > start for p in incoming_vocals['passages']):
            raise ValueError('The selected drum loop contains measured vocal activity.')
        in_parts = insert_incoming_drum_loop(in_parts, loop_plan)
    outgoing_vocals = measure_vocals(out_parts, STEM_SR, first / STEM_SR)
    if candidate['originalLeadInSeconds']:
        outgoing_vocals['unmeasuredUntilSeconds'] = first / STEM_SR + candidate['originalLeadInSeconds']
    evidence = candidate.get('lyricEvidence') or [None, None]
    vocal = assess_pair(outgoing_vocals, measure_vocals(in_parts, STEM_SR), plan,
                        evidence[0], shift_lyrics(evidence[1], loop_plan) if loop_plan else evidence[1])
    if vocal['status'] == 'conflict':
        raise ValueError('The actual audio has a supported lyric conflict. Choose another handoff plan.')
    incoming = stretch_parts(in_parts, timing, scratch, deadline)
    levels = [10 ** (gain / 20) for gain in gains]
    live_plan = dict(plan, first=first / STEM_SR,
                     entry=(first + entry) / STEM_SR,
                     handover=(first + timing['handoverFrame']) / STEM_SR,
                     out_end=(first + timing['outgoingEndFrame']) / STEM_SR,
                     end=(first + timing['clipFrames']) / STEM_SR)
    if loop_plan:
        live_plan['incoming_loop'] = loop_plan
    audio, _ = mix_passages({name: part * levels[0] for name, part in out_parts.items()},
                            {name: part * levels[1] for name, part in incoming.items()},
                            live_plan, mix_style, normalize=False, edges=False)
    # No preview edge fade or whole-clip attenuation. The first and last seam
    # guards contain the actual decoded source at station gain, sample for sample.
    guard = round(.3 * STEM_SR)
    join = round(.25 * STEM_SR)
    ramp = (.5 - .5 * np.cos(np.linspace(0, np.pi, join))).astype(np.float32)
    start_original = sources[0][:, first:first + guard + join] * levels[0]
    if start_original.shape[1] != guard + join or entry < guard + join:
        raise ValueError('Insufficient outgoing original-audio seam guard.')
    audio[:, :guard] = start_original[:, :guard]
    audio[:, guard:guard + join] = start_original[:, guard:] * (1 - ramp) + audio[:, guard:guard + join] * ramp
    native_start = timing['releaseEndFrame']
    native_frames = timing['clipFrames'] - native_start
    resume = timing['incomingResumeSample']
    original = sources[1][:, resume - native_frames:resume] * levels[1]
    if original.shape[1] != native_frames or native_frames < join + guard:
        raise ValueError('Insufficient incoming original-audio seam guard.')
    audio[:, native_start:native_start + join] = audio[:, native_start:native_start + join] * (1 - ramp) + original[:, :join] * ramp
    audio[:, native_start + join:] = original[:, join:]
    if not np.isfinite(audio).all() or audio.shape != (2, timing['clipFrames']):
        raise ValueError('Invalid complete handoff audio.')
    return audio, vocal


def render_handoff(req, folders, records, gains, fetch_source):
    from subbeats_cues import load_cues
    from subbeats_cue_preview import choose_cue, passage_plan
    from subbeats_cue_matching import live_handoff_timing
    from subbeats_preview import load_region
    from subbeats_reference_preview import source_audio
    import numpy as np
    if req.get('reference') or req.get('window_plan') or req.get('bar_shift'):
        raise ValueError('Complete handoffs require saved cue plans.')
    handoff = req['handoff']
    candidate = handoff['candidate']
    coverage = req.get('_cue_coverage')
    if not coverage or not all(coverage):
        raise ValueError('Complete handoffs require saved stem coverage; no separation is performed.')
    points = [load_cues(req['state_dir'], req.get('stems_root'), req['track_ids'][i], req['cue_keys'][i], folders[i]) for i in range(2)]
    outgoing = choose_cue(points[0], 'outgoing', candidate['outgoingCueIndex'])
    incoming = choose_cue(points[1], 'incoming', candidate['incomingCueIndex'])
    durations = [point['durationSeconds'] for point in points]
    if (outgoing.get('timingValidated') is False or incoming.get('timingValidated') is False
            or outgoing['sourceSeconds'] < durations[0] * .5):
        raise ValueError('The selected saved cues are not valid for this handoff.')
    plan = passage_plan(outgoing, incoming, *durations)
    loop = candidate['timing'].get('loop')
    loop_plan = dict(startSeconds=loop['startSample'] / STEM_SR, loopSeconds=loop['lengthSamples'] / STEM_SR,
                     repeats=loop['repeats']) if loop else None
    timing = live_handoff_timing(plan, incoming['bpm'], loop_plan)
    if timing != candidate['timing'] or handoff.get('version') != VERSION:
        raise ValueError('The handoff timing no longer matches the saved cues.')
    urls = req.get('source_urls')
    if not fetch_source or not isinstance(urls, list) or len(urls) != 2:
        raise ValueError('Complete handoffs need both original recordings for source verification and seam matching.')
    sources = [source_audio(urls[i], folders[i], records[i], fetch_source, require_reference=True,
                            reference_regions=[coverage[i], (folders[i], records[i])]) for i in range(2)]
    first = timing['outgoingStartSample']
    region = next(r for r in coverage[0][1]['metadata']['stem_regions'] if r['name'] == 'exit')
    available = max(first, region['start_sample'])
    out_parts, _ = load_region(*coverage[0], 'exit', start_seconds=available / STEM_SR,
                               end_seconds=durations[0], limit_seconds=130, require_tempo=False)
    if available > first:
        prefix = sources[0][:, first:available]
        # Blend the reconstructed stems into the original prefix at its end.
        seam = min(round(.03 * STEM_SR), out_parts['vocals'].shape[1])
        ramp = np.linspace(0, 1, seam)
        for name in STEMS:
            out_parts[name][:, :seam] *= ramp
        out_parts['vocals'][:, :seam] += sources[0][:, available:available + seam] * (1 - ramp)
        out_parts = {name: np.concatenate([prefix if name == 'vocals' else np.zeros_like(prefix), part], axis=1)
                     for name, part in out_parts.items()}
    incoming_parts, _ = load_region(*coverage[1], 'head', start_seconds=0,
        end_seconds=timing['incomingResumeSample'] / STEM_SR, limit_seconds=130, require_tempo=False)
    # Recompute the lead-in from actual files, not the controller's metadata.
    candidate = dict(candidate, originalLeadInSeconds=max(0, available - first) / STEM_SR,
                     lyricEvidence=req.get('lyric_evidence'))
    parent = Path(req['state_dir']) / 'subbeats' / 'previews'
    with tempfile.TemporaryDirectory(prefix='.handoff-', dir=parent) as work:
        audio, vocal = mix_handoff(out_parts, incoming_parts, sources, plan, candidate, gains,
                                   req.get('mix_style', 'long-blend'), Path(work), time.monotonic() + 180)
    events = [dict(at=0., label='Outgoing original audio'),
              dict(at=timing['incomingEntryFrame'] / STEM_SR, label='Incoming opening begins'),
              dict(at=timing['handoverFrame'] / STEM_SR, label='Stem handover'),
              dict(at=timing['outgoingEndFrame'] / STEM_SR, label='Outgoing recording finishes'),
              dict(at=timing['releaseStartFrame'] / STEM_SR, label='Incoming tempo release begins'),
              dict(at=timing['releaseEndFrame'] / STEM_SR, label='Incoming reaches native tempo'),
              dict(at=(timing['releaseEndFrame'] + round(.25 * STEM_SR)) / STEM_SR, label='Incoming original audio matched'),
              dict(at=timing['clipFrames'] / STEM_SR, label='Resume original incoming recording')]
    timeline = dict(kind='subbeats-handoff', mixStyle=req.get('mix_style', 'long-blend'),
                    duration=timing['clipFrames'] / STEM_SR, vocal=vocal, events=sorted(events, key=lambda e: e['at']),
                    handoff=dict(version=VERSION, timing=timing, evidenceFingerprint=handoff['evidenceFingerprint'],
                                 sourceVerified=True, renderReady=False, engine=cache_identity(timing)['engine']))
    return audio, dict(timeline=timeline, used_models=False, method='handoff', native_tempo_return=True,
                       gains_db=gains, peak_db=float(20 * np.log10(max(1e-12, np.max(np.abs(audio))))))
