"""Isolated real-audio Sub/Beats and ordinary stems timing. Requires heavy dependencies.

Run with a complete source file and an EMPTY output directory. Writes no station
settings or queue state. Phase totals are nested, not additive. External source
fetching, lyric lookup, queue wait and cache migration are outside this DSP scan.
"""
import argparse
import json, time, sys, shutil, functools
parser=argparse.ArgumentParser(description=__doc__)

from pathlib import Path
parser.add_argument('--source',required=True,type=Path)
parser.add_argument('--output',required=True,type=Path)
args=parser.parse_args()
if args.output.exists() and any(args.output.iterdir()):
    parser.error('output directory must be empty to measure fresh preparations')
args.output.mkdir(parents=True,exist_ok=True)
started=time.perf_counter()
sys.path.insert(0,str(Path(__file__).resolve().parent))
import torch
torch.set_num_threads(2)
import librosa
import analyze_worker as worker
import subbeats_prepare as prepare
import subbeats_cues as cues
import subbeats_coverage as coverage
import subbeats_vocals as vocals
metrics={}; events=[]
def wrap(obj,name,label):
    original=getattr(obj,name)
    @functools.wraps(original)
    def measured(*args,**kwargs):
        t=time.perf_counter()
        try: return original(*args,**kwargs)
        finally:
            sec=time.perf_counter()-t
            metrics[label]=metrics.get(label,0)+sec
            events.append(dict(phase=label,seconds=sec))
            print(json.dumps(dict(phase=label,seconds=round(sec,3))),flush=True)
    setattr(obj,name,measured)
wrap(prepare,'decode','decode_audio')
wrap(cues,'predict','beat_this_cpu')
wrap(worker.VocalActivityDetector,'separate','demucs_gpu')
wrap(vocals,'measure_silero','silero_vad_cpu')
wrap(prepare,'prepare_cue_source','source_preparation')
wrap(cues,'prepare_cues','cue_detection_total')
wrap(coverage,'prepare_coverage','coverage_total')
root=args.output; state=root/'state'; stems=state/'stems'
(state/'subbeats').mkdir(parents=True,exist_ok=True);stems.mkdir(exist_ok=True)
key='isolated-subbeats-benchmark'
(state/'subbeats'/'.cache-id').write_text(key)
(stems/'.subwave-stems').write_text('{}')
t=time.perf_counter();shutil.copyfile(args.source,root/'source.mp3');copy_sec=time.perf_counter()-t
result=dict(bootstrap_seconds=time.perf_counter()-started,copy_seconds=copy_sec,device=str(worker.resolve_device()),runs=[])
source=str(root/'source.mp3')
for method in ['small0']:
    for attempt in ['fresh-1','fresh-2','cache-hit']:
        metrics.clear();events.clear();t=time.perf_counter()
        answer=prepare.prepare_request(dict(path=source,state_dir=str(state),stems_root=str(stems),track_id=method+('-1' if attempt == 'fresh-1' else '-2'),
            cache_id=key,complete=True,remaining_bytes=4*1024**3,method=method))
        run=dict(method=method,attempt=attempt,seconds=time.perf_counter()-t,added_bytes=answer['cache_added_bytes'],
            phases=dict(metrics),events=list(events),status=answer['subbeats_result']['status'],
            cue_counts={r:len(answer['subbeats_result']['cuePoints'][r]) for r in ['incoming','outgoing']})
        result['runs'].append(run);(root/'results.json').write_text(json.dumps(result,indent=2))
        print(json.dumps(dict(run=run)),flush=True)
metrics.clear();events.clear()
t=time.perf_counter();edges=worker.whole_file_facets(source,['edges']);edge_seconds=time.perf_counter()-t
placement=worker.tail_window_from_edges(edges.get('edges'))
ordinary=stems/'ordinary'
src=worker.FileSource(source,complete=True);src.open(librosa)
t=time.perf_counter()
answer=worker.analyze_facets(librosa,src,['stems'],stems_dir=str(ordinary),stems_require_marker=True,tail_window=placement)
seconds=time.perf_counter()-t
src.close()
result['ordinary']=dict(seconds=seconds,edges_seconds=edge_seconds,phases=dict(metrics),answer=answer,
    bytes=sum(p.stat().st_size for p in ordinary.rglob('*') if p.is_file()))
result['total_seconds']=time.perf_counter()-started
(root/'results.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result),flush=True)
