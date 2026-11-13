"""Cache-only regular Stem Blend auditions; observe the upstream render, never retune it."""
import math
from pathlib import Path
import shutil
import tempfile

import numpy as np
import soundfile as sf


def level(audio):
    rms = float(np.sqrt(np.mean(np.asarray(audio, dtype=np.float64) ** 2)))
    return round(20 * math.log10(rms), 2) if rms > 0 else None


def render_preview(req):
    import analyze_worker as worker

    mode = req.get('mode', 'mix')
    if mode not in ('mix', 'clip', 'outgoing', 'incoming'):
        raise ValueError('Choose a valid audition mode.')
    # Do not let the Sub/Beats coverage fallback turn this baseline into a
    # different experiment. Only regular head/tail files are accepted.
    specs = {role: {key: value for key, value in req[role].items()
                    if key not in ('subbeats_bundle_dir', 'subbeats_bundle_key')}
             for role in ('out', 'in')}
    root = Path(req['state_dir']) / 'stem-blend-previews'
    root.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='audition-', dir=root))
    observed = {}
    try:
        result = worker.render_transition({**specs, 'out_dir': str(stage),
                                           'clip_name': 'transition.wav'}, observe=observed.update)
        if not result.get('ok'):
            raise ValueError(f"Regular Stem Blend unavailable: {result.get('error', 'render failed')}.")
        sr = worker.DEMUCS_SR
        clip, _ = sf.read(result['path'], dtype='float32', always_2d=True)
        Path(result['path']).unlink()
        outgoing, incoming = observed['outgoing'], observed['incoming']
        # The observer receives the contributions before the renderer's 10ms
        # edge declick. Apply it to solos too, at their actual (unnormalised) gain.
        e = max(1, int(.01 * sr))
        ramp = np.linspace(0, 1, e, dtype=np.float32)[:, None]
        for audio in (outgoing, incoming):
            audio[:e] *= ramp
            audio[-e:] *= ramp[::-1]
        before = after = 0
        audio = {'clip': clip, 'outgoing': outgoing, 'incoming': incoming}.get(mode)
        if mode == 'mix':
            tail = sum(observed['tail'].values()) * 10 ** (observed['gains_db'][0] / 20)
            head = sum(observed['head'].values()) * 10 ** (observed['gains_db'][1] / 20)
            start = int((result['blend_start_sec'] - observed['tail_start']) * sr)
            end = len(clip)
            seam = int(.3 * sr)
            if start < 0 or start + seam > len(tail) or end > len(head):
                raise ValueError('Cached stems do not cover the audition seams.')
            before = min(6 * sr, start)
            after = min(6 * sr, len(head) - end)
            fade = np.linspace(0, 1, seam, dtype=np.float32)[:, None]
            audio = np.concatenate([
                tail[start-before:start],
                tail[start:start+seam] * (1-fade) + clip[:seam] * fade,
                clip[seam:-seam],
                clip[-seam:] * (1-fade) + head[end-seam:end] * fade,
                head[end:end+after],
            ])
        warnings = []
        bars = observed['bars']
        loop_seconds = observed['loop_end'] - observed['loop_start']
        if any(abs(loop_seconds / (b-a) - 1) > .15 for a, b in zip(bars[:4], bars[1:5])):
            warnings.append('The source drum bar differs from the incoming bar length by more than 15%. Upstream retriggers or truncates this loop; it does not time-stretch it.')
        bar_levels = []
        for a, b in zip(bars[:4], bars[1:5]):
            sl = slice(int(a * sr), int(b * sr))
            old, new = level(outgoing[sl]), level(incoming[sl])
            difference = round(old-new, 2) if old is not None and new is not None else None
            bar_levels.append({'startSec': a, 'endSec': b, 'outgoingDb': old,
                               'incomingDb': new, 'differenceDb': difference})
        if any(row['outgoingDb'] is None or (row['differenceDb'] is not None and row['differenceDb'] < -24)
               for row in bar_levels[:3]):
            warnings.append('The outgoing drums are silent or more than 24 dB below the incoming music in a carry bar. This is a listening flag, not a new playback veto.')
        if observed['loop_duck'] < .999:
            warnings.append('The renderer reduced the borrowed drums to protect peak headroom.')
        if np.max(np.abs(audio)) > 1:
            warnings.append('The reconstructed context exceeds full scale. The WAV uses floating-point samples to preserve the measured levels; audition at a lower player volume.')
        report = {
            'version': 1, 'mode': mode, 'clipSec': result['clip_sec'],
            'beforeSec': before / sr, 'afterSec': after / sr, 'durationSec': len(audio) / sr,
            'blendStartSec': result['blend_start_sec'],
            'loopStartSec': observed['loop_start'], 'loopEndSec': observed['loop_end'],
            'carryStartSec': bars[0], 'incomingDrumsSec': observed['incoming_drums'],
            'loopSourceRmsDb': level(observed['tail']['drums'][
                int((observed['loop_start'] - observed['tail_start']) * sr):
                int((observed['loop_end'] - observed['tail_start']) * sr)]),
            'loopDuckDb': round(20 * math.log10(observed['loop_duck']), 2),
            'wholeGainDb': round(20 * math.log10(observed['whole_scale']), 2),
            'gainsDb': observed['gains_db'], 'barLevels': bar_levels, 'warnings': warnings,
        }
        path = stage / 'preview.wav'
        sf.write(path, audio, sr, format='WAV', subtype='FLOAT')
        return {'ok': True, 'stem_blend_preview': str(path), 'stem_blend_report': report}
    except BaseException:
        shutil.rmtree(stage)
        raise
