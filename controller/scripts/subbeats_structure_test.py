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
