#!/usr/bin/env python3
"""Small shadow prototype: Beat This! grid plus Librosa percussion onsets.

It tests whether onset evidence can anchor an incoming phrase when the current
fitter's sustained low-frequency gate is too restrictive. It writes no cues.
"""
import argparse
import json
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'controller' / 'scripts'))
from subbeats_prepare import HOP, SR, decode


def tempo_match(a, b):
    choices = [(abs(a / (b * factor) - 1), factor) for factor in (.5, 1., 2.)]
    error, factor = min(choices)
    return {'relative_error': float(error), 'librosa_per_grid_beat': factor}


def same_markers(actual, expected, tolerance=.05):
    if len(actual) != len(expected):
        return False
    remaining = list(actual)
    for cue in expected:
        index = next((i for i, other in enumerate(remaining)
            if other.get('phraseBars') == cue.get('phraseBars')
            and abs(other['sourceSeconds'] - cue['sourceSeconds']) <= tolerance), None)
        if index is None:
            return False
        remaining.pop(index)
    return not remaining


def infer_phrase(beats, downbeats, onset, duration):
    beats = np.asarray(beats, dtype=float)
    downbeats = np.asarray(downbeats, dtype=float)
    if len(beats) < 64 or len(downbeats) < 8 or not len(onset):
        return None, 'insufficient grid or onset coverage'
    steps = np.diff(beats)
    median = float(np.median(steps))
    period = float(np.mean(steps[np.abs(steps / median - 1) < .2]))
    if not 60 <= 60 / period <= 190:
        return None, 'grid tempo outside supported range'

    hop_seconds = HOP / SR
    onset = np.asarray(onset, dtype=float)
    early = np.zeros(len(beats))
    late = np.zeros(len(beats))
    for i, at in enumerate(beats):
        first = max(0, int(at / hop_seconds))
        early_stop = min(len(onset), first + max(1, round(.16 / hop_seconds)))
        late_first = min(len(onset), first + round(.55 * period / hop_seconds))
        late_stop = min(len(onset), first + round(.9 * period / hop_seconds))
        if first < len(onset):
            early[i] = float(np.max(onset[first:early_stop]))
        if late_first < late_stop:
            late[i] = float(np.max(onset[late_first:late_stop]))
    reference = float(np.percentile(early, 75))
    if reference < 1e-5:
        return None, 'no measurable Librosa onset support'
    strong = (early >= reference * .5) & (early - late >= reference * .1)
    beat_indices = np.searchsorted(beats, downbeats)
    exact = ((beat_indices < len(beats))
             & (np.abs(beats[np.minimum(beat_indices, len(beats) - 1)] - downbeats) < .02))
    entry = None
    for at, index in zip(downbeats[exact], beat_indices[exact]):
        if (index + 16 <= len(beats) and strong[index]
                and np.mean(strong[index:index + 16]) >= .85
                and np.mean(np.abs(np.diff(beats[index:index + 16]) / period - 1) < .2) >= .85):
            entry = float(at)
            break
    if entry is None:
        return None, 'no sustained onset-supported downbeat'

    anchor = entry
    if entry < 16 * period:
        earlier = downbeats[(downbeats <= entry)
            & (np.abs((entry - downbeats) / (4 * period)
                      - np.rint((entry - downbeats) / (4 * period))) < .08)]
        if len(earlier):
            anchor = float(earlier[0])
    fit = beats[beats >= anchor]
    for _ in range(5):
        ordinals = np.rint((fit - anchor) / period)
        good = np.abs(fit - (anchor + ordinals * period)) < .06
        if good.sum() < 64 or np.dot(ordinals[good], ordinals[good]) == 0:
            return None, 'onset anchor does not fit a continuous Beat This! grid'
        period = float(np.dot(ordinals[good], fit[good] - anchor)
                       / np.dot(ordinals[good], ordinals[good]))
    residual = np.abs(fit - (anchor + np.rint((fit - anchor) / period) * period))
    good = residual < .06
    if not 60 <= 60 / period <= 190 or np.mean(good) < .85:
        return None, 'Beat This! timing fit failed after onset anchoring'

    bars_before = max(0, round((anchor - float(downbeats[0])) / (4 * period)))
    origin = anchor - bars_before * 4 * period
    if bars_before > 16:
        origin += ((bars_before - 16) // 4) * 16 * period
    if origin < 0:
        origin += 4 * period
    bpm = 60 / period
    arrivals = []
    for width in (16, 8):
        at = origin + width * 4 * period
        index = int(np.clip(np.searchsorted(beats, at), 0, len(beats) - 1))
        if (at + 8 * period < duration and at < 130 - 16 * 1.08 - .05
                and (at >= entry - .1 or entry < 16 * period or early[index] >= reference * .5)):
            arrivals.append({
                'sourceSeconds': float(at), 'bpm': float(bpm), 'phraseBars': width,
                'phraseStartSeconds': float(origin), 'drivingBeatSeconds': float(entry),
                'onset_support_fraction': float(np.mean(good)),
                'phrase_verified': False,
            })
    if entry - origin >= 32 * period and entry < 130 - 16 * 1.08 - .05:
        if all(abs(entry - point['sourceSeconds']) > .1 for point in arrivals):
            arrivals.insert(0, {'sourceSeconds': entry, 'bpm': float(bpm),
                'phraseStartSeconds': float(origin), 'drivingBeatSeconds': float(entry),
                'onset_support_fraction': float(np.mean(good)), 'phrase_verified': False})
    grid = {'originSeconds': float(origin), 'anchorSeconds': float(anchor),
            'drivingBeatSeconds': float(entry), 'bpm': float(bpm),
            'beat_fit_fraction': float(np.mean(good)),
            'onset_reference': reference}
    return {'grid': grid, 'incoming': arrivals}, None if arrivals else 'no eligible arrival within cue bounds'


def run(manifest, previous, selected_ids, output):
    import librosa
    previous_by_id = {record['id']: record for record in previous['records']}
    records = []
    for item in manifest:
        if selected_ids and item['id'] not in selected_ids:
            continue
        prior = previous_by_id[item['id']]
        grid_path = (Path('/stems') / item['id'] / 'subbeats' / 'v1'
                     / item['cue_artifact'] / 'grid.json')
        grid = json.loads(grid_path.read_text())
        beats = np.asarray(grid['beatsSeconds'], dtype=float)
        downbeats = np.asarray(grid['downbeatsSeconds'], dtype=float)
        audio = decode(Path(item['audio_path']), SR, 1)[0]
        percussive = librosa.effects.percussive(audio, margin=3, hop_length=HOP)
        onset = librosa.onset.onset_strength(y=percussive, sr=SR, hop_length=HOP)
        duration = len(audio) / SR
        phrase, reason = infer_phrase(beats, downbeats, onset, duration)
        evidence = prior['selected_evidence']
        match = (tempo_match(evidence['librosa_bpm'], phrase['grid']['bpm'])
                 if evidence and phrase else None)
        support_ok = bool(match and match['relative_error'] <= .02
                          and evidence['beat_this_chain_coverage'] >= .7
                          and not evidence['earlier_bar_phase_conflict'])
        if item['target']:
            proposals = phrase['incoming'] if support_ok else []
            status = 'candidate' if proposals else 'unresolved'
            if not proposals and reason is None:
                reason = 'phase conflict or insufficient Librosa tempo support'
        else:
            proposals = phrase['incoming'] if phrase and support_ok else []
            status = 'control'
            reason = 'inferred markers compared with the saved regression cues'
        record = {'id': item['id'], 'artist': item['artist'], 'title': item['title'],
            'target': item['target'], 'expected_beat_seconds': item.get('expected_beat_seconds'),
            'status': status, 'reason': reason, 'librosa_tempo_match': match,
            'librosa_support_ok': support_ok, 'phrase': phrase,
            'proposed_incoming': proposals, 'saved_incoming': item['current_incoming'],
            'saved_markers_reproduced': (same_markers(proposals, item['current_incoming'])
                if not item['target'] else None)}
        records.append(record)
        print(json.dumps(record, ensure_ascii=False, separators=(',', ':'), allow_nan=False), flush=True)
    controls = [r for r in records if not r['target']]
    output.write_text(json.dumps({'method': 'cached Beat This! grid + Librosa percussion onset anchoring',
        'controls_reproducing_saved_markers': sum(r['saved_markers_reproduced'] for r in controls),
        'controls': len(controls), 'records': records,
        'caveat': 'Small selected-set hypothesis test; no cue changes.'},
        ensure_ascii=False, indent=2, allow_nan=False) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--previous-results', type=Path, required=True)
    parser.add_argument('--ids', nargs='*', default=[])
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(json.loads(args.manifest.read_text()), json.loads(args.previous_results.read_text()),
        set(args.ids), args.output)


if __name__ == '__main__':
    main()
