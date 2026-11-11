#!/usr/bin/env python3
"""Inspect local Beat This! tempo continuity and independent audio onsets."""
import argparse
import json
from pathlib import Path

import librosa
import numpy as np

IDS = {
    '3zyBz3oQt9FRTgonfRrZ47', '6wckYgzaDkE8maAGaQo4OC',
    '4uQNaRzdfCCZ68Tz7EoSCB', '0KUsUv7L4BrgKe6WC2EXrM',
}


def local_windows(beats):
    rows = []
    for start in range(0, len(beats) - 31, 4):
        times = beats[start:start + 32]
        period, origin = np.polyfit(np.arange(32), times, 1)
        residual = np.abs(times - (origin + period * np.arange(32))) * 1000
        if np.percentile(residual, 95) <= 45 and times[0] < 45:
            rows.append({
                'start_seconds': float(times[0]), 'end_seconds': float(times[-1]),
                'bpm': float(60 / period),
                'p95_fit_error_ms': float(np.percentile(residual, 95)),
            })
    return rows


def onset_grid_scores(onset, origin, bpm, hop_seconds, beats=64):
    """Compare a fixed opening phase across nearby constant tempo hypotheses."""
    tested = [bpm * (1 + offset) for offset in (-.015, -.01, -.005, 0, .005, .01, .015)]
    tested.extend(float(x) for x in np.arange(bpm * .98, bpm * 1.0201, bpm * .0002))
    tested = sorted(set(round(value, 6) for value in tested))
    beat_numbers = np.arange(beats)
    scores = []
    radius = 5
    for candidate_bpm in tested:
        times = origin + beat_numbers * 60 / candidate_bpm
        frames = np.rint(times / hop_seconds).astype(int)
        values = [np.max(onset[max(0, f - radius):min(len(onset), f + radius + 1)])
                  for f in frames if f < len(onset)]
        if len(values) >= beats * .8:
            scores.append((float(np.median(values)), candidate_bpm))
    scores.sort(reverse=True)
    base_score = next(score for score, rate in scores if abs(rate - bpm) < .0001)
    best_score, best_bpm = scores[0]
    return {
        'metric': 'median percussive onset strength within +/-50ms of each projected beat; opening phase held fixed',
        'beat_count': beats, 'selected_bpm_score': base_score,
        'best_local_bpm': best_bpm, 'best_local_score': best_score,
        'best_score_gain_fraction': (best_score / base_score - 1) if base_score else None,
        'nearby_top': [{'bpm': rate, 'score': score} for score, rate in scores[:5]],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-map', type=Path, required=True)
    parser.add_argument('--audit', type=Path, required=True)
    parser.add_argument('--fusion-results', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()

    sources = {item['id']: item for item in json.loads(args.source_map.read_text())}
    audit = {item['id']: item for item in json.loads(args.audit.read_text())['records']}
    evidence = {item['id']: item for item in json.loads(args.fusion_results.read_text())['records']}
    results = []
    for track_id in sorted(IDS):
        record = audit[track_id]
        ev = evidence[track_id]['selected_evidence']
        cue = record['proposed_incoming'][0]
        grid_path = (Path('/stems') / track_id / 'subbeats' / 'v1'
                     / sources[track_id]['cue_artifact'] / 'grid.json')
        grid = json.loads(grid_path.read_text())
        beats = np.asarray(grid['beatsSeconds'], dtype=float)
        duration = 60
        source_path = Path('/compilations') / sources[track_id]['audio_path'].removeprefix('/compilations/')
        audio, sr = librosa.load(source_path, sr=22050, mono=True, duration=duration)
        hop = 220
        percussive = librosa.effects.percussive(audio, margin=3, hop_length=hop)
        onset = librosa.onset.onset_strength(y=percussive, sr=sr, hop_length=hop)
        windows = local_windows(beats)
        segments = []
        for start, end in ((0, 16), (16, 35), (30, 45)):
            section = beats[(beats >= start) & (beats < end)]
            intervals = np.diff(section)
            segments.append({
                'start_seconds': start, 'end_seconds': end,
                'beat_count': int(len(section)),
                'median_interval_bpm': float(60 / np.median(intervals)) if len(intervals) else None,
                'mean_interval_bpm': float(60 / np.mean(intervals)) if len(intervals) else None,
            })
        results.append({
            'id': track_id, 'artist': record['artist'], 'title': record['title'],
            'route_method': record['method'], 'route_bpm': cue['bpm'],
            'route_origin_seconds': cue['phraseStartSeconds'],
            'route_cues': [{'bar': x['phraseBars'], 'seconds': x['sourceSeconds']}
                           for x in record['proposed_incoming']],
            'selected_beat_this_window': ev['beat_this_window_seconds'],
            'selected_window_bpm': ev['beat_this_bpm'],
            'selected_window_p95_ms': ev['beat_this_fit_p95_ms'],
            'librosa_supported_region': ev['librosa_support_seconds'],
            'librosa_bpm': ev['librosa_bpm'],
            'local_beat_this_windows_first_45s': windows,
            'raw_grid_segment_tempo': segments,
            'fixed_phase_onset_grid_search_first_16_bars': onset_grid_scores(
                onset, cue['phraseStartSeconds'], cue['bpm'], hop / sr),
        })
        print(f"{record['artist']} — {record['title']}: selected {cue['bpm']:.3f} BPM; "
              f"{len(windows)} locally stable overlapping windows in the first 45s", flush=True)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({
        'scope': 'Read-only review of the four owner-flagged opening previews.',
        'beat_this_window': '32 beats stepped by 4; retained only windows with p95 linear-fit residual <=45ms.',
        'librosa_onset_probe': 'On the exact source mix after percussive separation; hypothesis score only, not ground truth.',
        'results': results,
    }, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


if __name__ == '__main__':
    main()
