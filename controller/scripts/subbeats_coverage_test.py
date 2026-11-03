"""Persistent cue coverage with synthetic audio; no models or codecs."""
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch,Mock
import numpy as np
import analyze_worker as worker
import subbeats_coverage as coverage
from subbeats_cache import prepare_cached,digest


class CoverageTests(unittest.TestCase):
    def test_bounds_and_persistent_reuse_source_budget_and_parent_binding(self):
        from subbeats_cue_preview import passage_plan
        self.assertEqual(coverage.coverage_regions({},300),[])
        self.assertEqual(coverage.coverage_regions(dict(incoming=[{}],outgoing=[{}]),300),[('head',0.,130.),('exit',180.,300)])
        for bpm in [112,120,130]:
            for arrival in [16,32,60]:
                plan=passage_plan(dict(sourceSeconds=254,bpm=120,phraseEndSeconds=270),dict(sourceSeconds=arrival,bpm=bpm),300,300)
                self.assertGreaterEqual(plan['first'],180);self.assertLessEqual(plan['incoming_end'],130)
        def load(_folder,record,name,**opts):
            region=next(r for r in record['metadata']['stem_regions'] if r['name']==name)
            start=opts.get('start_seconds',region['start_sample']/100)
            end=opts.get('end_seconds',region['end_sample']/100)
            return {stem:np.full((2,round((end-start)*100)),.1,dtype=np.float32) for stem in ['drums','bass','other','vocals']},None
        def write(stage,name,parts):
            for stem in parts:(stage/f'{name}-{stem}.flac').write_bytes(b'codec checked elsewhere')
            return 1.,sum(parts.values())
        def separate(_source,stage,regions,_model):
            result=[]
            for name,start,end in regions:
                parts,_=load(None,dict(metadata=dict(stem_regions=[dict(name=name,start_sample=round(start*100),end_sample=round(end*100))])),name)
                write(stage,name,parts)
                result.append(dict(name=name,start_sample=round(start*100),end_sample=round(end*100),sample_rate=100,storage_gain=1.))
            return result
        with tempfile.TemporaryDirectory() as tmp:
            state=Path(tmp);(state/'subbeats').mkdir();(state/'subbeats/.cache-id').write_text('shared-cache-identity')
            root=state/'stems';root.mkdir();(root/'.subwave-stems').touch();artifacts=root/'track/subbeats/v1'
            source=state/'source';source.write_bytes(b'original')
            def base(stage):
                (stage/'analysis.json').write_text(json.dumps(dict(duration_seconds=180)));return dict(stem_regions=[])
            parent=prepare_cached(state,dict(source_sha256=digest(source),separator=dict(model='htdemucs',overlap=.25)),base,cache_root=artifacts)
            def cue_build(stage):(stage/'cues.json').write_text('{}');return {}
            cue=prepare_cached(state,dict(mode='cue-points'),cue_build,cache_root=artifacts)
            cues=dict(artifactKey=Path(cue['directory']).name,incoming=[{}],outgoing=[{}])
            allowance=dict(root=root,bytes=100000);folder=Path(parent['directory']);before=(folder/'manifest.json').read_bytes()
            def prepare(parent=parent,cues=cues,budget=allowance):
                return coverage.prepare_coverage(source,state,Path(parent['directory']),parent,cues,cache_root=artifacts,allowance=budget,expected_cache_id='shared-cache-identity')
            with (patch.object(coverage,'STEM_SR',100),patch('subbeats_preview.load_region',side_effect=load),
                  patch.object(coverage,'separate_regions',side_effect=separate) as separator,
                  patch.object(coverage,'write_flac_region',side_effect=write),patch.object(worker,'_model_lock',threading.Lock()),
                  patch.object(worker,'DEMUCS_MODEL','htdemucs'),patch.object(worker,'DEMUCS_OVERLAP',.25),
                  patch.object(worker,'get_vocal_detector',return_value=Mock()) as detector):
                first,used=prepare();self.assertTrue(used);self.assertEqual(separator.call_count,1)
                self.assertEqual(first['incoming']['coverageEndSeconds'],130)
                self.assertEqual(first['outgoing']['coverageStartSeconds'],60)
                self.assertEqual(first['outgoing']['coverageEndSeconds'],180)
                left=allowance['bytes'];again,used=prepare()
                self.assertEqual(again,first);self.assertFalse(used);self.assertEqual(allowance['bytes'],left);self.assertEqual(detector.call_count,1)
                coverage.load_coverage(state,root,'track',first['artifactKey'],folder,cues['artifactKey'])
                self.assertEqual((folder/'manifest.json').read_bytes(),before)
                import subbeats_prepare
                req=dict(state_dir=str(state),cache_id='shared-cache-identity',path=str(source),complete=True,
                         stems_root=str(root),track_id='track',remaining_bytes=100000,method='small0',
                         bundle_key=folder.name,cue_key=cues['artifactKey'])
                with (patch('subbeats_cues.load_cues',return_value=dict(version=1,algorithmVersion=3,model='small0',durationSeconds=180,incoming=[{}],outgoing=[{}])),
                      patch('subbeats_cues.prepare_cues') as predict,patch('subbeats_prepare.prepare') as base_prepare,
                      patch('subbeats_structure.prepare_structure') as structure,patch('subbeats_suitability.assess_bundle',return_value={})):
                    upgraded=subbeats_prepare.prepare_request(req)
                    predict.assert_not_called();base_prepare.assert_not_called();structure.assert_not_called()
                    self.assertEqual(upgraded['subbeats_result']['bundleKey'],folder.name)
                    self.assertEqual(upgraded['subbeats_result']['cuePoints']['algorithmVersion'],3)
                    self.assertEqual(upgraded['subbeats_result']['cueCoverage'],first)
                    self.assertFalse(upgraded['subbeats_used_models'])
                source.write_bytes(b'replaced')
                with self.assertRaisesRegex(ValueError,'source changed'):prepare()
                source.write_bytes(b'original')
                enough=prepare_cached(state,dict(source_sha256=digest(source),extra='covered'),lambda stage:base(stage)|dict(stem_regions=[dict(name=n,start_sample=0,end_sample=18000,sample_rate=100) for n in ['head','exit']]),cache_root=artifacts)
                detector.reset_mock();_,used=prepare(parent=enough);self.assertFalse(used);detector.assert_not_called()
                with self.assertRaisesRegex(ValueError,'no longer matches'):
                    coverage.load_coverage(state,root,'track',first['artifactKey'],Path(enough['directory']),cues['artifactKey'])
                alternate=prepare_cached(state,dict(mode='cue-points',alternate=True),cue_build,cache_root=artifacts)
                with self.assertRaisesRegex(RuntimeError,'budget reached'):
                    prepare(cues={**cues,'artifactKey':Path(alternate['directory']).name},budget=dict(root=root,bytes=0))
                self.assertFalse(list(artifacts.glob('.pending-*')))


if __name__=='__main__':unittest.main()
