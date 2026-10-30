"""Numerical reference envelopes and isolated source/cache boundaries; no models."""
import json
import hashlib
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch
import numpy as np
import subbeats_reference_preview as reference
import subbeats_preview as preview
from subbeats_cache import digest, cached_entry


class ReferencePreviewTests(unittest.TestCase):
    def test_rhythm_remains_through_release_and_fades_over_one_bar(self):
        with patch.object(reference, 'STEM_SR', 1000):
            period, bars = .5, 16
            total = 44000
            natural = np.zeros((2, total), dtype=np.float32)
            natural[:, :12000] = .1
            loop = np.full((2, total), .1, dtype=np.float32)
            incoming = np.zeros((2, 40000), dtype=np.float32)
            audio, loop_gain, gain = reference.mix_reference(natural, incoming, loop, period, bars, 12)
            self.assertAlmostEqual(loop_gain, 1)
            self.assertEqual(gain, 1)
            np.testing.assert_allclose(audio[:, 12000:36000], .1, atol=1e-7)
            self.assertAlmostEqual(float(audio[0, 37000]), .05)
            np.testing.assert_allclose(audio[:, 38000:], 0, atol=1e-7)
            # Short reference windows retain the same independent handover.
            short = reference.mix_reference(natural[:, :20000], incoming, loop[:, :20000], period, 4, 12)[0]
            self.assertGreater(short[0, 11999], .09)
            self.assertAlmostEqual(float(short[0, 13000]), .05)
            self.assertAlmostEqual(float(short[0, 14000]), 0)

    def test_fractional_sample_loop_keeps_full_cycle_and_timeline_describes_eof(self):
        with patch.object(reference, 'STEM_SR', 1000):
            source = np.sin(np.arange(30000)[None, :] * .1).repeat(2, axis=0).astype(np.float32)
            loop = reference.repeat_rhythm(source, 2, .503, 24000, 0)
            self.assertEqual(loop.shape, (2, 24000))
            # Far from seams, samples repeat at the full 8048-sample cycle.
            np.testing.assert_allclose(loop[:, 100:200], loop[:, 8148:8248], atol=1e-6)
            with self.assertRaisesRegex(ValueError, 'complete four-bar'):
                reference.repeat_rhythm(source, 29, .5, 1000, 0)
        timeline = reference.reference_timeline(.5, 32, 18, 219, 4, 68, 76)
        self.assertEqual(timeline['kind'], 'reference')
        self.assertTrue(any(e['at'] == 18 and 'recording ends' in e['label'] for e in timeline['events']))
        self.assertTrue(any(e['at'] == 68 and 'annotated release' in e['label'] for e in timeline['events']))
        self.assertTrue(any(e['at'] == 70 and 'handover complete' in e['label'] for e in timeline['events']))
        self.assertEqual([e['at'] for e in timeline['events']], sorted(e['at'] for e in timeline['events']))

    def test_source_is_complete_verified_and_removed_even_on_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); source = root/'download.audio'
            (root/'analysis.json').write_text(json.dumps({'duration_seconds': 2}))
            audio = np.full((2, 2000), .1, dtype=np.float32)
            record = {'identity': {'source_sha256': 'different-container'}}
            def fetch(_url, max_bytes):
                self.assertEqual(max_bytes, 256*1024**2)
                source.write_bytes(b'same audio in another container')
                return source, True
            with patch.object(reference, 'STEM_SR', 1000), patch.object(reference, 'decode', return_value=audio), \
                    patch.object(reference, 'load_region', return_value=({'other': audio}, 120)):
                np.testing.assert_equal(reference.source_audio('http://source', root, record, fetch), audio)
                self.assertFalse(source.exists())
                with patch.object(reference, 'load_region', return_value=({'other': -audio}, 120)):
                    with self.assertRaisesRegex(ValueError, 'differs'):
                        reference.source_audio('http://source', root, record, fetch)
                self.assertFalse(source.exists())
                def incomplete(url, max_bytes):
                    path, _ = fetch(url, max_bytes); return path, False
                with self.assertRaisesRegex(ValueError, 'download limit'):
                    reference.source_audio('http://source', root, record, incomplete)
                self.assertFalse(source.exists())

    def test_preview_recycling_keeps_prepared_and_unrecognised_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); previews = root/'previews'; previews.mkdir()
            prepared = root/'v1'; prepared.mkdir(); (prepared/'stems.flac').write_bytes(b'prepared')
            identity = {'fingerprint':json.dumps({'version':4})}
            saved = previews/hashlib.sha256(identity['fingerprint'].encode()).hexdigest(); saved.mkdir()
            (saved/'preview.wav').write_bytes(b'audio')
            record = {'identity':identity,'metadata':{},'files':{'preview.wav':{
                'bytes':5,'sha256':digest(saved/'preview.wav')}}}
            (saved/'manifest.json').write_text(json.dumps(record))
            (previews/'notes.txt').write_bytes(b'keep')
            with patch.object(preview,'PREVIEW_BUDGET',10):
                preview.trim_previews(previews)
            self.assertFalse(saved.exists())
            self.assertEqual((prepared/'stems.flac').read_bytes(),b'prepared')
            self.assertEqual((previews/'notes.txt').read_bytes(),b'keep')
            with patch.object(preview,'PREVIEW_BUDGET',1):
                with self.assertRaisesRegex(ValueError,'unrecognised'):
                    preview.trim_previews(previews)

    def test_bad_reference_declines_and_credentials_are_not_persisted(self):
        value = {'out_seconds': 219, 'in_resolve': 68, 'bars': 32,
                 'out_url': 'http://source?secret=out', 'in_url': 'http://source?secret=in'}
        self.assertEqual(reference.validate_reference(value), {'out_seconds':219,'in_resolve':68,'bars':32})
        for name, bad in [('bars', 15), ('bars', True), ('in_resolve', float('nan')), ('out_seconds', True), ('out_url', 'file:///secret')]:
            with self.assertRaises(ValueError):
                reference.validate_reference({**value, name:bad})
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root/'subbeats/v1').mkdir(parents=True)
            keys = ['a'*64, 'b'*64]
            records = {}
            for key in keys:
                folder = root/'subbeats/v1'/key; folder.mkdir()
                record = {'identity': {'source_sha256':key}, 'metadata':{}, 'files':{}}
                (folder/'manifest.json').write_text(json.dumps(record)); records[key] = record
            def verified(folder, identity):
                return records[folder.name] if folder.name in records else cached_entry(folder, identity)
            fake_sf = types.SimpleNamespace(write=lambda path, *a, **k: Path(path).write_bytes(b'RIFFtestWAVE'))
            fake_librosa = types.SimpleNamespace(__version__='test')
            metadata = {'timeline': reference.reference_timeline(.5,32,18,219,4,68,76)}
            req = {'state_dir':str(root), 'cache_id':'shared-test-identity','out_key':keys[0], 'in_key':keys[1], 'reference':value}
            renderer = lambda *args: (np.ones((2,76000),dtype=np.float32), metadata)
            with patch.dict('sys.modules', {'soundfile':fake_sf, 'librosa':fake_librosa}), \
                    patch.object(preview, 'require_shared_cache'), patch.object(preview, 'cached_entry', side_effect=verified), \
                    patch.object(reference, 'render_reference', side_effect=renderer) as render:
                result = preview.render_preview(req, fetch_source='unused')
                again = preview.render_preview({**req, 'reference':{**value,'in_url':'http://rotated-token'}}, fetch_source='unused')
                self.assertEqual(result, again); self.assertEqual(render.call_count, 1)
                manifest = Path(result['subbeats_preview']).with_name('manifest.json').read_text()
                self.assertNotIn('secret', manifest); self.assertNotIn('http://', manifest)
                preview.render_preview({**req, 'reference':{**value,'bars':16}}, fetch_source='unused')
                self.assertEqual(render.call_count, 2)
                with self.assertRaisesRegex(ValueError, 'Reset the bar shift'):
                    preview.render_preview({**req, 'bar_shift':1})


if __name__ == '__main__': unittest.main()
