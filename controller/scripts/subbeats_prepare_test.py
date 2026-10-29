"""Isolated cache/preparation checks, registered in analyzer-python.test.ts."""
import fcntl
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

import subbeats_cache as cache
import subbeats_prepare as prepare


class CacheTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name)
        self.identity = {'source_sha256': 'a', 'analysis_version': 1}

    def build(self, dest):
        (dest / 'analysis.json').write_text('{"pair_ready":false}')
        return {'pair_ready': False}

    def run_job(self, identity=None, build=None, budget=10000):
        return cache.prepare_cached(self.state, identity or self.identity, build or self.build, budget)

    def test_atomic_publish_and_reuse(self):
        result = self.run_job()
        self.assertFalse(result['cache_hit'])
        reused = self.run_job(build=lambda _: self.fail('builder called on a cache hit'))
        self.assertTrue(reused['cache_hit'])
        self.assertEqual(result['files'], reused['files'])
        self.assertFalse(list((self.state / 'subbeats/v1').glob('.pending-*')))

    def test_failed_job_never_publishes_or_removes_existing(self):
        kept = self.run_job()
        def fail(stage):
            (stage / 'partial.flac').write_bytes(b'partial')
            raise RuntimeError('separator failed')
        with self.assertRaisesRegex(RuntimeError, 'separator failed'):
            self.run_job({'source': 'b'}, fail)
        self.assertTrue(Path(kept['directory']).exists())
        self.assertFalse(list((self.state / 'subbeats/v1').glob('.pending-*')))

    def test_budget_declines_without_changing_old_bundle(self):
        old = self.run_job()
        def large(stage):
            (stage / 'large.flac').write_bytes(b'x' * 20000)
            return {}
        with self.assertRaisesRegex(RuntimeError, 'budget'):
            self.run_job({'source': 'new'}, large)
        self.assertTrue(Path(old['directory']).exists())
        self.assertLess(cache.tree_bytes(self.state / 'subbeats/v1'), 10000)

    def test_full_cache_does_not_start_expensive_work(self):
        self.run_job()
        with self.assertRaisesRegex(RuntimeError, 'budget'):
            self.run_job({'source': 'new'}, lambda _: self.fail('work started'), budget=1)

    def test_damage_is_not_a_hit(self):
        result = self.run_job()
        target = Path(result['directory']) / 'analysis.json'
        target.write_bytes(b'corrupt')
        with self.assertRaisesRegex(RuntimeError, 'integrity'):
            self.run_job()
        self.assertEqual(target.read_bytes(), b'corrupt')

    def test_malformed_manifest_is_not_a_hit(self):
        result = self.run_job()
        manifest = Path(result['directory']) / 'manifest.json'
        for malformed in [[], {'identity': self.identity, 'files': ['not-a-map']}]:
            manifest.write_text(json.dumps(malformed))
            with self.assertRaisesRegex(RuntimeError, 'integrity'):
                self.run_job()

    def test_missing_file_is_not_a_hit(self):
        result = self.run_job()
        (Path(result['directory']) / 'analysis.json').unlink()
        with self.assertRaisesRegex(RuntimeError, 'integrity'):
            self.run_job()

    def test_source_version_or_region_change_invalidates_identity(self):
        first = self.run_job()
        for name, value in [('source_sha256', 'b'), ('analysis_version', 2), ('head_seconds', 120)]:
            changed = self.run_job({**self.identity, name: value})
            self.assertNotEqual(first['directory'], changed['directory'])
            self.assertFalse(changed['cache_hit'])

    def test_lock_prevents_second_writer(self):
        root = self.state / 'subbeats/v1'
        root.mkdir(parents=True)
        with open(root / '.prepare.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(RuntimeError, 'another'):
                self.run_job(build=lambda _: self.fail('second writer started'))

    def test_regular_stems_and_state_files_are_untouched(self):
        regular = self.state / 'stems/track'
        regular.mkdir(parents=True)
        (regular / 'head-drums.flac').write_bytes(b'keep')
        (self.state / 'settings.json').write_text('{}')
        self.run_job()
        self.assertEqual((regular / 'head-drums.flac').read_bytes(), b'keep')
        self.assertEqual((self.state / 'settings.json').read_text(), '{}')

    def test_symlink_cache_is_refused(self):
        (self.state / 'stems').mkdir()
        (self.state / 'subbeats').symlink_to(self.state / 'stems', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            self.run_job()
        self.assertEqual(list((self.state / 'stems').iterdir()), [])

    def test_invalid_output_and_budget_are_refused(self):
        with self.assertRaises(ValueError):
            self.run_job(budget=-1)
        with self.assertRaisesRegex(ValueError, 'no artifacts'):
            self.run_job(build=lambda _: {})
        def nonfinite(stage):
            self.build(stage)
            return {'bad': float('nan')}
        with self.assertRaises(ValueError):
            self.run_job(build=nonfinite)
        self.assertFalse(list((self.state / 'subbeats/v1').glob('.pending-*')))


class CoverageTests(unittest.TestCase):
    def analysis(self, drop=None):
        return {'duration_seconds': 220., 'late_percussion_drop_seconds': drop,
                'supported_regions': [{'start_seconds': 100., 'end_seconds': 128., 'bpm': 138.},
                                      {'start_seconds': 170., 'end_seconds': 198., 'bpm': 138.}]}

    def test_calm_outro_uses_supported_region_before_drop(self):
        regions = prepare.requested_regions(self.analysis(drop=180), 68.)
        self.assertEqual(regions[0], ('head', 0., 68.))
        self.assertEqual(regions[1][2], 130.)
        self.assertLess(regions[1][1], 100.)

    def test_exit_never_extrapolates_past_measured_grid(self):
        self.assertEqual(prepare.requested_regions(self.analysis(), 68.)[-1][2], 200.)

    def test_requested_head_can_cover_long_intro(self):
        self.assertEqual(prepare.requested_regions(self.analysis(), 120.)[0][2], 120.)
        self.assertEqual(prepare.requested_regions(self.analysis(), 600.)[0][2], 220.)

    def test_unmeasurable_track_has_no_stems(self):
        self.assertEqual(prepare.requested_regions({**self.analysis(), 'supported_regions': []}, 68.), [])

    def test_missing_exit_evidence_does_not_fabricate_tail(self):
        self.assertEqual(prepare.requested_regions(self.analysis(drop=80), 68.), [('head', 0., 68.)])

    def test_stem_slices_retain_exact_source_clock_and_validate_reconstruction(self):
        import numpy as np
        audio = np.ones((2, 8 * prepare.STEM_SR), dtype=np.float32) * .2
        detector = types.SimpleNamespace(separate=lambda y: {name: y / 4 for name in prepare.STEMS})
        written = {}
        def write(path, data, sr, **_kw):
            written[path.name] = data.copy()
        fake_sf = types.SimpleNamespace(write=write, info=lambda p: types.SimpleNamespace(
            frames=len(written[p.name]), channels=2, samplerate=prepare.STEM_SR))
        with tempfile.TemporaryDirectory() as folder, patch.object(prepare, 'decode', return_value=audio), \
                patch.dict('sys.modules', {'soundfile': fake_sf}):
            coverage = prepare.separate_regions('unused', Path(folder), [('head', 0., 2.), ('exit', 5., 7.)], detector)
            self.assertEqual(coverage[1]['start_sample'], 5 * prepare.STEM_SR)
            self.assertEqual(coverage[1]['end_sample'], 7 * prepare.STEM_SR)
            self.assertLess(coverage[1]['reconstruction_error_relative'], 1e-6)
            self.assertEqual(len(written), 8)
            with self.assertRaisesRegex(ValueError, 'coverage'):
                prepare.separate_regions('unused', Path(folder), [('bad', 0., 9.)], detector)
            broken = types.SimpleNamespace(separate=lambda y: {name: np.zeros_like(y) for name in prepare.STEMS})
            with self.assertRaisesRegex(ValueError, 'reconstruct'):
                prepare.separate_regions('unused', Path(folder), [('head', 0., 2.)], broken)

    def test_source_change_cannot_publish(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'track.mp3'
            source.write_bytes(b'original')
            state = Path(folder) / 'state'
            def changed(path, stage, _librosa):
                (stage / 'analysis.json').write_text('{}')
                path.write_bytes(b'replaced')
                return {'status': 'unmeasurable', 'supported_regions': []}
            with patch.dict('sys.modules', {'librosa': types.SimpleNamespace(__version__='test')}), \
                    patch.object(prepare, 'analyze', side_effect=changed):
                with self.assertRaisesRegex(ValueError, 'source changed'):
                    prepare.prepare(source, state, analysis_only=True)
            self.assertEqual(list((state / 'subbeats/v1').iterdir()), [state / 'subbeats/v1/.prepare.lock'])

    def test_sparse_and_regular_grids_keep_distinct_confidence(self):
        import numpy as np
        class FakeLibrosa:
            @staticmethod
            def frames_to_time(frames, **_kw):
                return np.asarray(frames) / 2
        self.assertEqual(prepare.timing_regions(FakeLibrosa, np.arange(20), np.ones(20)), ([], []))
        _, supported = prepare.timing_regions(FakeLibrosa, np.arange(80), np.ones(80))
        self.assertTrue(supported)
        self.assertAlmostEqual(supported[0]['bpm'], 120)
        self.assertLess(supported[0]['timing_error_ms'], .001)
        _, silent = prepare.timing_regions(FakeLibrosa, np.arange(80), np.zeros(80))
        self.assertEqual(silent, [])


if __name__ == '__main__':
    unittest.main()
