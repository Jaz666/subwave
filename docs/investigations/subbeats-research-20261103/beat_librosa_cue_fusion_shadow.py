#!/usr/bin/env python3
"""Offline shadow check: cached Beat This! grids against Librosa support.

This experiment does not write Sub/Beats state or approve cues. It accepts a
manifest of original audio paths and cached cue artifact keys, runs the
existing full-recording Librosa analysis, and reports only hypothetical
incoming arrival markers where both analyses support one continuous grid.
"""
import argparse
import json
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'controller' / 'scripts'))
from subbeats_prepare import analyze


def beat_windows(beats, downbeats, *, width=32, step=4):
    """Return locally straight Beat This! beat runs with a stable 4-beat phase."""
    beats = np.asarray(beats, dtype=float)
    downbeats = np.asarray(downbeats, dtype=float)
    downbeat_indices = np.searchsorted(beats, downbeats)
    valid = downbeat_indices < len(beats)
    downbeat_indices = downbeat_indices[valid]
    matched_downbeats = downbeats[valid]
    downbeat_indices = downbeat_indices[
        np.abs(beats[downbeat_indices] - matched_downbeats) < .02
    ]
    windows = []
    for start in range(0, len(beats) - width + 1, step):
        times = beats[start:start + width]
        period, origin = np.polyfit(np.arange(width), times, 1)
        residual = np.abs(times - (origin + period * np.arange(width)))
        if not 60 <= 60 / period <= 190 or np.percentile(residual, 95) > .045:
            continue
        intervals = np.diff(times) / period
        if np.mean(np.abs(intervals - 1) < .2) < .9:
            continue
        local_downbeats = downbeat_indices[
            (downbeat_indices >= start) & (downbeat_indices < start + width)
        ]
        if len(local_downbeats) < 5:
            continue
        phases, counts = np.unique(local_downbeats % 4, return_counts=True)
        winner = int(np.argmax(counts))
        phase_support = float(counts[winner] / len(local_downbeats))
        if phase_support < .75:
            continue
        windows.append({
            'start_index': start,
            'end_index': start + width - 1,
            'start_seconds': float(times[0]),
            'end_seconds': float(times[-1]),
            'bpm': float(60 / period),
            'p95_error_ms': float(np.percentile(residual, 95) * 1000),
            'downbeat_phase': int(phases[winner]),
            'downbeat_phase_support': phase_support,
        })
    return windows, downbeat_indices


def tempo_relation(a, b):
    """Return the closest direct/half/double-time comparison."""
    choices = [(abs(a / (b * factor) - 1), factor) for factor in (.5, 1., 2.)]
    error, factor = min(choices)
    return {'relative_error': float(error), 'librosa_per_beat_this': factor}


def match_region(windows, regions, beats):
    matches = []
    by_start = {window['start_index']: window for window in windows}
    for window in windows:
        for region in regions:
            if region['end_seconds'] < window['end_seconds']:
                continue
            relation = tempo_relation(region['bpm'], window['bpm'])
            if relation['relative_error'] > .02:
                continue
            overlap = max(0., min(window['end_seconds'], region['end_seconds'])
                          - max(window['start_seconds'], region['start_seconds']))
            window_length = max(.001, window['end_seconds'] - window['start_seconds'])
            overlap_fraction = overlap / window_length
            # Librosa may corroborate a quiet opening from a later sustained
            # section. Beat This! must carry one stable cadence and bar phase
            # from the proposed opening through that support.
            region_end = int(np.searchsorted(beats, region['end_seconds']))
            expected = list(range(window['start_index'], max(window['start_index'] + 1,
                region_end - 31), 4))
            chain = []
            for start in expected:
                candidate = by_start.get(start)
                if candidate is None:
                    continue
                local_tempo = tempo_relation(candidate['bpm'], window['bpm'])
                if (local_tempo['librosa_per_beat_this'] == 1.
                        and local_tempo['relative_error'] <= .02
                        and candidate['downbeat_phase'] == window['downbeat_phase']
                        and candidate['downbeat_phase_support'] >= .75):
                    chain.append(candidate)
            chain_coverage = len(chain) / max(1, len(expected))
            chain_gaps = [b['start_index'] - a['start_index']
                          for a, b in zip(chain, chain[1:])]
            if (chain_coverage < .7 or len(chain) < 1
                    or any(gap > 8 for gap in chain_gaps)):
                continue
            earlier_phases = [prior for prior in windows
                if prior['start_index'] < window['start_index']
                and prior['downbeat_phase'] != window['downbeat_phase']
                and tempo_relation(prior['bpm'], window['bpm'])['librosa_per_beat_this'] == 1.
                and tempo_relation(prior['bpm'], window['bpm'])['relative_error'] <= .02]
            phase_conflict = len(earlier_phases) >= 3
            matches.append({
                'window': window,
                'region': region,
                'overlap_fraction': overlap_fraction,
                'chain_windows': len(chain),
                'chain_coverage': chain_coverage,
                'chain_start_seconds': chain[0]['start_seconds'],
                'chain_end_seconds': chain[-1]['end_seconds'],
                'earlier_bar_phase_conflict': phase_conflict,
                **relation,
            })
    matches.sort(key=lambda m: (
        m['window']['start_seconds'],
        m['relative_error'],
        m['librosa_per_beat_this'] != 1.,
        -m['window']['downbeat_phase_support'],
        -m['overlap_fraction'],
        m['region']['start_seconds'],
    ))
    return matches


def shadow_arrivals(beats, downbeats, match, duration):
    """Project 8/16-bar markers from the earliest stable grid phase."""
    window = match['window']
    period = 60 / window['bpm']
    phase = window['downbeat_phase']
    indices = np.searchsorted(beats, downbeats)
    exact = ((indices < len(beats))
             & (np.abs(beats[np.minimum(indices, len(beats) - 1)] - downbeats) < .02))
    phase_downbeats = downbeats[exact & (indices % 4 == phase)]
    before = phase_downbeats[
        (indices[exact & (indices % 4 == phase)] >= window['start_index'])
        & (indices[exact & (indices % 4 == phase)] <= window['end_index'])
    ]
    if not len(before):
        return None, 'stable opening window has no downbeat at its supported bar phase'
    origin = float(before[0])
    fit_fraction = float(match['chain_coverage'])
    arrivals = []
    for bars in (8, 16):
        seconds = origin + bars * 4 * period
        if seconds + 8 * period < duration and seconds < 130 - 16 * 1.08 - .05:
            arrivals.append({
                'phrase_bars': bars,
                'phrase_start_seconds': origin,
                'source_seconds': seconds,
                'bpm': window['bpm'],
                'grid_fit_fraction': fit_fraction,
                'phrase_verified': False,
            })
    return arrivals, None if arrivals else 'no complete 8/16-bar passage within cue bounds'


def run(manifest, out, work):
    import librosa

    records = []
    for index, item in enumerate(manifest):
        grid_path = (Path('/stems') / item['id'] / 'subbeats' / 'v1'
                     / item['cue_artifact'] / 'grid.json')
        grid = json.loads(grid_path.read_text())
        beats = np.asarray(grid['beatsSeconds'], dtype=float)
        downbeats = np.asarray(grid['downbeatsSeconds'], dtype=float)
        if (not len(beats) or not len(downbeats) or not np.isfinite(beats).all()
                or not np.isfinite(downbeats).all() or np.any(np.diff(beats) <= 0)):
            raise ValueError(f"invalid cached Beat This! grid for {item['artist']} — {item['title']}")

        stage = work / f'{index:02d}'
        stage.mkdir(parents=True, exist_ok=True)
        analysis = analyze(Path(item['audio_path']), stage, librosa)
        windows, _ = beat_windows(beats, downbeats)
        matches = match_region(windows, analysis['supported_regions'], beats)
        selected = matches[0] if matches else None
        if item['target']:
            if selected and selected['earlier_bar_phase_conflict']:
                arrivals, reason = None, 'earlier stable Beat This! windows used a different bar phase'
            else:
                arrivals, reason = shadow_arrivals(beats, downbeats, selected, analysis['duration_seconds']) if selected else (None, 'no continuous tempo-supported grid')
            status = 'candidate' if arrivals else 'unresolved'
        else:
            arrivals = item['current_incoming']
            reason = 'existing cue list retained as the regression control'
            status = 'control'

        record = {
            'id': item['id'], 'artist': item['artist'], 'title': item['title'],
            'target': item['target'], 'expected_beat_seconds': item.get('expected_beat_seconds'),
            'librosa_status': analysis['status'],
            'librosa_supported_regions': len(analysis['supported_regions']),
            'beat_this_windows': len(windows),
            'status': status,
            'control_evidence_ok': (bool(selected) and bool(item['current_incoming'])) if not item['target'] else None,
            'reason': reason,
            'selected_evidence': None if selected is None else {
                'beat_this_bpm': selected['window']['bpm'],
                'beat_this_window_seconds': [selected['window']['start_seconds'], selected['window']['end_seconds']],
                'beat_this_fit_p95_ms': selected['window']['p95_error_ms'],
                'downbeat_phase_support': selected['window']['downbeat_phase_support'],
                'librosa_bpm': selected['region']['bpm'],
                'librosa_support_seconds': [selected['region']['start_seconds'], selected['region']['end_seconds']],
                'librosa_onset_support': selected['region']['onset_support'],
                'tempo_relation': selected['librosa_per_beat_this'],
                'relative_tempo_error': selected['relative_error'],
                'overlap_fraction': selected['overlap_fraction'],
                'beat_this_chain_seconds': [selected['chain_start_seconds'], selected['chain_end_seconds']],
                'beat_this_chain_windows': selected['chain_windows'],
                'beat_this_chain_coverage': selected['chain_coverage'],
                'earlier_bar_phase_conflict': selected['earlier_bar_phase_conflict'],
            },
            'shadow_arrivals': arrivals,
            'saved_incoming': item['current_incoming'],
        }
        records.append(record)
        print(json.dumps({k: record[k] for k in (
            'artist', 'title', 'target', 'status', 'reason', 'selected_evidence', 'shadow_arrivals'
        )}, ensure_ascii=False, separators=(',', ':')), flush=True)
        for path in stage.iterdir():
            path.unlink()
        stage.rmdir()

    targets = [r for r in records if r['target']]
    controls = [r for r in records if not r['target']]
    result = {
        'method': 'cached Beat This! small0 grid + existing Librosa supported regions',
        'window_beats': 32, 'window_step_beats': 4,
        'max_local_timing_error_ms_p95': 45,
        'max_relative_tempo_error': .02,
        'tempo_aliases_allowed': [.5, 1., 2.],
        'required_downbeat_phase_support': .75,
        'minimum_grid_chain_coverage': .7,
        'targets': len(targets),
        'candidate_targets': sum(r['status'] == 'candidate' for r in targets),
        'unresolved_targets': sum(r['status'] == 'unresolved' for r in targets),
        'controls': len(controls),
        'controls_with_both_signals_and_saved_cues': sum(
            r['control_evidence_ok'] is True for r in controls
        ),
        'records': records,
        'caveat': 'Shadow markers are hypotheses, not saved cues or mix approvals.',
    }
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--work-dir', type=Path, required=True)
    args = parser.parse_args()
    result = run(json.loads(args.manifest.read_text()), args.output, args.work_dir)
    print(json.dumps({k: result[k] for k in (
        'targets', 'candidate_targets', 'unresolved_targets', 'controls'
    )}))


if __name__ == '__main__':
    main()
