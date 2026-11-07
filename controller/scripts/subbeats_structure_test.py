"""Numerical landmark checks, no audio models or user-library writes."""
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch
import numpy as np
import subbeats_cache as cache
import subbeats_structure as structure


class StructureTests(unittest.TestCase):
    def test_back_projection_counts_full_bars_without_approving_the_intro(self):
        result = structure.project_intro_grid(8, 120)
        self.assertEqual(result['beat_times'], list(np.arange(0, 8.5, .5)))
        self.assertEqual(result['bar_start_candidates'], [0, 2, 4, 6, 8])
        self.assertEqual(result['complete_bar_candidates'], 4)
        self.assertEqual(result['leading_partial_bar_seconds'], 0)
        self.assertFalse(result['timing_verified'])
        self.assertFalse(result['phrase_verified'])
        partial = structure.project_intro_grid(9, 120)
        self.assertEqual(partial['bar_start_candidates'][0], 1)
        self.assertEqual(partial['leading_partial_bar_seconds'], 1)
        self.assertEqual(partial['complete_bar_candidates'], 4)
        bounded = structure.project_intro_grid(9, 120, 2)
        self.assertTrue(all(t >= 2 for t in bounded['beat_times']))
        for anchor, bpm, start in [(1, 0, 0), (float('nan'), 120, 0), (1, 120, 2), (1201, 120, 0)]:
            with self.assertRaises(ValueError):
                structure.project_intro_grid(anchor, bpm, start)

    def test_late_grid_entry_survives_without_before_context_or_novelty(self):
        times = np.arange(22.8, 68, .46)
        runs = [{'start_seconds': 22.8, 'end_seconds': 52, 'bpm': 130},
                {'start_seconds': 30.2, 'end_seconds': 60, 'bpm': 130},
                {'start_seconds': 37.5, 'end_seconds': 67, 'bpm': 130}]
        entries = structure.grid_entries(times, runs[::-1])
        self.assertEqual(len(entries), 1, 'sliding windows are not separate entrances')
        self.assertEqual(entries[0]['at_seconds'], 22.8)
        self.assertEqual(entries[0]['supported_until_seconds'], 67)
        self.assertEqual(entries[0]['confidence'], 'unverified')
        self.assertEqual(entries[0]['bar_alignment'], 'unverified')
        self.assertFalse(entries[0]['phrase_verified'])
        self.assertFalse(entries[0]['mix_ready'])

    def test_grid_entries_require_measured_support_and_preserve_real_gaps(self):
        times = [0, .5, 1, 10, 10.5, 11]
        runs = [{'start_seconds': 0, 'end_seconds': 1, 'bpm': 120},
                {'start_seconds': 9.9, 'end_seconds': 11, 'bpm': 120},
                {'start_seconds': 20, 'end_seconds': 22, 'bpm': 120}]
        self.assertEqual([e['at_seconds'] for e in structure.grid_entries(times, runs)], [0, 10])
        self.assertEqual(structure.grid_entries(times, []), [])
        self.assertEqual(structure.grid_entries([], runs), [])
        with self.assertRaises(ValueError):
            structure.grid_entries([1, 0], runs)
        with self.assertRaises(ValueError):
            structure.grid_entries(times, [{'start_seconds': 2, 'end_seconds': 1}])

    def features(self, n=512):
        return (np.arange(n) * .5, np.full((4, n), -25.),
                np.full((8, n), 1/8), np.full((12, n), 1 / np.sqrt(12)))

    def test_retain_arrivals_and_releases_throughout_recording(self):
        times, energy, spectrum, chroma = self.features()
        energy[:, 64:200] += 12
        energy[:, 300:450] += 12
        candidates = structure.landmarks(times, energy, spectrum, chroma,
            [{'start_seconds': 0, 'end_seconds': 255}])
        for i, reason in [(64, 'energy_arrival'), (200, 'energy_release'),
                          (300, 'energy_arrival'), (450, 'energy_release')]:
            self.assertTrue(any(abs(c['beat_index'] - i) <= 1 and reason in c['evidence'] for c in candidates))
        self.assertTrue(any(32 < c['at_seconds'] < 224 for c in candidates), 'search beyond first/last 16 bars')
        self.assertEqual([c['at_seconds'] for c in candidates], sorted(c['at_seconds'] for c in candidates))
        self.assertTrue(all(not c['phrase_verified'] and not c['mix_ready'] for c in candidates))

    def test_harmonic_change_without_volume_change_and_no_invented_silent_or_steady_landmarks(self):
        times, energy, spectrum, chroma = self.features()
        self.assertEqual(structure.landmarks(times, energy, spectrum, chroma, []), [])
        chroma[:] = 0; chroma[0, :200] = 1; chroma[7, 200:] = 1
        candidates = structure.landmarks(times, energy, spectrum, chroma, [])
        self.assertTrue(any(abs(c['beat_index'] - 200) <= 1 and 'harmonic_change' in c['evidence'] for c in candidates))
        self.assertTrue(all(c['confidence'] == 'low' and not c['beat_supported'] for c in candidates))
        energy[:] = -100
        self.assertEqual(structure.landmarks(times, energy, spectrum, chroma, []), [])

    def test_nearby_release_and_arrival_are_kept_separate(self):
        times, energy, spectrum, chroma = self.features()
        energy[:, 200:204] -= 12  # A short fill before the part returns.
        candidates = structure.landmarks(times, energy, spectrum, chroma, [])
        self.assertTrue(any(c['beat_index'] == 200 and 'energy_release' in c['evidence'] for c in candidates))
        self.assertTrue(any(c['beat_index'] == 204 and 'energy_arrival' in c['evidence'] for c in candidates))

    def test_short_input_and_bad_features(self):
        self.assertEqual(structure.landmarks(*self.features(8), []), [])
        times, energy, spectrum, chroma = self.features()
        for bad in [np.zeros(len(times)), times + np.nan, times[::-1]]:
            with self.assertRaisesRegex(ValueError, 'features'):
                structure.landmarks(bad, energy, spectrum, chroma, [])
        energy[0, 0] = np.inf
        with self.assertRaisesRegex(ValueError, 'features'):
            structure.landmarks(times, energy, spectrum, chroma, [])

    def test_independent_cpu_cache_reuses_rhythm_and_preserves_stems(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); source = root / 'source'; source.write_bytes(b'original')
            def build(stage):
                (stage / 'analysis.json').write_text(json.dumps({'duration_seconds': 256,
                    'supported_regions': [{'start_seconds': 0, 'end_seconds': 255}]}))
                np.savez_compressed(stage / 'rhythm.npz', beat_times=np.arange(512) * .5)
                (stage / 'head-drums.flac').write_bytes(b'keep')
                return {'stem_regions': [{'name': 'head'}]}
            old = cache.prepare_cached(root, {'source_sha256': cache.digest(source)}, build)
            bundle = Path(old['directory']); before = (bundle / 'manifest.json').read_bytes()
            times, energy, spectrum, chroma = self.features(); energy[:, 200:] += 12
            with patch.dict('sys.modules', {'librosa': types.SimpleNamespace(__version__='test')}), \
                    patch('subbeats_prepare.decode', return_value=np.zeros((1, 256 * structure.SR), dtype='float32')) as decode, \
                    patch.object(structure, 'extract', return_value=(energy, spectrum, chroma)):
                fresh = structure.prepare_structure(source, root, bundle)
                reused = structure.prepare_structure(source, root, bundle)
                self.assertFalse(fresh['cache_hit']); self.assertTrue(reused['cache_hit'])
                self.assertEqual(decode.call_count, 1)
                result = json.loads((Path(fresh['directory']) / 'structure.json').read_text())
                self.assertEqual(result['coverage'], 'full_recording')
                self.assertTrue(result['candidates'])
                with patch.object(structure, 'VERSION', structure.VERSION + 1):
                    newer = structure.prepare_structure(source, root, bundle)
                self.assertNotEqual(newer['directory'], fresh['directory'])
                source.write_bytes(b'replaced')
                with self.assertRaisesRegex(ValueError, 'does not match'):
                    structure.prepare_structure(source, root, bundle)
            self.assertEqual((bundle / 'head-drums.flac').read_bytes(), b'keep')
            self.assertEqual((bundle / 'manifest.json').read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
