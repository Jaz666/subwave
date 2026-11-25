"""V2 cue preparation consumes source-bound shared grids without separation."""
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import subbeats_cues
import subbeats_prep_v2
from subbeats_prepare import SR


def grid(start, end, source_sha256, source_bytes):
    beats = [start + i * .5 for i in range(round((end - start) * 2))]
    bars = [at for i, at in enumerate(beats) if i % 4 == 0]
    return dict(backend='beat-this-onnx', model='small0', preprocessingVersion=1,
                modelSha256='a' * 64, sourceSha256=source_sha256, sourceBytes=source_bytes,
                windowStartSeconds=start, windowEndSeconds=end,
                beatsSeconds=beats, downbeatsSeconds=bars)


class PrepV2Test(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'complete.audio'
        self.path.write_bytes(b'complete test recording')
        self.source_sha256 = hashlib.sha256(self.path.read_bytes()).hexdigest()
        self.source_bytes = self.path.stat().st_size

    def tearDown(self):
        self.temp.cleanup()

    def test_roles_are_assessed_independently_from_full_source_bound_grid(self):
        cues = dict(incoming=[dict(sourceSeconds=32., bpm=120., strength=.9, reason='opening',
                                   phraseBars=16, phraseStartSeconds=0.)],
                    outgoing=[dict(sourceSeconds=70., bpm=120., strength=.9, reason='ending',
                                   phraseBars=8, phraseEndSeconds=88.)],
                    ending=dict(audibleEndSeconds=89.))
        request = dict(path=str(self.path), complete=True, source_sha256=self.source_sha256,
                       source_bytes=self.source_bytes,
                       grid=grid(0., 90., self.source_sha256, self.source_bytes))
        with patch.object(subbeats_prep_v2, 'decode', return_value=(np.zeros(90 * SR), SR)), \
                patch.object(subbeats_prep_v2, '_incoming_grid_fallback', return_value=[]), \
                patch.object(subbeats_cues, 'fitted_passages', return_value=cues):
            result = subbeats_prep_v2.prepare_request(request)['subbeats_prep_v2_result']
        self.assertEqual(result['source']['sha256'], self.source_sha256)
        self.assertEqual(result['grid']['windowEndSeconds'], 90.)
        self.assertEqual(result['roles']['incoming']['status'], 'cue-ready')
        self.assertEqual(result['roles']['outgoing']['status'], 'cue-ready')
        self.assertEqual(result['roles']['outgoing']['cuePoints'][0]['phraseEndSeconds'], 88.)

    def test_partial_or_mismatched_grid_fails_both_roles_and_changed_source_is_rejected(self):
        request = dict(path=str(self.path), complete=True, source_sha256=self.source_sha256,
                       source_bytes=self.source_bytes,
                       grid=grid(20., 90., self.source_sha256, self.source_bytes))
        cues = dict(incoming=[], outgoing=[dict(sourceSeconds=70., bpm=120., strength=.9, reason='ending',
                     phraseBars=8, phraseEndSeconds=88.)], ending=dict(audibleEndSeconds=89.))
        with patch.object(subbeats_prep_v2, 'decode', return_value=(np.zeros(90 * SR), SR)), \
                patch.object(subbeats_prep_v2, '_incoming_grid_fallback', return_value=[]), \
                patch.object(subbeats_cues, 'fitted_passages', return_value=cues):
            result = subbeats_prep_v2.prepare_request(request)['subbeats_prep_v2_result']
        self.assertEqual(result['roles']['incoming']['status'], 'failed')
        self.assertIn('complete recording', result['roles']['incoming']['reason'])
        self.assertEqual(result['roles']['outgoing']['status'], 'failed')
        request['source_sha256'] = 'b' * 64
        with self.assertRaisesRegex(ValueError, 'identity is incomplete or has changed'):
            subbeats_prep_v2.prepare_request(request)

    def test_incomplete_source_and_distant_tail_are_refused(self):
        request = dict(path=str(self.path), complete=True, source_sha256=self.source_sha256,
                       source_bytes=self.source_bytes,
                       grid=grid(0., 90., self.source_sha256, self.source_bytes))
        cues = dict(incoming=[], outgoing=[dict(sourceSeconds=60., phraseEndSeconds=70.)],
                    ending=dict(audibleEndSeconds=89.))
        with patch.object(subbeats_prep_v2, 'decode', return_value=(np.zeros(90 * SR), SR)), \
                patch.object(subbeats_prep_v2, '_incoming_grid_fallback', return_value=[]), \
                patch.object(subbeats_cues, 'fitted_passages', return_value=cues):
            result = subbeats_prep_v2.prepare_request(request)['subbeats_prep_v2_result']
        self.assertEqual(result['roles']['outgoing']['status'], 'no-cue')
        request['complete'] = False
        with self.assertRaisesRegex(ValueError, 'complete recording'):
            subbeats_prep_v2.prepare_request(request)

    def test_phrase_boundary_may_extend_past_audible_decay_but_stays_inside_file_tail(self):
        request = dict(path=str(self.path), complete=True, source_sha256=self.source_sha256,
                       source_bytes=self.source_bytes,
                       grid=grid(0., 90., self.source_sha256, self.source_bytes))
        cues = dict(incoming=[], outgoing=[dict(sourceSeconds=70., bpm=120., strength=.9, reason='ending',
                     phraseBars=8, phraseEndSeconds=88.)], ending=dict(audibleEndSeconds=87.))
        with patch.object(subbeats_prep_v2, 'decode', return_value=(np.zeros(90 * SR), SR)), \
                patch.object(subbeats_prep_v2, '_incoming_grid_fallback', return_value=[]), \
                patch.object(subbeats_cues, 'fitted_passages', return_value=cues):
            result = subbeats_prep_v2.prepare_request(request)['subbeats_prep_v2_result']
        self.assertEqual(result['roles']['outgoing']['status'], 'cue-ready')

    def test_natural_finish_fallback_uses_the_complete_grid_and_keeps_the_source_tail(self):
        request = dict(path=str(self.path), complete=True, source_sha256=self.source_sha256,
                       source_bytes=self.source_bytes,
                       grid=grid(0., 90., self.source_sha256, self.source_bytes))
        cue = dict(sourceSeconds=70., bpm=120., strength=.9, reason='ending', phraseBars=8,
                   phraseEndSeconds=90., timingSource='fitted-grid', timingValidated=True)
        with patch.object(subbeats_prep_v2, 'decode', return_value=(np.zeros(90 * SR), SR)), \
                patch.object(subbeats_prep_v2, '_incoming_grid_fallback', return_value=[]), \
                patch.object(subbeats_cues, 'fitted_passages', return_value=dict(incoming=[], outgoing=[], ending=None)), \
                patch.object(subbeats_cues, 'natural_finish_grid_cues', return_value=([cue], {})) as fallback:
            result = subbeats_prep_v2.prepare_request(request)['subbeats_prep_v2_result']
        self.assertEqual(result['roles']['outgoing']['status'], 'cue-ready')
        self.assertEqual(result['roles']['outgoing']['cuePoints'][0]['phraseEndSeconds'], 90.)
        fallback.assert_called_once()

    def test_generates_and_returns_one_full_song_grid_when_none_is_cached(self):
        request = dict(path=str(self.path), complete=True, source_sha256=self.source_sha256,
                       source_bytes=self.source_bytes)
        beats = np.arange(0, 90, .5)
        bars = beats[::4]
        cues = dict(incoming=[], outgoing=[], ending=None)
        with patch.object(subbeats_prep_v2, 'decode', return_value=(np.zeros(90 * SR), SR)), \
                patch.object(subbeats_cues, 'predict', return_value=(beats, bars)) as predict, \
                patch.object(subbeats_prep_v2, '_incoming_grid_fallback', return_value=[]), \
                patch.object(subbeats_cues, 'fitted_passages', return_value=cues):
            result = subbeats_prep_v2.prepare_request(request)['subbeats_prep_v2_result']
        predict.assert_called_once()
        self.assertEqual(result['grid']['windowStartSeconds'], 0.)
        self.assertEqual(result['grid']['windowEndSeconds'], 90.)
        self.assertEqual(len(result['grid']['beatsSeconds']), len(beats))

    def test_fallback_reuses_decoded_audio_and_reports_stage_metrics(self):
        request = dict(path=str(self.path), complete=True, source_sha256=self.source_sha256,
                       source_bytes=self.source_bytes,
                       grid=grid(0., 90., self.source_sha256, self.source_bytes))
        audio = np.zeros(90 * SR)
        with patch.object(subbeats_prep_v2, 'decode', return_value=(audio, SR)) as decode, \
                patch.object(subbeats_prep_v2, '_incoming_grid_fallback', return_value=[]) as fallback, \
                patch.object(subbeats_cues, 'fitted_passages', return_value=dict(incoming=[], outgoing=[], ending=None)):
            result = subbeats_prep_v2.prepare_request(request)['subbeats_prep_v2_result']
        self.assertEqual(decode.call_count, 1)
        self.assertIs(fallback.call_args.kwargs['audio'], audio)
        self.assertTrue(result['diagnostics']['incomingFallbackUsed'])
        self.assertEqual(result['diagnostics']['gridSource'], 'cached')
        self.assertGreaterEqual(result['diagnostics']['stageTimingsMs']['totalAnalyzerMs'], 0)


if __name__ == '__main__':
    unittest.main()
