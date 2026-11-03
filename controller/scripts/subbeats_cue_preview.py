"""Selected closing/opening passage auditions, with bounded missing stem coverage.

Keep original source zero and the outgoing recording's natural end. Temporary
extensions belong to this preview; normal prepared bundles are never rewritten.
"""
import json
import math
from pathlib import Path
import tempfile

from subbeats_preview import STEM_SR, STEMS, load_region


def choose_cue(cues, role, index):
    if type(index) is not int or not 0<=index<len(cues.get(role,[])):
        raise ValueError('Choose an available saved cue point')
    cue = cues[role][index]
    if not all(isinstance(cue.get(k),(int,float)) and math.isfinite(cue[k]) for k in ('sourceSeconds','bpm')) or not 60<=cue['bpm']<=190:
        raise ValueError('Invalid saved cue point. Recheck this track.')
    return cue


def passage_plan(outgoing, incoming, out_duration, in_duration):
    if not all(math.isfinite(v) and v>0 for v in (out_duration,in_duration)):
        raise ValueError('Invalid prepared recording duration. Recheck the tracks.')
    period = 60/outgoing['bpm']
    rate = outgoing['bpm']/incoming['bpm']
    if abs(rate-1)>.08:
        raise ValueError('The cue tempos differ by more than 8%. Choose another pair.')
    if abs(rate-1)<.0001:
        rate=1.
    handover = outgoing.get('phraseEndSeconds',outgoing['sourceSeconds'])
    if (not math.isfinite(handover) or not 0<=outgoing['sourceSeconds']<=handover<out_duration
            or not 4*period<=incoming['sourceSeconds']/rate<in_duration/rate):
        raise ValueError('These saved cue passages are invalid. Recheck the selected tracks.')
    entry = handover-incoming['sourceSeconds']/rate
    first = max(0.,min(outgoing['sourceSeconds'],entry)-4.)
    end = max(out_duration,handover+8*period)
    incoming_end = (end-entry)*rate
    if entry<0 or end-first>120 or incoming_end>in_duration:
        raise ValueError('These passages need a preview longer than the available recording or 120 seconds. Choose a later closing cue or shorter opening.')
    return dict(first=first,end=end,out_end=out_duration,entry=entry,handover=handover,
                out_cue=outgoing['sourceSeconds'],incoming_end=incoming_end,rate=rate,period=period)


def cue_region(req, index, folder, record, name, start, end, fetch_source):
    region = next((r for r in record['metadata']['stem_regions'] if r['name']==name),None)
    if region and region['start_sample']/STEM_SR<=start and region['end_sample']/STEM_SR+2/STEM_SR>=end:
        parts,_=load_region(folder,record,name,limit_seconds=130,start_seconds=start,end_seconds=end,require_tempo=False)
        return parts,False
    urls = req.get('source_urls')
    if fetch_source is None or not isinstance(urls,list) or len(urls)!=2:
        raise ValueError('Update controller and analyzer together to prepare missing cue-preview coverage.')
    from urllib.parse import urlsplit
    if not isinstance(urls[index],str) or urlsplit(urls[index]).scheme not in ('http','https'):
        raise ValueError('The original recording is unavailable for extended coverage.')
    from subbeats_reference_preview import source_audio
    from subbeats_prepare import separate_regions
    from subbeats_cache import digest
    import analyze_worker as worker
    audio = source_audio(urls[index],folder,record,fetch_source,require_hash=True)
    parent = Path(req['state_dir'])/'subbeats'/'previews'
    parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.cue-region-',dir=parent) as temporary:
        stage=Path(temporary)
        with worker._model_lock:
            expected=record.get('identity',{}).get('separator',{})
            if expected and (expected.get('model')!=worker.DEMUCS_MODEL or expected.get('overlap')!=worker.DEMUCS_OVERLAP):
                raise ValueError('Separation settings differ from the saved stems. Recheck this track before extending its coverage.')
            detector=worker.get_vocal_detector(force=True)
            if detector is None:
                raise ValueError('Missing cue coverage needs the heavy analyzer with Demucs. Rebuild it, then retry the preview.')
            try:
                coverage=separate_regions(None,stage,[(name,start,end)],detector,audio=audio)
            finally:
                worker._touch_heavy()
        extended=dict(metadata=dict(stem_regions=coverage),files={p.name:dict(bytes=p.stat().st_size,sha256=digest(p)) for p in stage.iterdir()})
        parts,_=load_region(stage,extended,name,limit_seconds=130,require_tempo=False)
    return parts,True


def mix_passages(out_parts,in_parts,plan):
    import numpy as np
    duration=plan['end']-plan['first']
    total=round(duration*STEM_SR)
    begin=round((plan['entry']-plan['first'])*STEM_SR)
    arrival=plan['handover']-plan['first']
    t=np.arange(total)/STEM_SR
    cross_start=max(plan['entry']-plan['first'],arrival-4*plan['period'])
    rhythm=np.clip((t-cross_start)/(arrival-cross_start),0,1)
    audio=np.zeros((2,total),dtype=np.float32)
    for name in STEMS:
        outgoing=out_parts[name]
        incoming=in_parts[name]
        if outgoing.shape[1]<round((plan['out_end']-plan['first'])*STEM_SR)-2:
            raise ValueError('The outgoing stems do not cover the recording end.')
        if incoming.shape[1]<total-begin-2:
            raise ValueError('The incoming stems do not cover the selected passage after tempo adjustment.')
        out_frames=min(total,outgoing.shape[1])
        in_frames=min(total-begin,incoming.shape[1])
        out_env=1-rhythm[:out_frames] if name in ('drums','bass') else np.ones(out_frames)
        if name in ('other','vocals'):
            out_env*=np.clip((out_frames-np.arange(out_frames))/(.03*STEM_SR),0,1)
        in_env=rhythm[begin:begin+in_frames] if name in ('drums','bass') else np.ones(in_frames)
        audio[:,:out_frames]+=outgoing[:,:out_frames]*out_env
        audio[:,begin:begin+in_frames]+=incoming[:,:in_frames]*in_env
    edge=min(round(.03*STEM_SR),total//2)
    audio[:,:edge]*=np.linspace(0,1,edge)
    audio[:,-edge:]*=np.linspace(1,0,edge)
    peak=float(np.max(np.abs(audio)))
    if not np.isfinite(audio).all() or peak<1e-8:
        raise ValueError('This cue-point preview contains no usable audio')
    audio*=min(1.,.98/peak)
    events=[dict(at=0.,label='Outgoing track'),
            dict(at=plan['out_cue']-plan['first'],label='Selected outgoing closing cue'),
            dict(at=plan['entry']-plan['first'],label='Incoming opening · complete source prefix retained'),
            dict(at=cross_start,label='Rhythm handover begins'),
            dict(at=arrival,label='Incoming arrival meets outgoing closing change'),
            dict(at=plan['out_end']-plan['first'],label='Outgoing recording finishes naturally'),
            dict(at=duration,label='Preview complete')]
    duration=audio.shape[1]/STEM_SR
    for event in events:
        event['at']=min(duration,max(0.,event['at']))
    return audio,dict(duration=duration,events=sorted(events,key=lambda e:e['at']))


def render_cue_preview(req,folders,records,gains,fetch_source=None):
    import librosa
    from subbeats_cues import load_cues
    if req.get('bar_shift',0) or req.get('reference') is not None or req.get('window_plan') is not None:
        raise ValueError('Cue-point previews use saved cue choices. Reset the bar shift and find-match selection.')
    keys=req.get('cue_keys',[])
    indices=req.get('cue_indices',[0,0])
    if not isinstance(keys,list) or len(keys)!=2 or not isinstance(indices,list) or len(indices)!=2:
        raise ValueError('Choose two cue-prepared tracks')
    cues=[load_cues(req['state_dir'],req.get('stems_root'),req['track_ids'][i],keys[i],folders[i]) for i in range(2)]
    outgoing=choose_cue(cues[0],'outgoing',indices[0])
    incoming=choose_cue(cues[1],'incoming',indices[1])
    durations=[json.loads((folder/'analysis.json').read_text())['duration_seconds'] for folder in folders]
    plan=passage_plan(outgoing,incoming,*durations)
    out_parts,out_extended=cue_region(req,0,folders[0],records[0],'exit',plan['first'],plan['out_end'],fetch_source)
    in_parts,in_extended=cue_region(req,1,folders[1],records[1],'head',0.,plan['incoming_end'],fetch_source)
    if plan['rate']!=1.:
        in_parts={name:librosa.effects.time_stretch(part,rate=plan['rate']) for name,part in in_parts.items()}
    out_parts={name:part*10**(gains[0]/20) for name,part in out_parts.items()}
    in_parts={name:part*10**(gains[1]/20) for name,part in in_parts.items()}
    audio,timeline=mix_passages(out_parts,in_parts,plan)
    return audio,dict(timeline=timeline,experimental=True,phrase_verified=False,
        method='cue-points',incoming_rate=plan['rate'],bpm=outgoing['bpm'],used_models=out_extended or in_extended,
        extended_regions=dict(outgoing=out_extended,incoming=in_extended),
        selected_windows=dict(outgoing_seconds=outgoing['sourceSeconds'],outgoing_handover_seconds=plan['handover'],
            incoming_seconds=incoming['sourceSeconds'],outgoing_end_seconds=plan['out_end'],incoming_start_seconds=0.,
            outgoing_preview_start_seconds=plan['first']))
