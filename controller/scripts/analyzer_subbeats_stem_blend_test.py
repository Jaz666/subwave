import json
from pathlib import Path
import sys
import tempfile
import types
import unittest

import numpy as np

import analyze_worker as worker
import subbeats_cache as cache


class SoundFileFixture:
    @staticmethod
    def info(path):
        name = Path(path).name
        region, stem = name[:-5].split('-', 1)
        frames = 4410 if region == 'head' else 8820
        return types.SimpleNamespace(samplerate=44100, channels=2, frames=frames)

    @staticmethod
    def read(path, **kwargs):
        info = SoundFileFixture.info(path)
        return np.full((info.frames, 2), .5, dtype=np.float32), info.samplerate


class SubbeatsBlendCoverageTests(unittest.TestCase):
    def make_bundle(self, parent):
        track = parent / 'stems' / 'track-id'
        root = track / 'subbeats' / 'v1'
        root.mkdir(parents=True)
        identity = {
            'mode': 'analysis_and_stems',
            'source_sha256': 'a' * 64,
            'separator': {'sample_rate': 44100, 'subtype': 'PCM_24-shared-gain-v1'},
        }

        def build(stage):
            for region in ('head', 'exit'):
                for stem in ('drums', 'bass', 'other', 'vocals'):
                    (stage / f'{region}-{stem}.flac').write_bytes(f'{region}-{stem}'.encode())
            (stage / 'analysis.json').write_text(json.dumps({'duration_seconds': 120.}))
            return {'stem_regions': [
                {'name': 'head', 'start_sample': 0, 'end_sample': 4410,
                 'sample_rate': 44100, 'storage_gain': .5},
                {'name': 'exit', 'start_sample': 44100, 'end_sample': 52920,
                 'sample_rate': 44100, 'storage_gain': .5},
            ]}

        result = cache.prepare_cached(str(parent / 'state'), identity, build, cache_root=root)
        return track, Path(result['directory'])

    def test_valid_head_region_is_restored_to_original_level(self):
        with tempfile.TemporaryDirectory() as tmp:
            track, bundle = self.make_bundle(Path(tmp))
            result = worker.load_subbeats_stem_region({
                'stems_dir': str(track), 'subbeats_bundle_dir': str(bundle),
                'subbeats_bundle_key': bundle.name,
            }, 'head', ('drums', 'bass', 'other', 'vocals'), SoundFileFixture)
        self.assertIsNotNone(result)
        self.assertEqual((result['start_sec'], result['end_sec']), (0., .1))
        np.testing.assert_array_equal(result['stems']['drums'], np.ones((4410, 2), dtype=np.float32))

    def test_modified_bundle_file_is_a_clean_cache_miss(self):
        with tempfile.TemporaryDirectory() as tmp:
            track, bundle = self.make_bundle(Path(tmp))
            (bundle / 'head-drums.flac').write_bytes(b'changed')
            result = worker.load_subbeats_stem_region({
                'stems_dir': str(track), 'subbeats_bundle_dir': str(bundle),
                'subbeats_bundle_key': bundle.name,
            }, 'head', ('drums', 'bass', 'other', 'vocals'), SoundFileFixture)
        self.assertIsNone(result)

    def test_exit_region_keeps_its_absolute_source_offset(self):
        with tempfile.TemporaryDirectory() as tmp:
            track, bundle = self.make_bundle(Path(tmp))
            result = worker.load_subbeats_stem_region({
                'stems_dir': str(track), 'subbeats_bundle_dir': str(bundle),
                'subbeats_bundle_key': bundle.name,
            }, 'exit', ('drums', 'bass', 'other', 'vocals'), SoundFileFixture)
        self.assertEqual((result['start_sec'], result['end_sec']), (1., 1.2))


if __name__ == '__main__':
    unittest.main()
