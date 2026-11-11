#!/usr/bin/env python3
"""Evaluate a shadow-only passage-stability review gate on saved audit results."""
import argparse
import json
from pathlib import Path
import statistics


HERE = Path(__file__).resolve().parent
CHILDREN_ID = "7bfhXAe5NRn4ZGopPSY0WZ"
TEMPO_FEEDBACK_IDS = {
    "3zyBz3oQt9FRTgonfRrZ47",  # Justice — D.A.N.C.E.
    "4uQNaRzdfCCZ68Tz7EoSCB",  # Lovestation — Teardrops
    "0KUsUv7L4BrgKe6WC2EXrM",  # Sash! — Encore une fois
}
PHRASE_FEEDBACK_IDS = {"6wckYgzaDkE8maAGaQo4OC"}  # Lonyo — Summer of Love


def read_json(path):
    return json.loads(path.read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fit-audit", type=Path,
                        default=HERE / "beat-this-opening-grid-fit-audit-2026-11-05.json")
    parser.add_argument("--diagnostic", type=Path,
                        default=HERE / "beat-this-opening-grid-feedback-diagnostic-2026-11-05.json")
    parser.add_argument("--output", type=Path,
                        default=HERE / "beat-this-opening-grid-stability-rule-audit-2026-11-05.json")
    parser.add_argument("--threshold-ms", type=float, default=50)
    args = parser.parse_args()

    fit = read_json(args.fit_audit)["results"]
    diagnostic = {row["id"]: row for row in read_json(args.diagnostic)["results"]}
    threshold = args.threshold_ms
    records = []
    for row in fit:
        is_children = row["id"] == CHILDREN_ID
        passed = row["p95_abs_error_ms"] <= threshold
        if is_children:
            disposition = "separate-backprojection-path"
        else:
            disposition = "stable" if passed else "review"
        records.append({
            "id": row["id"], "artist": row["artist"], "title": row["title"],
            "kind": row["kind"], "route_method": row.get("method"),
            "p95_abs_error_ms": row["p95_abs_error_ms"],
            "second_half_median_error_ms": row["median_signed_error_second_half_ms"],
            "disposition": disposition,
            "owner_tempo_feedback": row["id"] in TEMPO_FEEDBACK_IDS,
            "owner_phrase_feedback": row["id"] in PHRASE_FEEDBACK_IDS,
        })

    candidates = [row for row in records if row["kind"] == "candidate"]
    forward_controls = [row for row in records
                        if row["kind"] == "control" and row["disposition"] != "separate-backprojection-path"]
    review_candidates = [row for row in candidates if row["disposition"] == "review"]
    extra_reviews = [row for row in review_candidates if not row["owner_tempo_feedback"]]
    controls_pass = all(row["disposition"] == "stable" for row in forward_controls)

    rolling = []
    for track_id in sorted(TEMPO_FEEDBACK_IDS | PHRASE_FEEDBACK_IDS):
        row = diagnostic[track_id]
        windows = row["local_beat_this_windows_first_45s"]
        first = windows[0]
        later = [window["bpm"] for window in windows
                 if window["start_seconds"] >= first["end_seconds"]]
        rolling.append({
            "id": track_id, "artist": row["artist"], "title": row["title"],
            "feedback_type": "phrase-placement" if track_id in PHRASE_FEEDBACK_IDS else "tempo",
            "selected_first_window_bpm": first["bpm"],
            "first_window_end_seconds": first["end_seconds"],
            "nonoverlapping_later_window_count": len(later),
            "later_window_median_bpm": statistics.median(later) if later else None,
            "later_window_min_bpm": min(later) if later else None,
            "later_window_max_bpm": max(later) if later else None,
            "later_median_change_percent": (
                (statistics.median(later) / first["bpm"] - 1) * 100 if later else None
            ),
            "fixed_phase_audio_onset_best_bpm": row["fixed_phase_onset_grid_search_first_16_bars"]["best_local_bpm"],
        })

    threshold_sweep = []
    for value in (35, 45, 50, 60, 75, 100, 150, 200, 250, 300, 400):
        threshold_sweep.append({
            "threshold_ms": value,
            "candidate_pass": sum(row["p95_abs_error_ms"] <= value for row in candidates),
            "candidate_total": len(candidates),
            "control_pass_excluding_children_backprojection": sum(
                row["p95_abs_error_ms"] <= value for row in forward_controls
            ),
            "forward_control_total": len(forward_controls),
        })

    result = {
        "scope": "Offline shadow evaluation only; no audio, cues, stems, or station state changed.",
        "metric": "95th percentile of each proposed constant-BPM beat's distance to the nearest cached Beat This! beat timestamp across the full proposed passage.",
        "interpretation_limit": "Internal passage consistency only. The cached beat grid is not independent musical ground truth, and a stable beat grid does not verify arrangement phrase or natural-release placement.",
        "threshold_ms": threshold,
        "candidate_summary": {
            "stable": sum(row["disposition"] == "stable" for row in candidates),
            "review": len(review_candidates),
            "review_tracks": [f'{row["artist"]} — {row["title"]}' for row in review_candidates],
            "review_tracks_without_specific_owner_correction": [
                f'{row["artist"]} — {row["title"]}' for row in extra_reviews
            ],
            "owner_tempo_cases_flagged": sum(row["owner_tempo_feedback"] and row["disposition"] == "review"
                                              for row in candidates),
            "owner_tempo_cases_total": sum(row["owner_tempo_feedback"] for row in candidates),
            "owner_phrase_case_disposition": next(
                row["disposition"] for row in candidates if row["owner_phrase_feedback"]
            ),
        },
        "control_summary": {
            "forward_controls_stable": sum(row["disposition"] == "stable" for row in forward_controls),
            "forward_controls_total": len(forward_controls),
            "all_forward_controls_pass": controls_pass,
            "children": {
                "disposition": "separate-backprojection-path",
                "p95_abs_error_ms": next(row["p95_abs_error_ms"] for row in records
                                          if row["id"] == CHILDREN_ID),
                "reason": "Its known accepted 16-bar cue is counted backwards from the first driving beat through a beatless intro; the full-origin nearest-beat metric penalizes the unmeasured intro.",
            },
        },
        "threshold_sweep": threshold_sweep,
        "flagged_track_window_diagnostics": rolling,
        "records": records,
        "conclusion": "This coarse 50 ms whole-origin gate catches all three owner-reported tempo cases and leaves Lonyo's steady-grid phrase error in the stable bucket, but it also flags two candidates whose later cue regions are stable. Do not use it as a track-wide rejection. The follow-up per-marker audit is more selective for 16-bar cues: its final 8-bar window flags exactly those three tempo cases. Four forward controls pass; Children must retain a distinct back-projection route.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    print(f"threshold={threshold:g}ms: {result['candidate_summary']['stable']}/{len(candidates)} candidates stable; "
          f"{len(review_candidates)} review; forward controls {result['control_summary']['forward_controls_stable']}/{len(forward_controls)} pass; "
          f"Children={result['control_summary']['children']['disposition']}")
    for row in review_candidates:
        print(f"review: {row['artist']} — {row['title']} ({row['p95_abs_error_ms']:.0f}ms p95)")


if __name__ == "__main__":
    main()
