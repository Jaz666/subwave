"""Pure CPU planner checks; no model, station, real cache or audio dependencies."""
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch
import numpy as np
import subbeats_preview as preview


class PreviewTests(unittest.TestCase):
    def test_sustained_quarters_fit_and_outgoing_selects_latest_full_run(self):
        peaks = 4 + np.arange(100) * .5
        incoming = preview.fit_grid(peaks, 120, 55)
        outgoing = preview.fit_grid(peaks, 120, 55, True)
        self.assertAlmostEqual(incoming[0], 4)
        self.assertAlmostEqual(incoming[1], .5)
        self.assertGreater(outgoing[0], incoming[0])
        self.assertLessEqual(outgoing[0] + outgoing[1] * 64, 55)

    def test_short_and_half_time_patterns_are_declined(self):
        for peaks in (np.arange(10) * .5, np.arange(50), np.array([])):
            with self.assertRaisesRegex(ValueError, 'sustained'):
                preview.fit_grid(peaks, 120, 55)

    def test_mix_has_four_bar_vocal_gap_and_fixed_headroom(self):
        with patch.object(preview, 'STEM_SR', 1000):
            out = {s: np.full((2, 45000), 1 if s == 'vocals' else 0, dtype=np.float32) for s in preview.STEMS}
            inc = {s: np.full((2, 60000), 1 if s == 'vocals' else 0, dtype=np.float32) for s in preview.STEMS}
            audio = preview.mix_preview(out, inc, 8, 0, .5)
            self.assertTrue(np.isfinite(audio).all())
            self.assertLessEqual(float(np.abs(audio).max()), .981)
            self.assertEqual(float(np.abs(audio[:, 9000:15000]).max()), 0)
            self.assertGreater(float(audio[:, 22000:24000].mean()), .9)
            with self.assertRaisesRegex(ValueError, 'loop'):
                preview.mix_preview(out, inc, 4, 5, .5)
            short = {s: a[:, :2000] for s, a in inc.items()}
            with self.assertRaisesRegex(ValueError, 'coverage'):
                preview.mix_preview(out, short, 8, 0, .5)

    def test_cached_gain_is_restored_and_bad_gain_declined(self):
        region = {'name': 'head', 'start_sample': 0, 'end_sample': 100, 'storage_gain': .5}
        record = {'metadata': {'stem_regions': [region]},
                  'files': {f'head-{s}.flac': {} for s in preview.STEMS}}
        fake = types.SimpleNamespace(read=lambda *a, **k: (np.full((100, 2), .25, dtype=np.float32), 44100),
            info=lambda _: types.SimpleNamespace(samplerate=44100, channels=2, frames=100))
        with tempfile.TemporaryDirectory() as tmp, patch.dict('sys.modules', {'soundfile': fake}):
            folder = Path(tmp)
            (folder / 'analysis.json').write_text(json.dumps({'supported_regions': [
                {'start_seconds': 0, 'end_seconds': 1, 'bpm': 120}]}))
            parts, bpm = preview.load_region(folder, record, 'head')
            self.assertEqual(bpm, 120)
            self.assertEqual(float(parts['drums'].max()), .5)
            region['storage_gain'] = 0
            with self.assertRaisesRegex(ValueError, 'level'):
                preview.load_region(folder, record, 'head')


if __name__ == '__main__':
    unittest.main()
