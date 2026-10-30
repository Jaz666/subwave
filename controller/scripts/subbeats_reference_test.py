"""Reference annotations guide time windows, never absolute screen bar numbers."""
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch
import numpy as np
from subbeats_cache import prepare_cached
from subbeats_preview import fit_grid
from subbeats_reference import audit, grids, windows


class ReferenceTests(unittest.TestCase):
    def test_whole_window_works_back_from_timestamp_and_accepts_long_options(self):
        self.assertEqual(windows(68, [16, 32], .5), [
            {'bars': 16, 'start_seconds': 36, 'end_seconds': 68},
            {'bars': 32, 'start_seconds': 4, 'end_seconds': 68}])
        self.assertLess(windows(27, [16], 60/136.5)[0]['start_seconds'], 0,
                        'near-edge annotations are flagged, not silently clamped or declared shortened')
        for args in [(True, [16], .5), (float('nan'), [16], .5), (27, [15], .5), (27, [], .5)]:
            with self.assertRaises(ValueError): windows(*args)

    def test_alias_check_uses_kicks_and_prefers_longer_evidence(self):
        def fitted(_drums, bpm, beats=64):
            if abs(bpm-140.3) < .01: return .2, 60/140.3
            if beats == 16: return .2, 60/bpm
            raise ValueError('not a sustained quarter-note pattern')
        with patch('subbeats_reference.kick_grid', side_effect=fitted):
            found = grids({'drums': 'unused'}, 140.3 * .75)
        self.assertEqual(len(found), 1)
        self.assertAlmostEqual(found[0]['bpm'], 140.3)
        self.assertEqual(found[0]['support_beats'], 64)

    def test_short_tempo_probe_is_explicit_and_default_preview_fit_is_unchanged(self):
        peaks = .1 + np.arange(20) * .5
        with self.assertRaisesRegex(ValueError, 'sustained'): fit_grid(peaks, 120, 10)
        self.assertAlmostEqual(fit_grid(peaks, 120, 10, beats=16)[1], .5)
        for count in (0, 12, True):
            with self.assertRaises(ValueError): fit_grid(peaks, 120, 10, beats=count)

    def test_eight_annotations_preserve_estimates_and_confirmed_madagascar_tempo(self):
        data = json.loads((Path(__file__).resolve().parents[2] / 'docs/internals/subbeats-reference-tracks.json').read_text())
        self.assertEqual(len(data['tracks']), 8)
        diving = next(t for t in data['tracks'] if t['title'] == 'Diving Faces')
        self.assertEqual((diving['intro_resolve_seconds'], diving['estimated_intro_bar_count'], diving['intro_lengths_bars']), (27, 15, [16]))
        madagascar = next(t for t in data['tracks'] if t['artist'] == 'Art of Trance')
        self.assertEqual(madagascar['confirmed_bpm'], 140.3)
        self.assertTrue(madagascar['earlier_resolves_possible'])
        self.assertEqual(madagascar['intro_resolve_seconds'], 96)

    def test_audit_is_read_only_and_screen_bar_estimate_does_not_move_window(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            def build(stage):
                (stage/'analysis.json').write_text(json.dumps({'duration_seconds': 100,
                    'regions': [{'start_seconds':0,'end_seconds':99,'bpm':120}]}))
                return {'stem_regions':[{'name':'head','start_sample':0,'end_sample':68000,'sample_rate':1000},
                                        {'name':'exit','start_sample':60000,'end_sample':95000,'sample_rate':1000}]}
            bundle = prepare_cached(state, {'source_sha256':'test'}, build)
            queue = state/'subbeats/queue.json';queue.write_text(json.dumps({'jobs':[{'id':'test','status':'prepared','bundleKey':Path(bundle['directory']).name}]}))
            refs = {'timing_source':'owner', 'tracks':[{'id':'test','title':'test','intro_resolve_seconds':41,
                    'intro_lengths_bars':[16],'estimated_intro_bar_count':24,'outro_seconds':80}]}
            snapshot = {p:p.read_bytes() for p in state.rglob('*') if p.is_file()}
            with patch('subbeats_reference.load_region', return_value=({'drums':None},120)), \
                    patch('subbeats_reference.grids', return_value=[{'origin':.1,'period':.5,'bpm':120,'support_beats':64}]):
                before = audit(state, refs)['tracks'][0]
                refs['tracks'][0]['estimated_intro_bar_count'] = 999
                after = audit(state, refs)['tracks'][0]
            self.assertEqual(before['intro_windows'], after['intro_windows'])
            self.assertFalse(after['natural_outro_stems_covered'])
            self.assertEqual(snapshot, {p:p.read_bytes() for p in state.rglob('*') if p.is_file()})


if __name__ == '__main__': unittest.main()
