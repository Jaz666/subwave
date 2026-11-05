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
import subbeats_cue_matching as matching
import subbeats_cue_preview as preview
from subbeats_models import model_path


class CueTests(unittest.TestCase):
    def test_pair_planner_ranks_prepared_bar_combinations_by_fit(self):
        outgoing=[dict(sourceSeconds=160,phraseEndSeconds=192,phraseBars=16,bpm=120),
                  dict(sourceSeconds=168,phraseEndSeconds=184,phraseBars=8,bpm=120)]
        incoming=[dict(sourceSeconds=32,phraseBars=16,bpm=120),
                  dict(sourceSeconds=16,phraseBars=8,bpm=120),
                  dict(sourceSeconds=32,phraseBars=16,bpm=108)]
        plans=matching.plan_pair_transitions(outgoing,incoming,210,180)
        self.assertEqual((plans[0]['outgoingCueIndex'],plans[0]['incomingCueIndex']),(0,0))
        self.assertEqual((plans[0]['outgoingBars'],plans[0]['incomingBars']),(16,16))
        self.assertEqual(plans[0]['outgoingTimeToEndSeconds'],-50)
        self.assertEqual(plans[0]['incomingSeconds'],32)
        self.assertFalse(any(plan['incomingCueIndex']==2 for plan in plans),'incompatible tempo is excluded')

    def test_regular_fallback_preview_uses_station_crossfade_and_reports_its_mode(self):
        out=np.full((2,1000),.5,dtype=np.float32)
        inc=np.full((2,800),.7,dtype=np.float32)
        req=dict(source_urls=['out','in'],crossfade_seconds=2,equal_power_crossfade=False)
        with patch.object(preview,'STEM_SR',100),patch('subbeats_reference_preview.source_audio',side_effect=[out,inc]):
            audio,result=preview.render_regular_fallback(req,[None,None],[{},{}],[0,0],object())
        self.assertEqual(result['timeline']['kind'],'regular-fallback')
        self.assertEqual(audio.shape,(2,1000))
        self.assertAlmostEqual(float(audio[0,399]),.5,places=3)
        self.assertAlmostEqual(float(audio[0,500]),.6,places=2)
        self.assertAlmostEqual(float(audio[0,700]),.7,places=2)

    def test_auto_pair_without_saved_cues_uses_regular_fallback(self):
        req=dict(auto_plan=True,cue_keys=[None,None])
        result=(np.zeros((2,1),dtype=np.float32),{'timeline':{'kind':'regular-fallback'}})
        with patch.object(preview,'render_regular_fallback',return_value=result) as fallback:
            self.assertIs(preview.render_automatic_transition(req,[],[],[],object())[1],result[1])
        fallback.assert_called_once()

    def test_new_analysis_reads_the_full_source_without_legacy_stem_limits(self):
        with tempfile.TemporaryDirectory() as tmp:
            state=Path(tmp);source=state/'source';source.write_bytes(b'complete recording')
            bundle=state/'bundle';bundle.mkdir()
            record=dict(identity=dict(source_sha256=cache.digest(source)),metadata=dict(stem_regions=[]))
            (bundle/'manifest.json').write_text(json.dumps(record))
            beats=np.arange(0,200,.5)
            roles=dict(incoming=[dict(sourceSeconds=42.6,bpm=137)],
                       outgoing=[dict(sourceSeconds=160,bpm=137)],grid=None,ending=None)
            with (patch.dict('sys.modules',librosa=SimpleNamespace(__version__='test')),
                  patch('subbeats_prepare.SR',10),patch('subbeats_prepare.decode',return_value=np.zeros((1,2000))),
                  patch('subbeats_prepare.require_shared_cache'),
                  patch.object(cues,'predict',return_value=(beats,beats[::4])),
                  patch.object(cues,'fitted_passages',return_value=roles) as detect,
                  patch('importlib.metadata.version',return_value='1.1.0')):
                result=cues.prepare_cues(source,state,bundle,record,'small0',cache_root=None,allowance=None,expected_cache_id='test')
            self.assertEqual(len(detect.call_args.args[0]),2000)
            self.assertEqual(result['durationSeconds'],200)
            self.assertEqual(result['algorithmVersion'],6)
            self.assertEqual(result['incoming'],roles['incoming'])
            self.assertEqual(result['outgoing'],roles['outgoing'])

    def test_opening_grid_refits_a_stable_sixteen_bar_tempo_drift(self):
        origin=1.04; fast=60/114.03; slow=60/112.96
        beats=origin+np.r_[0.,np.cumsum(np.linspace(fast,slow,64))]
        downbeats=beats[::4]
        arrivals=cues.opening_grid_incoming(beats,downbeats,[dict(start_seconds=0,end_seconds=60,bpm=114.03)],80)
        self.assertEqual([cue['phraseBars'] for cue in arrivals],[8,16])
        first_window=cues.stable_beat_windows(beats,downbeats)[0][0]
        self.assertAlmostEqual(arrivals[0]['sourceSeconds'],origin+32*60/first_window['bpm'],places=3,
                               msg='the accepted 8-bar opening remains on its local rate')
        self.assertGreater(arrivals[1]['sourceSeconds'],origin+64*fast+.1)
        self.assertLess(arrivals[1]['bpm'],arrivals[0]['bpm'])
        self.assertLess(abs(arrivals[1]['sourceSeconds']-(origin+32*fast+32*slow)),.01)

    def test_opening_grid_keeps_irregular_sixteen_bar_spans_on_the_review_route(self):
        origin=.32; period=60/125.6
        beats=origin+np.arange(65)*period
        beats[10]+=.3
        self.assertIsNone(cues.refit_opening_sixteen(beats,origin,125.6),
                          'an irregular early grid must retain its existing candidate')

    def test_projected_grid_preserves_long_intro_phase_and_echo_beyond_the_outro(self):
        # Synthetic pulses exercise timing/selection. Real-track checks cover the
        # actual band filter; the stdlib/NumPy test runner needs no SciPy install.
        signal=SimpleNamespace(butter=lambda *a,**k:None,sosfiltfilt=lambda _,y:y)
        sr=1000;origin=16.3;entry=48.3;endpoint=272.3;duration=276.3
        y=np.zeros(round(duration*sr),dtype=np.float32)
        beats=np.arange(.3,duration-2,.5)
        for at in beats:
            if entry-1e-6<=at<=endpoint+.01:
                y[round(at*sr):round((at+.12)*sr)]=.2
        t=np.arange(1600)/sr
        y[round(endpoint*sr):round(endpoint*sr)+len(t)]+=.1*np.exp(-t*3)
        bars=beats[::4]
        # Simulate late model downbeats shifting by two beats; fixed bar phase
        # should survive rather than being renumbered by each model label.
        shifted=np.r_[bars[bars<190],beats[2::4][beats[2::4]>=190]]
        with patch.dict('sys.modules',{'scipy':SimpleNamespace(),'scipy.signal':signal}):
            result=cues.fitted_passages(y,sr,beats,shifted)
            self.assertAlmostEqual(result['grid']['originSeconds'],origin,places=5)
            self.assertAlmostEqual(result['grid']['drivingBeatSeconds'],entry,places=5)
            self.assertAlmostEqual(result['incoming'][0]['sourceSeconds'],entry,places=5)
            self.assertEqual(len(result['incoming']),1,'do not promote the earlier beatless eight-bar point')
            self.assertEqual([p['barNumber'] for p in result['outgoing']],[112,120])
            self.assertAlmostEqual(result['ending']['phraseEndSeconds'],endpoint,places=5)
            self.assertGreater(result['ending']['audibleEndSeconds'],endpoint+1)
            self.assertEqual(result['ending']['confidence'],'estimated')
            self.assertGreater(result['grid']['phaseDisagreements'],0)
            self.assertTrue(all(p['timingSource']=='fitted-grid' for p in result['outgoing']))
            # A recording still loud at EOF supplies no natural ending evidence.
            self.assertEqual(cues.fitted_passages(np.full_like(y,.2),sr,beats,shifted)['incoming'],[])
            y[-200:]=.2
            self.assertEqual(cues.fitted_passages(y,sr,beats,shifted)['outgoing'],[])
            with self.assertRaisesRegex(ValueError,'Invalid learned'):
                cues.fitted_passages(y,sr,beats[::-1],shifted)

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

    def test_selected_passages_align_arrivals_and_keep_complete_prefix_and_ending(self):
        out=dict(sourceSeconds=160,bpm=120,phraseEndSeconds=190)
        for arrival in (16,32):
            plan=preview.passage_plan(out,dict(sourceSeconds=arrival,bpm=120),210,180)
            self.assertEqual(plan['handover'],190)
            self.assertEqual(plan['entry']+arrival,190)
            self.assertEqual(plan['out_end'],210)
        plan=preview.passage_plan(out,dict(sourceSeconds=32,bpm=120),210,180)
        sr=1000
        with patch.object(preview,'STEM_SR',sr):
            outgoing={s:np.zeros((2,56000),dtype=np.float32) for s in preview.STEMS}
            incoming={s:np.zeros((2,52000),dtype=np.float32) for s in preview.STEMS}
            outgoing['vocals'][:]=.2; incoming['vocals'][:]=.3
            outgoing['drums'][:,37000:38000]=.1
            incoming['other'][:,1000:1200]=.1
            audio,timeline=preview.mix_passages(outgoing,incoming,plan)
            self.assertAlmostEqual(float(audio[0,2000]),.2,places=5)
            self.assertAlmostEqual(float(audio[0,5100]),.6,places=5,msg='source-prefix groove is retained')
            self.assertAlmostEqual(float(audio[0,55000]),.5,places=5,msg='outgoing voice survives to the natural ending')
            self.assertEqual(next(e['at'] for e in timeline['events'] if 'arrival meets' in e['label']),36)
            self.assertEqual(timeline['duration'],56)
            self.assertAlmostEqual(float(audio[0,37500]),.6,places=5,msg='outro rhythm echo survives beyond the phrase marker')
            self.assertEqual(timeline['events'],sorted(timeline['events'],key=lambda e:e['at']))
        with self.assertRaisesRegex(ValueError,'120 seconds'):
            preview.passage_plan(out,dict(sourceSeconds=32,bpm=120),400,180)
        with self.assertRaisesRegex(ValueError,'8%'):
            preview.passage_plan(out,dict(sourceSeconds=32,bpm=90),210,180)

    def test_missing_coverage_is_separated_temporarily_and_existing_coverage_is_reused(self):
        import threading
        from unittest.mock import Mock
        import subbeats_preview as base
        import subbeats_prepare as prepare
        class Detector:
            def separate(self,audio):
                return {s:audio/4 for s in preview.STEMS}
        detector=Mock(wraps=Detector())
        worker=SimpleNamespace(DEMUCS_MODEL='htdemucs',DEMUCS_OVERLAP=.25,_model_lock=threading.Lock(),get_vocal_detector=Mock(return_value=detector),_touch_heavy=Mock())
        audio=np.full((2,40000),.1,dtype=np.float32)
        saved={}
        def write(stage,name,parts):
            saved[name]=parts
            for stem in preview.STEMS:
                (stage/f'{name}-{stem}.flac').write_bytes(b'codec tested separately')
            return 1.,sum(parts.values())
        def load(_folder,record,name,**opts):
            region=record['metadata']['stem_regions'][0]
            start=0 if opts.get('start_seconds') is None else round(opts['start_seconds']*1000)-region['start_sample']
            stop=region['end_sample']-region['start_sample'] if opts.get('end_seconds') is None else round(opts['end_seconds']*1000)-region['start_sample']
            return {s:part[:,start:stop] for s,part in saved[name].items()},None
        with tempfile.TemporaryDirectory() as tmp, patch.dict('sys.modules',analyze_worker=worker), \
                patch.object(preview,'STEM_SR',1000),patch.object(base,'STEM_SR',1000),patch.object(prepare,'STEM_SR',1000), \
                patch('subbeats_reference_preview.source_audio',return_value=audio) as source, \
                patch.object(prepare,'write_flac_region',side_effect=write),patch.object(preview,'load_region',side_effect=load):
            root=Path(tmp)
            record=dict(metadata=dict(stem_regions=[]),files={})
            req=dict(state_dir=tmp,source_urls=['https://source/out','https://source/in'])
            parts,extended=preview.cue_region(req,0,root,record,'exit',10,32,object())
            self.assertTrue(extended); self.assertEqual(parts['other'].shape,(2,22000))
            self.assertTrue(np.allclose(sum(parts.values()),.1,atol=1e-6))
            self.assertEqual(detector.separate.call_count,1)
            self.assertFalse(list(root.rglob('.cue-region-*')))
            coverage=prepare.separate_regions(None,root,[('head',0,30)],Detector(),audio=audio)
            covered=dict(metadata=dict(stem_regions=coverage),files={p.name:{} for p in root.glob('*.flac')})
            source.reset_mock();detector.reset_mock()
            reused,extended=preview.cue_region(req,1,root,covered,'head',0,20,object())
            self.assertFalse(extended);self.assertEqual(reused['vocals'].shape,(2,20000))
            source.assert_not_called();detector.separate.assert_not_called()
            incoming_parts,extended=preview.cue_region(req,1,root,record,'head',0,32,object())
            self.assertTrue(extended);self.assertEqual(incoming_parts['vocals'].shape,(2,32000))
            self.assertEqual(source.call_args.args[0],'https://source/in')
            wrong={**record,'identity':dict(separator=dict(model='other',overlap=.25))}
            with self.assertRaisesRegex(ValueError,'Separation settings differ'):
                preview.cue_region(req,0,root,wrong,'exit',10,32,object())
            worker.get_vocal_detector.return_value=None
            with self.assertRaisesRegex(ValueError,'heavy analyzer'):
                preview.cue_region(req,0,root,record,'exit',10,32,object())
            self.assertFalse(list(root.rglob('.cue-region-*')))

    def test_cue_matching_checks_vocals_on_the_actual_tempo_adjusted_timeline(self):
        from subbeats_cue_matching import assess_vocal_pair, find_cue_matches
        def activity(start,end,passages):
            return dict(coverageStartSeconds=start,coverageEndSeconds=end,resolutionSeconds=.05,
                        passages=[dict(startSeconds=a,endSeconds=b) for a,b in passages])
        out_cue=dict(sourceSeconds=160,bpm=120,phraseEndSeconds=190)
        # Arrival at 16s enters at source174; arrival32 enters at158.
        out=dict(id='out',title='out',artist='A',status='prepared',cuePoints=dict(
            algorithmVersion=5,outgoing=[out_cue],durationSeconds=210),suitability=dict(outgoing=dict(
            vocalActivity=activity(150,210,[(170,178)]))))
        inc=dict(id='in',title='in',artist='B',status='prepared',cuePoints=dict(
            algorithmVersion=5,incoming=[dict(sourceSeconds=16,bpm=120),dict(sourceSeconds=32,bpm=120,phraseBars=16)],
            durationSeconds=180),suitability=dict(incoming=dict(vocalActivity=activity(0,100,[(0,3)]))))
        result=find_cue_matches([out,inc],'out')
        self.assertEqual(result['matches'][0]['incomingCueIndex'],1,'exclude conflicting first cue, retain original second index')
        self.assertEqual(result['matches'][0]['vocal']['status'],'estimated')
        plan=preview.passage_plan(out_cue,dict(sourceSeconds=32,bpm=120),210,180)
        plan['rate']=2 # Test coordinate conversion independently of tempo admission.
        self.assertEqual(assess_vocal_pair(activity(150,210,[(170,178)]),activity(0,120,[(26,30)]),plan)['status'],'conflict')
        self.assertEqual(assess_vocal_pair(activity(150,180,[]),activity(0,120,[]),plan)['status'],'coverage')
        self.assertEqual(assess_vocal_pair(activity(150,210,[]),activity(0,120,[]),plan)['status'],'uncertain')
        self.assertEqual(assess_vocal_pair(activity(160,210,[]),activity(0,100,[(0,1)]),preview.passage_plan(out_cue,dict(sourceSeconds=32,bpm=120),210,180))['status'],'conflict')
        inc['cuePoints']['incoming']=inc['cuePoints']['incoming'][:1]
        self.assertEqual(find_cue_matches([out,inc],'out')['excluded']['vocals'],1)
        inc['cuePoints']['incoming'][0]['bpm']=90
        self.assertEqual(find_cue_matches([out,inc],'out')['excluded']['tempo'],1)
        inc.pop('suitability');inc['cuePoints']['incoming'][0]['bpm']=120
        self.assertEqual(find_cue_matches([out,inc],'out')['matches'][0]['vocal']['status'],'unassessed')
        with self.assertRaises(ValueError):
            find_cue_matches([out,inc],'out',7)

    def test_cue_matching_suggests_a_two_bar_drum_loop_for_a_clearable_vocal_clash(self):
        from subbeats_cue_matching import find_cue_matches
        def activity(start,end,passages):
            return dict(coverageStartSeconds=start,coverageEndSeconds=end,resolutionSeconds=.05,
                        passages=[dict(startSeconds=a,endSeconds=b) for a,b in passages])
        outgoing=dict(id='out',title='out',artist='A',status='prepared',cuePoints=dict(
            algorithmVersion=5,outgoing=[dict(sourceSeconds=160,bpm=120,phraseEndSeconds=190)],durationSeconds=210),
            cueCoverage=dict(outgoing=activity(150,210,[(170,200)])))
        incoming=dict(id='in',title='in',artist='B',status='prepared',cuePoints=dict(
            algorithmVersion=5,incoming=[dict(sourceSeconds=16,bpm=120,phraseBars=8,timingSource='fitted-grid')],durationSeconds=180),
            cueCoverage=dict(incoming=activity(0,100,[(25,35)])))
        match=find_cue_matches([outgoing,incoming],'out')['matches'][0]
        self.assertEqual(match['transition']['method'],'drum-loop')
        self.assertEqual(match['transition']['repeatCount'],1)
        self.assertEqual(match['vocal']['status'],'estimated')

        incoming['cueCoverage']['incoming']=activity(0,100,[(17,19)])
        self.assertEqual(find_cue_matches([outgoing,incoming],'out')['excluded']['vocals'],1)

    def test_drum_loop_repeats_drums_and_holds_the_other_incoming_stems(self):
        from subbeats_cue_preview import insert_incoming_drum_loop
        frames=round(.1*preview.STEM_SR)
        parts={name:np.full((2,frames),.1,dtype=np.float32) for name in preview.STEMS}
        loop=dict(startSeconds=.02,loopSeconds=.02,repeats=1)
        looped=insert_incoming_drum_loop(parts,loop)
        start=round(loop['startSeconds']*preview.STEM_SR)
        length=round(loop['loopSeconds']*preview.STEM_SR)
        stop=start+length
        self.assertEqual(looped['drums'].shape[1],frames+length)
        np.testing.assert_array_equal(looped['drums'][:,stop:stop+length],parts['drums'][:,start:stop])
        self.assertFalse(np.any(looped['bass'][:,stop:stop+length]))
        self.assertFalse(np.any(looped['other'][:,stop:stop+length]))
        self.assertFalse(np.any(looped['vocals'][:,stop:stop+length]))

    def test_cue_renderer_refuses_detected_overlap_without_cutting_either_vocal(self):
        out_cue=dict(sourceSeconds=160,bpm=120,phraseEndSeconds=190)
        inc_cue=dict(sourceSeconds=32,bpm=120)
        outgoing={s:np.zeros((2,56000),dtype=np.float32) for s in preview.STEMS}
        incoming={s:np.zeros((2,52000),dtype=np.float32) for s in preview.STEMS}
        outgoing['drums'][:]=.1;incoming['drums'][:]=.1
        outgoing['vocals'][:,16000:26000]=.3 # source170–180
        incoming['vocals'][:,15000:20000]=.3 # source173–178 after placement
        before=incoming['vocals'].copy()
        with tempfile.TemporaryDirectory() as tmp:
            folders=[Path(tmp)/name for name in ['out','in']]
            for folder,duration in zip(folders,[210,180]):
                folder.mkdir();(folder/'analysis.json').write_text(json.dumps(dict(duration_seconds=duration)))
            req=dict(state_dir=tmp,track_ids=['out','in'],cue_keys=['a','b'])
            with (patch.dict('sys.modules',librosa=SimpleNamespace()),
                  patch.object(cues,'load_cues',return_value=dict(algorithmVersion=5,outgoing=[out_cue],incoming=[inc_cue])),
                  patch.object(preview,'STEM_SR',1000),
                  patch.object(preview,'cue_region',side_effect=[(outgoing,False),(incoming,False)])):
                with self.assertRaisesRegex(ValueError,'vocal passages overlap'):
                    preview.render_cue_preview(req,folders,[{},{}],[0,0])
            np.testing.assert_array_equal(incoming['vocals'],before)
            # A complete earlier incoming line fits, without moving or muting it.
            incoming['vocals'][:]=0;incoming['vocals'][:,1000:4000]=.3
            with (patch.dict('sys.modules',librosa=SimpleNamespace()),
                  patch.object(cues,'load_cues',return_value=dict(algorithmVersion=5,outgoing=[out_cue],incoming=[inc_cue])),
                  patch.object(preview,'STEM_SR',1000),
                  patch.object(preview,'cue_region',side_effect=[(outgoing,False),(incoming,False)])):
                audio,result=preview.render_cue_preview(req,folders,[{},{}],[0,0])
                self.assertGreater(float(audio[0,6500]),.3)
                self.assertEqual(result['incoming_rate'],1)
            # A prepared coverage artifact bypasses temporary extension/source work.
            req['_cue_coverage']=[(folders[0],dict(metadata=dict(stem_regions=[dict(name='exit',start_sample=154000)]))),(folders[1],dict(metadata=dict(stem_regions=[dict(name='head',start_sample=0)])))]
            with (patch.dict('sys.modules',librosa=SimpleNamespace()),
                  patch.object(cues,'load_cues',return_value=dict(algorithmVersion=5,outgoing=[out_cue],incoming=[inc_cue])),
                  patch.object(preview,'STEM_SR',1000),
                  patch.object(preview,'load_region',side_effect=[(outgoing,None),(incoming,None)]) as load,
                  patch.object(preview,'cue_region') as temporary):
                preview.render_cue_preview(req,folders,[{},{}],[0,0])
                temporary.assert_not_called();self.assertEqual(load.call_count,2)
            # Only closing stems are saved. An earlier original-mix prefix
            # preserves a long incoming intro without separating extra stems.
            req['source_urls']=['https://example.invalid/out','https://example.invalid/in']
            req['_cue_coverage'][0][1]['metadata']['stem_regions'][0]['start_sample']=160000
            source=np.full((2,210000),.1,dtype=np.float32)
            with (patch.dict('sys.modules',librosa=SimpleNamespace()),
                  patch.object(cues,'load_cues',return_value=dict(algorithmVersion=5,outgoing=[out_cue],incoming=[inc_cue])),
                  patch.object(preview,'STEM_SR',1000),
                  patch.object(preview,'load_region',side_effect=[(dict((s,a[:,6000:]) for s,a in outgoing.items()),None),(incoming,None)]),
                  patch('subbeats_reference_preview.source_audio',return_value=source)):
                with self.assertRaisesRegex(ValueError,'vocal passages overlap'):
                    preview.render_cue_preview(req,folders,[{},{}],[0,0],fetch_source=object())
            incoming['vocals'][:]=0;incoming['vocals'][:,5000:7000]=.3
            with (patch.dict('sys.modules',librosa=SimpleNamespace()),
                  patch.object(cues,'load_cues',return_value=dict(algorithmVersion=5,outgoing=[out_cue],incoming=[inc_cue])),
                  patch.object(preview,'STEM_SR',1000),
                  patch.object(preview,'load_region',side_effect=[(dict((s,a[:,6000:]) for s,a in outgoing.items()),None),(incoming,None)]),
                  patch('subbeats_reference_preview.source_audio',return_value=source)):
                audio,result=preview.render_cue_preview(req,folders,[{},{}],[0,0],fetch_source=object())
                self.assertAlmostEqual(float(audio[0,1000]),.1,places=5)
                self.assertFalse(result['used_models'])

    def test_cue_renderer_applies_the_suggested_drum_loop_and_rechecks_vocals(self):
        out_cue=dict(sourceSeconds=160,bpm=120,phraseEndSeconds=190)
        in_cue=dict(sourceSeconds=16,bpm=120,phraseBars=8,timingSource='fitted-grid')
        outgoing={s:np.zeros((2,56000),dtype=np.float32) for s in preview.STEMS}
        incoming={s:np.zeros((2,52000),dtype=np.float32) for s in preview.STEMS}
        outgoing['drums'][:]=.1;incoming['drums'][:]=.1
        outgoing['vocals'][:,44000:50000]=.3 # source200–206
        incoming['vocals'][:,25000:35000]=.3 # source25–35 after placement
        with tempfile.TemporaryDirectory() as tmp:
            folders=[Path(tmp)/name for name in ['out','in']]
            for folder,duration in zip(folders,[210,180]):
                folder.mkdir();(folder/'analysis.json').write_text(json.dumps(dict(duration_seconds=duration)))
            req=dict(state_dir=tmp,track_ids=['out','in'],cue_keys=['a','b'])
            with (patch.dict('sys.modules',librosa=SimpleNamespace()),
                  patch.object(cues,'load_cues',return_value=dict(algorithmVersion=5,outgoing=[out_cue],incoming=[in_cue])),
                  patch.object(preview,'STEM_SR',1000),
                  patch.object(preview,'cue_region',side_effect=[(outgoing,False),(incoming,False)])):
                audio,result=preview.render_cue_preview(req,folders,[{},{}],[0,0])
        self.assertEqual(result['transition']['method'],'drum-loop')
        self.assertEqual(result['transition']['repeats'],2)
        self.assertEqual(audio.shape[1],54000)
        loop_events=[event for event in result['timeline']['events'] if 'drums loop' in event['label']]
        self.assertEqual(len(loop_events),1)



    def test_invalid_method_or_cue_cannot_be_used(self):
        with self.assertRaises(ValueError):
            model_path('../anything')
        with self.assertRaises(ValueError):
            preview.choose_cue({'incoming':[]},'incoming',0)


if __name__=='__main__':
    unittest.main()
