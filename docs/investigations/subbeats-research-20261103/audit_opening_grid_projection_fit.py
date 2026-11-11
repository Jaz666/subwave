#!/usr/bin/env python3
"""Check whether each proposed opening grid stays aligned to its cached beats."""
import argparse
import json
from pathlib import Path

import numpy as np


def nearest_errors(beats, origin, bpm, end):
    period = 60 / bpm
    expected = origin + np.arange(max(0, int((end - origin) / period) + 1)) * period
    indices = np.searchsorted(beats, expected)
    right = np.minimum(indices, len(beats) - 1)
    left = np.maximum(indices - 1, 0)
    nearest = np.where(np.abs(beats[left] - expected) <= np.abs(beats[right] - expected), left, right)
    return expected, beats[nearest] - expected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-map', type=Path, required=True)
    parser.add_argument('--audit', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    sources = {item['id']: item for item in json.loads(args.source_map.read_text())}
    audit = json.loads(args.audit.read_text())
    results = []
    for record in audit['records']:
        if record['status'] not in ('candidate', 'control'):
            continue
        source = sources[record['id']]
        grid_file = (Path('/stems') / record['id'] / 'subbeats' / 'v1'
                     / source['cue_artifact'] / 'grid.json')
        grid = json.loads(grid_file.read_text())
        beats = np.asarray(grid['beatsSeconds'], dtype=float)
        cues = record['proposed_incoming'] if record['status'] == 'candidate' else record['saved_incoming']
        origin = cues[0]['phraseStartSeconds']
        bpm = cues[0]['bpm']
        end = max(cue['sourceSeconds'] for cue in cues)
        expected, errors = nearest_errors(beats, origin, bpm, end)
        midpoint = origin + 32 * 60 / bpm
        early = errors[expected < midpoint]
        late = errors[(expected >= midpoint) & (expected <= end)]
        results.append({
            'id': record['id'], 'artist': record['artist'], 'title': record['title'],
            'kind': record['status'], 'method': record.get('method'), 'bpm': bpm,
            'grid_origin_seconds': origin,
            'cue_markers': [{'bar': cue.get('phraseBars', cue.get('barNumber')),
                             'seconds': cue['sourceSeconds']} for cue in cues],
            'projected_beat_count': int(len(expected)),
            'fraction_within_50ms_of_cached_beat': float(np.mean(np.abs(errors) <= .05)),
            'p95_abs_error_ms': float(np.percentile(np.abs(errors), 95) * 1000),
            'max_abs_error_ms': float(np.max(np.abs(errors)) * 1000),
            'median_signed_error_first_half_ms': float(np.median(early) * 1000) if len(early) else None,
            'median_signed_error_second_half_ms': float(np.median(late) * 1000) if len(late) else None,
        })
    results.sort(key=lambda row: (row['kind'] != 'candidate', row['artist'].casefold(), row['title'].casefold()))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({
        'method': 'Nearest cached Beat This! beat to every constant-BPM beat projected from the cue grid origin through its last proposed marker.',
        'interpretation_limit': 'This checks internal model-grid agreement only; it does not establish audible beat or phrase truth.',
        'results': results,
    }, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    for item in results:
        print(item['kind'], item['artist'], item['title'],
              f"p95={item['p95_abs_error_ms']:.0f}ms",
              f"halves={item['median_signed_error_first_half_ms']:.0f}/{item['median_signed_error_second_half_ms']:.0f}ms")


if __name__ == '__main__':
    main()
