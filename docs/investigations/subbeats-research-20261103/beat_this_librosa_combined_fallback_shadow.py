#!/usr/bin/env python3
"""Test a conservative low-frequency fitter with an onset-based fallback."""
import argparse
import json
from pathlib import Path
import sys

import librosa
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'controller' / 'scripts'))
from subbeats_cues import fitted_passages
from subbeats_prepare import HOP, SR, decode
from beat_this_librosa_onset_shadow import infer_phrase, same_markers, tempo_match


def run(manifest, previous, output):
    previous_by_id = {r['id']: r for r in previous['records']}
    records = []
    for item in manifest:
        prior = previous_by_id[item['id']]
        evidence = prior['selected_evidence']
        grid_path = (Path('/stems') / item['id'] / 'subbeats' / 'v1'
                     / item['cue_artifact'] / 'grid.json')
        grid = json.loads(grid_path.read_text())
        beats = np.asarray(grid['beatsSeconds'], dtype=float)
        downbeats = np.asarray(grid['downbeatsSeconds'], dtype=float)
        audio = decode(Path(item['audio_path']), SR, 1)[0]
        duration = len(audio) / SR
        fitted = fitted_passages(audio, SR, beats, downbeats)
        base_match = (tempo_match(evidence['librosa_bpm'], fitted['grid']['bpm'])
                      if evidence and fitted['grid'] else None)
        base_ok = bool(base_match and base_match['relative_error'] <= .02
                       and evidence['beat_this_chain_coverage'] >= .7
                       and not evidence['earlier_bar_phase_conflict'])
        base_incoming = fitted['incoming'] if base_ok else []
        onset_phrase = None
        onset_match = None
        method = 'current-fitter' if base_incoming else 'unresolved'
        reason = None

        if item['target'] and not base_incoming:
            if not evidence or evidence['earlier_bar_phase_conflict']:
                reason = ('no tempo-supported Beat This! grid' if not evidence
                          else 'earlier stable Beat This! windows used a different bar phase')
            else:
                percussive = librosa.effects.percussive(audio, margin=3, hop_length=HOP)
                onset = librosa.onset.onset_strength(y=percussive, sr=SR, hop_length=HOP)
                onset_phrase, onset_reason = infer_phrase(beats, downbeats, onset, duration)
                onset_match = (tempo_match(evidence['librosa_bpm'], onset_phrase['grid']['bpm'])
                               if onset_phrase else None)
                onset_ok = bool(onset_match and onset_match['relative_error'] <= .02
                    and evidence['beat_this_chain_coverage'] >= .7)
                if onset_ok:
                    base_incoming = onset_phrase['incoming']
                    method = 'librosa-onset-fallback'
                else:
                    reason = onset_reason or 'fallback grid lacked matching Librosa support'

        if item['target']:
            proposals = base_incoming if base_ok or method == 'librosa-onset-fallback' else []
            status = 'candidate' if proposals else 'unresolved'
            if not proposals and reason is None:
                reason = 'neither entry method produced a supported incoming passage'
            control_match = None
        else:
            proposals = fitted['incoming'] if base_ok else []
            status = 'control'
            reason = 'fitted markers compared with saved regression cues'
            control_match = same_markers(proposals, item['current_incoming'])

        record = {
            'id': item['id'], 'artist': item['artist'], 'title': item['title'],
            'target': item['target'], 'expected_beat_seconds': item.get('expected_beat_seconds'),
            'status': status, 'method': method, 'reason': reason,
            'base_librosa_tempo_match': base_match, 'base_fitted_grid': fitted['grid'],
            'onset_librosa_tempo_match': onset_match,
            'onset_fallback': onset_phrase,
            'proposed_incoming': proposals, 'saved_incoming': item['current_incoming'],
            'saved_markers_reproduced': control_match,
        }
        records.append(record)
        print(json.dumps(record, ensure_ascii=False, separators=(',', ':'), allow_nan=False), flush=True)

    targets = [r for r in records if r['target']]
    controls = [r for r in records if not r['target']]
    summary = {
        'method': 'current low-frequency phrase fitter, then Librosa percussion-onset fallback',
        'targets': len(targets),
        'candidate_targets': sum(r['status'] == 'candidate' for r in targets),
        'unresolved_targets': sum(r['status'] == 'unresolved' for r in targets),
        'controls': len(controls),
        'controls_reproducing_saved_markers': sum(bool(r['saved_markers_reproduced']) for r in controls),
        'records': records,
        'caveat': 'Hypothetical cues only; no prepared cues were changed.'
    }
    output.write_text(json.dumps(summary, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--previous-results', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(json.loads(args.manifest.read_text()), json.loads(args.previous_results.read_text()), args.output)


if __name__ == '__main__':
    main()
