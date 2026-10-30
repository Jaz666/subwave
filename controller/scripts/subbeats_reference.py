"""Read-only audit of annotated compilation tracks; no automatic phrase origin.

Development references are local to this evaluation, never production overrides.
Quarter-note fits check tempo only; the owner's resolve point anchors the window.
"""
import argparse
import json
from pathlib import Path

from subbeats_cache import cached_entry
from subbeats_preview import kick_grid, load_region


def windows(resolve, bars, period):
    if type(resolve) not in (int, float) or not 0 < resolve < 1200:
        raise ValueError('Invalid annotated resolve time')
    if not bars or any(type(b) is not int or b not in (4, 8, 16, 32) for b in bars):
        raise ValueError('Invalid annotated intro lengths')
    if not .25 <= period <= 1:
        raise ValueError('Invalid measured beat period')
    return [{'bars': b, 'start_seconds': resolve - b * 4 * period, 'end_seconds': resolve}
            for b in bars]


def grids(parts, seed):
    """Test the existing tempo plus common octave and 3:4 tracking aliases.

    A successful fit needs a sustained quarter-note kick train; tempo proposals
    alone are not evidence. Keep ambiguous alternatives rather than hiding them.
    """
    for beats in (64, 16):
        results = []
        for bpm in (seed, seed * 4/3, seed * 3/4, seed * 2, seed / 2):
            if not 90 <= bpm <= 180:
                continue
            try:
                origin, period = kick_grid(parts['drums'], bpm, beats=beats)
            except ValueError:
                continue
            if all(abs(period / item['period'] - 1) > .03 for item in results):
                results.append({'origin': origin, 'period': period, 'bpm': 60 / period,
                                'support_beats': beats})
        if results:
            return results
    return []


def covers(regions, start, end):
    return any(r['start_sample'] / r['sample_rate'] <= start
               and end <= r['end_sample'] / r['sample_rate'] for r in regions)


def audit(state_dir, references):
    root = Path(state_dir) / 'subbeats'
    jobs = json.loads((root / 'queue.json').read_text())['jobs']
    rows = []
    for ref in references['tracks']:
        job = next((j for j in jobs if j['id'] == ref['id'] and j['status'] == 'prepared'), None)
        if job is None:
            raise ValueError(f"Reference track is not prepared: {ref['title']}")
        folder = root / 'v1' / job['bundleKey']
        identity = json.loads((folder / 'manifest.json').read_text())['identity']
        record = cached_entry(folder, identity)
        if record is None:
            raise ValueError(f"Prepared bundle failed integrity checks: {ref['title']}")
        analysis = json.loads((folder / 'analysis.json').read_text())
        regions = record['metadata']['stem_regions']
        parts, seed = load_region(folder, record, 'head')
        fits = grids(parts, seed)
        del parts
        proposals = []
        if len(fits) <= 1:
            period = fits[0]['period'] if fits else 60 / ref.get('confirmed_bpm', seed)
            for window in windows(ref['intro_resolve_seconds'], ref['intro_lengths_bars'], period):
                first, end = window['start_seconds'], window['end_seconds']
                proposals.append({**window, 'near_source_edge': first < 0,
                    'mix_stems_covered': first >= 0 and covers(regions, first, end),
                    'followthrough_stems_covered': first >= 0 and covers(regions, first, min(analysis['duration_seconds'], end + 8)),
                    'needs_listening_alignment': True})
        nearest = min(analysis['regions'], key=lambda r: abs((r['start_seconds'] + r['end_seconds']) / 2 - ref['outro_seconds']))
        rows.append({'reference': ref, 'bundle_key': job['bundleKey'], 'duration_seconds': analysis['duration_seconds'],
                     'head_analysis_bpm': seed, 'kick_tempo_candidates': fits,
                     'intro_tempo_verified': len(fits) == 1,
                     'confirmed_bpm_error': (fits[0]['bpm'] - ref['confirmed_bpm']) if len(fits) == 1 and 'confirmed_bpm' in ref else None,
                     'outro_analysis_bpm': nearest['bpm'],
                     'intro_windows': proposals,
                     'natural_outro_seconds': analysis['duration_seconds'] - ref['outro_seconds'],
                     'natural_outro_stems_covered': covers(regions, ref['outro_seconds'], analysis['duration_seconds']),
                     'cached_regions': [{'name': r['name'], 'start': r['start_sample']/r['sample_rate'],
                                         'end': r['end_sample']/r['sample_rate']} for r in regions]})
    return {'timing_source': references['timing_source'], 'phrase_origin_assumed': False, 'tracks': rows}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state-dir', type=Path, required=True)
    parser.add_argument('--references', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(audit(args.state_dir, json.loads(args.references.read_text())), indent=2, allow_nan=False))
