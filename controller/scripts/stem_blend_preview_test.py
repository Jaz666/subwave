"""Audio-level regressions for the regular upstream baseline, without model dependencies."""
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import numpy as np
import analyze_worker as worker
sys.modules.setdefault('soundfile', types.SimpleNamespace())
import stem_blend_preview as preview


class AudioFiles:
    """In-memory soundfile seam: preserve PCM16 quantisation and filesystem gates."""
    def __init__(self):
        self.audio = {}

    def read(self, path, **_kwargs):
        return (self.audio[str(path)].copy() if str(path) in self.audio else np.load(path)), 44100

    def write(self, path, audio, _sr, **kwargs):
        data = np.asarray(audio, dtype=np.float32)
        if kwargs.get('subtype') == 'PCM_16':
            data = np.floor(np.clip(data, -1, 32767/32768) * 32768) / 32768
        self.audio[str(path)] = data.copy()
        with open(path, 'wb') as file:
            np.save(file, data)


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.sf = AudioFiles()
        self.patch = patch.dict(sys.modules, {'soundfile': self.sf})
        self.patch.start()
        self.addCleanup(self.patch.stop)
        preview.sf = self.sf
        self.req = {'state_dir': str(self.root), 'mode': 'mix',
                    'out': {'stems_dir': str(self.root/'out'), 'duration_s': 120,
                            'outro': {'start_ms': 117000, 'bars': [112000,114000,116000]}, 'gain_db': 0},
                    'in': {'stems_dir': str(self.root/'in'), 'bars': [250+i*1000 for i in range(10)], 'gain_db': -3}}
        self.seed()

    def seed(self, drum_amplitude=.1, incoming_amplitude=.1):
        for role, window, duration in [('out','tail',20), ('in','head',12)]:
            folder = self.root/role
            folder.mkdir(exist_ok=True)
            t = np.arange(duration*44100, dtype=np.float32)/44100
            for index, stem in enumerate(['drums','bass','other','vocals']):
                amplitude = drum_amplitude if role == 'out' and stem == 'drums' else incoming_amplitude
                audio = amplitude * np.sin(2*np.pi*(80+index*35)*t)
                path = folder/f'{window}-{stem}.flac'
                path.write_bytes(b'fixture')
                self.sf.audio[str(path)] = np.column_stack([audio,audio])
        (self.root/'out'/'tail-meta.json').write_text(json.dumps({'tail_start_sec':100,'duration_sec':120}))

    def test_observation_preserves_upstream_pcm_and_timing(self):
        payload = {**self.req, 'out_dir': str(self.root), 'clip_name': 'baseline.wav'}
        normal = worker.render_transition(payload)
        baseline = self.sf.read(normal['path'])[0].copy()
        observed = {}
        measured = worker.render_transition({**payload,'clip_name':'observed.wav'}, observe=observed.update)
        np.testing.assert_array_equal(baseline, self.sf.read(measured['path'])[0])
        self.assertEqual((normal['blend_start_sec'], normal['in_cue_sec'], normal['clip_sec']), (116,6.25,6.25))
        self.assertEqual(observed['incoming_drums'], 4.25)

    def test_quiet_loop_is_reported_without_changing_acceptance_or_boosting_solo(self):
        self.seed(drum_amplitude=.00001)
        result = preview.render_preview({**self.req,'mode':'outgoing'})
        report = result['stem_blend_report']
        self.assertTrue(result['ok'])
        self.assertTrue(report['warnings'])
        self.assertLess(report['barLevels'][0]['differenceDb'], -65)
        self.assertLess(np.max(np.abs(self.sf.audio[result['stem_blend_preview']])), .00001)
        self.assertEqual(report['beforeSec'], 0)

    def test_solos_reconstruct_the_exact_render_within_pcm16_quantisation(self):
        audio = {}
        for mode in ['clip','outgoing','incoming']:
            result = preview.render_preview({**self.req,'mode':mode})
            audio[mode] = self.sf.audio[result['stem_blend_preview']]
        np.testing.assert_allclose(audio['outgoing'] + audio['incoming'], audio['clip'], atol=1/32768)
        start = int(4.25*44100)
        self.assertEqual(float(np.max(np.abs(audio['outgoing'][start:]))), 0)

    def test_context_has_correct_source_offsets_and_bounded_duration(self):
        result = preview.render_preview(self.req)
        report = result['stem_blend_report']
        self.assertEqual(report['beforeSec'], 6)
        self.assertEqual(report['afterSec'], 5.75)
        self.assertEqual(report['durationSec'], 18)
        audio = self.sf.audio[result['stem_blend_preview']]
        tail = sum(self.sf.audio[str(self.root/'out'/f'tail-{name}.flac')] for name in ['drums','bass','other','vocals'])
        np.testing.assert_array_equal(audio[:6*44100], tail[10*44100:16*44100])

    def test_peak_reduction_is_exposed_and_failed_renders_leave_no_artifacts(self):
        self.seed(drum_amplitude=.8, incoming_amplitude=.7)
        report = preview.render_preview(self.req)['stem_blend_report']
        self.assertLess(report['wholeGainDb'], 0)
        (self.root/'out'/'tail-drums.flac').unlink()
        before = set((self.root/'stem-blend-previews').iterdir())
        with self.assertRaisesRegex(ValueError, 'stems-missing'):
            preview.render_preview(self.req)
        self.assertEqual(before, set((self.root/'stem-blend-previews').iterdir()))


if __name__ == '__main__':
    # Import the real wrapper with the soundfile stub before constructing fixtures.
    unittest.main()
