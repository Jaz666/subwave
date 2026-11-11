#!/usr/bin/env python3
"""Run the current incoming phrase fitter on cached Beat This! grids offline.

This second shadow pass reuses Librosa evidence from the first experiment. It
does not write prepared cues, station state, stems, or application data.
"""
import argparse
import json
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'controller' / 'scripts'))
from subbeats_cues import fitted_passages
from subbeats_prepare import SR, decode


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


def run(manifest, previous, out):
    previous_by_id = {record['id']: record for record in previous['records']}
    records = []
    for item in manifest:
        previous_record = previous_by_id[item['id']]
        grid_path = (Path('/stems') / item['id'] / 'subbeats' / 'v1'
                     / item['cue_artifact'] / 'grid.json')
        grid = json.loads(grid_path.read_text())
        beats = np.asarray(grid['beatsSeconds'], dtype=float)
        downbeats = np.asarray(grid['downbeatsSeconds'], dtype=float)
        audio = decode(Path(item['audio_path']), SR, 1)[0]
        fitted = fitted_passages(audio, SR, beats, downbeats)
        evidence = previous_record['selected_evidence']
        match = (tempo_match(evidence['librosa_bpm'], fitted['grid']['bpm'])
                 if evidence and fitted['grid'] else None)
        tempo_ok = bool(match and match['relative_error'] <= .02
                        and evidence['beat_this_chain_coverage'] >= .7)

        if item['target']:
            incoming = fitted['incoming'] if tempo_ok else []
            status = 'candidate' if incoming else 'unresolved'
            reason = None if incoming else (
                'phrase fitter found no eligible incoming passage' if not fitted['incoming']
                else 'fitted phrase grid lacked matching Librosa support')
        else:
            incoming = item['current_incoming']
            status = 'control'
            reason = 'existing cue list retained as the regression control'

        records.append({
            'id': item['id'], 'artist': item['artist'], 'title': item['title'],
            'target': item['target'], 'expected_beat_seconds': item.get('expected_beat_seconds'),
            'status': status, 'reason': reason,
            'librosa_tempo_match': match, 'librosa_support_ok': tempo_ok,
            'fitted_grid': fitted['grid'], 'fitted_incoming': fitted['incoming'],
            'proposed_incoming': incoming,
            'saved_incoming': item['current_incoming'],
        })
        print(json.dumps({k: records[-1][k] for k in (
            'artist', 'title', 'target', 'status', 'reason', 'librosa_tempo_match',
            'fitted_grid', 'proposed_incoming')}, ensure_ascii=False,
            separators=(',', ':'), allow_nan=False), flush=True)

    targets = [r for r in records if r['target']]
    controls = [r for r in records if not r['target']]
    result = {
        'method': 'current fitted_passages on cached Beat This! grids; Librosa tempo cross-check',
        'targets': len(targets),
        'candidate_targets': sum(r['status'] == 'candidate' for r in targets),
        'unresolved_targets': sum(r['status'] == 'unresolved' for r in targets),
        'controls': len(controls),
        'controls_with_grid_and_librosa_support': sum(
            r['librosa_support_ok'] and bool(r['fitted_grid']) for r in controls
        ),
        'controls_reproducing_saved_markers': sum(
            same_markers(r['fitted_incoming'], r['saved_incoming']) for r in controls
        ),
        'records': records,
        'caveat': 'Hypothetical incoming passages only; no prepared cues were changed.',
    }
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--previous-results', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(json.loads(args.manifest.read_text()),
        json.loads(args.previous_results.read_text()), args.output)


if __name__ == '__main__':
    main()
