"""Cue evidence and preview geometry; no models, library or runtime state."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import subbeats_cache as cache
import subbeats_cues as cues
import subbeats_cue_preview as preview
from subbeats_models import model_path


class CueTests(unittest.TestCase):
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

    def test_cue_artifact_is_bound_to_the_verified_stem_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            state=Path(tmp); bundle=state/'stems'; bundle.mkdir()
            (bundle/'manifest.json').write_text('source-one')
            identity=dict(mode='cue-points',version=cues.VERSION,bundle_sha256=cache.digest(bundle/'manifest.json'))
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
