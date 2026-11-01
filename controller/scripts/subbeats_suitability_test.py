"""Role eligibility and cache-only assessment; no models, decoding or GPU."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
import subbeats_suitability as suitability


class SuitabilityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = Path(self.tmp.name)
        self.analysis = {'supported_regions':[{'bpm':120.,'start_seconds':0.,'end_seconds':31.5},
                                              {'bpm':120.,'start_seconds':100.,'end_seconds':131.5}]}
        (self.folder / 'analysis.json').write_text(json.dumps(self.analysis))
        self.record = {'metadata':{'stem_regions':[
            {'name':'head','start_sample':0,'end_sample':68000,'sample_rate':1000},
            {'name':'exit','start_sample':96000,'end_sample':140000,'sample_rate':1000}]}}
        self.parts = {name:np.zeros((2,68000)) for name in ['drums','bass','other','vocals']}

    def assess(self, kick=None):
        with patch('subbeats_prepare.STEM_SR',1000), patch.object(suitability,'load_region',return_value=(self.parts,120)), \
                patch.object(suitability,'kick_grid',side_effect=kick or (lambda _parts,_bpm,outgoing:(4.,.5))):
            return suitability.assess_bundle(self.folder,self.record)

    def test_stems_and_grid_pass_for_both_roles_with_original_track_timestamps(self):
        result = self.assess()
        self.assertEqual(result['incoming']['level'],'subbeat')
        self.assertEqual(result['outgoing']['level'],'subbeat')
        self.assertEqual(result['outgoing']['cueSeconds'],100.)
        self.assertEqual(result['outgoing']['leadSeconds'],4.)
        self.assertEqual(result['incoming']['bpm'],120.)
        self.assertEqual(result['version'],1)

    def test_supported_beats_without_four_to_floor_qualify_for_basic_matching(self):
        result = self.assess(lambda *_: (_ for _ in ()).throw(ValueError('No sustained four-to-the-floor run.')))
        for role in ['incoming','outgoing']:
            self.assertEqual(result[role]['level'],'beat')
            self.assertIn('four-to-the-floor',result[role]['reason'])

    def test_absent_rhythm_evidence_is_regular_only_and_not_a_technical_failure(self):
        self.record['metadata']['stem_regions'] = []
        result = suitability.assess_bundle(self.folder,self.record)
        self.assertEqual(result['incoming']['level'],'regular')
        self.assertEqual(result['outgoing']['level'],'regular')
        self.assertIsNone(result['incoming']['bpm'])

    def test_basic_grid_uses_the_overlap_of_a_long_run_and_prepared_coverage(self):
        self.analysis['supported_regions'] = [{'bpm':120.,'start_seconds':0.,'end_seconds':200.}]
        role = suitability.basic_grid(self.analysis,self.record['metadata']['stem_regions'][1],True)
        self.assertEqual(role,(108.,120.))
        self.analysis['supported_regions'][0]['end_seconds'] = 100.
        self.assertIsNone(suitability.basic_grid(self.analysis,self.record['metadata']['stem_regions'][1],True))

    def test_region_with_no_supported_evidence_is_regular_without_loading_stems(self):
        self.analysis['supported_regions'] = []
        (self.folder / 'analysis.json').write_text(json.dumps(self.analysis))
        with patch.object(suitability,'load_region',side_effect=AssertionError('no tempo to load')):
            result = suitability.assess_bundle(self.folder,self.record)
        self.assertEqual(result['outgoing']['level'],'regular')

    def test_incoming_needs_follow_through_even_when_the_kick_grid_fits(self):
        result = self.assess(lambda _p,_bpm,outgoing:(4. if outgoing else 30.,.5))
        self.assertEqual(result['incoming']['level'],'beat')
        self.assertIn('eight-second',result['incoming']['reason'])
        self.assertEqual(result['outgoing']['level'],'subbeat')

    def test_technical_load_failures_do_not_become_regular_only_classifications(self):
        with patch.object(suitability,'load_region',side_effect=ValueError('Invalid cached stem coverage')):
            with self.assertRaisesRegex(ValueError,'Invalid cached'):
                suitability.assess_bundle(self.folder,self.record)

    def test_invalid_tempo_evidence_is_refused_instead_of_looping(self):
        self.analysis['supported_regions'][0]['bpm'] = 0
        (self.folder / 'analysis.json').write_text(json.dumps(self.analysis))
        with self.assertRaisesRegex(ValueError,'Invalid tempo'):
            suitability.assess_bundle(self.folder,self.record)

    def test_cached_assessment_needs_no_source_or_separation_and_never_writes_the_bundle(self):
        state = self.folder
        key = 'a'*64
        parent = state/'subbeats';parent.mkdir();(parent/'.cache-id').write_text('shared-cache-identity')
        stems=state/'stems';stems.mkdir();(stems/'.subwave-stems').touch()
        folder=stems/'track/subbeats/v1'/key;folder.mkdir(parents=True)
        (folder/'manifest.json').write_text(json.dumps({'identity':{'source_sha256':'source'}}))
        before=(folder/'manifest.json').read_bytes()
        result=self.assess()
        with patch('subbeats_cache.cached_entry',return_value=self.record), \
                patch.object(suitability,'assess_bundle',return_value=result), \
                patch('subbeats_prepare.prepare',side_effect=AssertionError('must not separate')):
            answer=suitability.assess_request({'state_dir':state,'cache_id':'shared-cache-identity',
                'stems_root':stems,'track_id':'track','bundle_key':key})
        self.assertEqual(answer['cache_added_bytes'],0)
        self.assertEqual(answer['subbeats_result']['bundleKey'],key)
        self.assertEqual(answer['subbeats_result']['suitability'],result)
        self.assertEqual((folder/'manifest.json').read_bytes(),before)


if __name__ == '__main__':
    unittest.main()
