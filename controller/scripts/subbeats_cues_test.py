"""Cue evidence and preview geometry; no models, library or runtime state."""
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
import subbeats_cache as cache
import subbeats_cues as cues
import subbeats_cue_preview as preview
from subbeats_models import model_path


class CueTests(unittest.TestCase):
    def test_outgoing_analysis_uses_the_recording_end_not_early_exit_stems(self):
        with tempfile.TemporaryDirectory() as tmp:
            state=Path(tmp); source=state/'source'; source.write_bytes(b'complete recording')
            bundle=state/'bundle'; bundle.mkdir()
            record=dict(identity=dict(source_sha256=cache.digest(source)),metadata=dict(stem_regions=[
                dict(name='head',start_sample=0,end_sample=680,sample_rate=10),
                dict(name='exit',start_sample=440,end_sample=1110,sample_rate=10)]))
            (bundle/'manifest.json').write_text(json.dumps(record))
            lengths=[]
            def features(audio,times,_librosa):
                lengths.append(len(audio))
                return (np.tile(-.4*np.maximum(0,np.asarray(times)-50),(4,1)),
                        np.ones((2,len(times)))/2,np.ones((12,len(times))))
            librosa=SimpleNamespace(__version__='test',resample=lambda y,**_opts:y)
            beats=np.arange(0,200,.5)
            with (patch.dict('sys.modules',librosa=librosa),
                  patch('subbeats_prepare.SR',10),patch('subbeats_structure.SR',10),
                  patch('subbeats_prepare.decode',return_value=np.zeros((1,2000))),
                  patch('subbeats_prepare.require_shared_cache'),
                  patch('subbeats_structure.extract',side_effect=features),
                  patch.object(cues,'predict',return_value=(beats,beats[::4])),
                  patch('importlib.metadata.version',return_value='1.1.0')):
                result=cues.prepare_cues(source,state,bundle,record,'small0',cache_root=None,allowance=None,expected_cache_id='test')
            self.assertEqual(lengths,[680,1640]) # Second-half search plus 64s context reaches source end.
            self.assertEqual(result['durationSeconds'],200)
            self.assertEqual(result['algorithmVersion'],4)
            self.assertTrue(result['outgoing'])
            self.assertTrue(all(100<=c['sourceSeconds']<200 for c in result['outgoing']))

    def test_outgoing_search_rejects_early_changes_before_ranking(self):
        beats=np.arange(0,200,.5); bars=beats[::4]
        energy=np.zeros((4,len(beats))); spectrum=np.ones((2,len(beats)))/2
        chroma=np.ones((12,len(beats)))
        for t in range(12,140,8):
            energy[:,beats>=t] += 12 if t%16 else -12
        energy[:,beats>=162] -= 7
        result=cues.bar_candidates(beats,bars,energy,spectrum,chroma,earliest_seconds=150,outgoing=True)
        self.assertTrue(result)
        self.assertTrue(all(c['sourceSeconds']>=150 for c in result))
        self.assertTrue(any(abs(c['sourceSeconds']-162)<=2 for c in result))

    def test_gradual_fade_has_an_onset_candidate_without_an_arrangement_change(self):
        beats=np.arange(0,120,.5); bars=beats[::4]
        energy=np.tile(-.4*np.maximum(0,beats-80),(4,1))
        spectrum=np.ones((2,len(beats)))/2; chroma=np.ones((12,len(beats)))
        result=cues.bar_candidates(beats,bars,energy,spectrum,chroma,earliest_seconds=75,outgoing=True)
        fades=[c for c in result if c['reason']=='fade']
        self.assertEqual(len(fades),1)
        self.assertTrue(80<=fades[0]['sourceSeconds']<=86)
        self.assertEqual(fades[0].get('phraseBars'),None)
        self.assertFalse(any(c['reason']=='fade' for c in cues.bar_candidates(beats,bars,energy,spectrum,chroma)))
        # A temporary decline that returns to full level is not an ending fade.
        energy[:,(beats>=94)&(beats<112)] = 0
        result=cues.bar_candidates(beats,bars,energy,spectrum,chroma,earliest_seconds=75,outgoing=True)
        self.assertFalse(any(c['reason']=='fade' and c['sourceSeconds']<94 for c in result))

    def test_closing_passages_count_observed_bars_between_changes(self):
        beats=np.arange(0,220,.5); bars=beats[::4]
        energy=np.zeros((4,len(beats))); spectrum=np.ones((2,len(beats)))/2
        chroma=np.ones((12,len(beats)))
        energy[:,(beats>=96)&(beats<128)]=6
        energy[:,beats>=160]=-8
        result=cues.bar_candidates(beats,bars,energy,spectrum,chroma,earliest_seconds=80,outgoing=True)
        self.assertEqual(result[0]['sourceSeconds'],96)
        self.assertEqual(result[0]['phraseBars'],16)
        self.assertEqual(result[0]['phraseEndSeconds'],128)
        self.assertFalse(any(c['sourceSeconds']==112 and c.get('phraseBars')==8 for c in result),
                        'no invented cue eight bars before a change')
        self.assertTrue(all(c.get('phraseEndSeconds',0)!=220 for c in result), 'file end is not a phrase anchor')
        # Moving the observed later boundary changes the supported bar count.
        shorter=energy.copy(); shorter[:,(beats>=112)&(beats<128)]=0
        short_result=cues.bar_candidates(beats,bars,shorter,spectrum,chroma,earliest_seconds=80,outgoing=True)
        self.assertTrue(any(c['sourceSeconds']==96 and c.get('phraseBars')==8
                            and c['phraseEndSeconds']==112 for c in short_result))
        # A later loud section disqualifies the apparent closing passage.
        energy[:,(beats>=176)&(beats<208)]=10
        result=cues.bar_candidates(beats,bars,energy,spectrum,chroma,earliest_seconds=80,outgoing=True)
        self.assertFalse(any(c['sourceSeconds']==96 and c.get('phraseBars') for c in result))

    def test_closing_passages_do_not_count_across_a_missed_beat(self):
        beats=np.arange(0,220,.5); bars=beats[::4]
        energy=np.zeros((4,len(beats))); spectrum=np.ones((2,len(beats)))/2
        chroma=np.ones((12,len(beats)))
        energy[:,(beats>=96)&(beats<128)]=6; energy[:,beats>=160]=-8
        keep=beats!=110.5
        result=cues.bar_candidates(beats[keep],bars,energy[:,keep],spectrum[:,keep],chroma[:,keep],earliest_seconds=80,outgoing=True)
        self.assertFalse(any(c['sourceSeconds']==96 and c.get('phraseBars') for c in result))

    def test_repetition_retains_a_weak_change_without_inventing_constant_phrases(self):
        beats=np.arange(0,64,.5); bars=beats[::4]
        energy=np.zeros((4,len(beats))); spectrum=np.zeros((2,len(beats)))
        spectrum[0]=.9; spectrum[1]=.1
        chroma=np.ones((12,len(beats)))
        self.assertEqual(cues.bar_candidates(beats,bars,energy,spectrum,chroma),[])
        spectrum[0,48:]=.84; spectrum[1,48:]=.16
        result=cues.bar_candidates(beats,bars,energy,spectrum,chroma)
        self.assertTrue(any(abs(c['sourceSeconds']-24)<.01 for c in result))
        self.assertTrue(all(c['bpm']>119.9 and c['bpm']<120.1 for c in result))
        # Missing a beat invalidates the surrounding bars rather than projecting through.
        keep=np.arange(len(beats))!=47
        result=cues.bar_candidates(beats[keep],bars,energy[:,keep],spectrum[:,keep],chroma[:,keep])
        self.assertFalse(any(22<=c['sourceSeconds']<=26 for c in result))

    def test_incoming_arrivals_use_observed_opening_bars_and_reject_gaps(self):
        beats=np.arange(.3,80,.5); bars=beats[::4]
        energy=np.zeros((4,len(beats))); spectrum=np.ones((2,len(beats)))/2
        chroma=np.ones((12,len(beats)))
        energy[:,beats>=16.3]=6; energy[:,beats>=32.3]=12
        result=cues.bar_candidates(beats,bars,energy,spectrum,chroma,incoming=True)
        for seconds,width in [(16.3,8),(32.3,16)]:
            point=next(c for c in result if abs(c['sourceSeconds']-seconds)<.01)
            self.assertEqual(point['phraseBars'],width)
            self.assertAlmostEqual(point['phraseStartSeconds'],.3)
        keep=np.abs(beats-10.8)>.01
        result=cues.bar_candidates(beats[keep],bars,energy[:,keep],spectrum[:,keep],chroma[:,keep],incoming=True)
        self.assertFalse(any(c.get('phraseStartSeconds')==.3 for c in result))
        self.assertEqual(cues.bar_candidates(beats,bars,np.zeros_like(energy),spectrum,chroma,incoming=True),[])
        falling=-energy
        result=cues.bar_candidates(beats,bars,falling,spectrum,chroma,incoming=True)
        self.assertFalse(any(c.get('phraseStartSeconds')==.3 for c in result))

    def test_cue_artifact_is_bound_to_the_verified_stem_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            state=Path(tmp); bundle=state/'stems'; bundle.mkdir()
            (bundle/'manifest.json').write_text('source-one')
            identity=dict(mode='cue-points',version=3,bundle_sha256=cache.digest(bundle/'manifest.json'))
            def build(stage):
                (stage/'cues.json').write_text(json.dumps({'incoming':[],'outgoing':[]}))
                return dict(bundle_key=bundle.name)
            record=cache.prepare_cached(state,identity,build)
            key=Path(record['directory']).name
            self.assertEqual(cues.load_cues(state,None,'track',key,bundle)['incoming'],[])
            (bundle/'manifest.json').write_text('source-two')
            with self.assertRaisesRegex(ValueError,'no longer match'):
                cues.load_cues(state,None,'track',key,bundle)

    def test_tail_and_complete_opening_survive_rhythm_handover(self):
        self.assertEqual(preview.tail_endpoint(40,.5,[dict(startSeconds=39,endSeconds=45)],90),45.5)
        with self.assertRaisesRegex(ValueError,'tail needs'):
            preview.tail_endpoint(40,.5,[dict(startSeconds=39,endSeconds=90)],90)
        sr=1000
        with patch.object(preview,'STEM_SR',sr):
            outgoing={s:np.zeros((2,90*sr),dtype=np.float32) for s in preview.STEMS}
            incoming={s:np.zeros((2,68*sr),dtype=np.float32) for s in preview.STEMS}
            outgoing['vocals'][:]=.2; incoming['vocals'][:]=.3
            incoming['other'][:,1000:1200]=.1
            audio,timeline=preview.mix_cues(outgoing,incoming,40,20,.5,[])
            self.assertAlmostEqual(float(audio[0,2000]),.2,places=5)
            self.assertAlmostEqual(float(audio[0,5100]),.6,places=5,msg='incoming source-prefix other/groove is retained')
            self.assertAlmostEqual(float(audio[0,24500]),.5,places=5,msg='outgoing voice is not cut at rhythm handover')
            self.assertEqual(timeline['events'][3]['at'],24)
            with self.assertRaisesRegex(ValueError,'coverage'):
                preview.mix_cues(outgoing,incoming,10,20,.5,[])

    def test_invalid_method_or_cue_cannot_be_used(self):
        with self.assertRaises(ValueError):
            model_path('../anything')
        with self.assertRaises(ValueError):
            preview.choose_cue({'incoming':[]},'incoming',0)


if __name__=='__main__':
    unittest.main()
