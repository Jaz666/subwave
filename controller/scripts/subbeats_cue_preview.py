"""Closing/opening auditions from saved passage stems and original lead-in.

Keep source zero, the final outgoing beat and the complete recording end.
Original lead-in vocal content is treated conservatively before pair rendering.
"""
import json
import math
from pathlib import Path
import tempfile

from subbeats_cues import TAIL_SECONDS
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
    if outgoing.get('timingSource')=='fitted-grid' and out_duration-handover>TAIL_SECONDS:
        raise ValueError('This ending exceeds the prepared natural-tail limit. Rescan the track.')
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
        # Keep the final outgoing beat and its decay, including rhythm stems.
        # A phrase marker is not a hard audio cutoff.
        out_env=np.ones(out_frames)
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
    if plan.get('incoming_loop'):
        loop=plan['incoming_loop']
        events.append(dict(at=plan['entry']-plan['first']+loop['startSeconds']/plan['rate'],
                           label=f"Incoming drums loop · 2 bars × {loop['repeats']}"))
    duration=audio.shape[1]/STEM_SR
    for event in events:
        event['at']=min(duration,max(0.,event['at']))
    return audio,dict(duration=duration,events=sorted(events,key=lambda e:e['at']))


def insert_incoming_drum_loop(parts, loop):
    """Repeat only a measured, vocal-free incoming drum passage."""
    import numpy as np
    start=round(loop['startSeconds']*STEM_SR)
    length=round(loop['loopSeconds']*STEM_SR)
    stop=start+length
    repeats=loop['repeats']
    if start<0 or length<=0 or repeats not in (1,2) or any(audio.shape[1]<stop for audio in parts.values()):
        raise ValueError('The incoming drum loop is outside saved stem coverage. Choose another transition.')
    drums=parts['drums'][:,start:stop]
    if not np.isfinite(drums).all() or float(np.sqrt(np.mean(drums**2)))<1e-5:
        raise ValueError('The selected two-bar passage has no usable incoming drums. Choose another transition.')
    inserted=np.tile(drums,(1,repeats))
    silence=np.zeros((2,length*repeats),dtype=np.float32)
    return {name:np.concatenate((audio[:,:stop],inserted if name=='drums' else silence,audio[:,stop:]),axis=1)
            for name,audio in parts.items()}


def render_regular_fallback(req,folders,records,gains,fetch_source):
    """Audition the configured ordinary Subwave crossfade when no cue plan fits."""
    import numpy as np
    from subbeats_reference_preview import source_audio
    urls=req.get('source_urls')
    if fetch_source is None or not isinstance(urls,list) or len(urls)!=2:
        raise ValueError('No Sub/Beat transition fits, and the original tracks are unavailable for a regular preview.')
    sources=[source_audio(urls[i],folders[i],records[i],fetch_source,require_hash=True) for i in range(2)]
    out_duration,in_duration=(source.shape[1]/STEM_SR for source in sources)
    fade=float(req.get('crossfade_seconds',10.))
    if not math.isfinite(fade) or not 0<=fade<=30:
        raise ValueError('Invalid regular crossfade duration.')
    fade=min(fade,out_duration,in_duration)
    lead=min(4.,out_duration-fade)
    follow=min(4.,in_duration-fade)
    total=round((lead+fade+follow)*STEM_SR)
    start=round((out_duration-lead-fade)*STEM_SR)
    overlap=round(fade*STEM_SR)
    before=round(lead*STEM_SR)
    audio=np.zeros((2,total),dtype=np.float32)
    outgoing=sources[0][:,start:start+before+overlap]*10**(gains[0]/20)
    incoming=sources[1][:,:overlap+round(follow*STEM_SR)]*10**(gains[1]/20)
    if overlap:
        progress=np.linspace(0,1,overlap,endpoint=True)
        if req.get('equal_power_crossfade') is True:
            out_gain=np.cos(progress*np.pi/2)
            in_gain=np.sin(progress*np.pi/2)**1.5
        else:
            out_gain=1-progress
            in_gain=progress
        outgoing[:,before:before+overlap]*=out_gain
        incoming[:,:overlap]*=in_gain
    audio[:,:outgoing.shape[1]]+=outgoing
    if overlap:
        audio[:,before:before+overlap]+=incoming[:,:overlap]
    after_start=before+overlap
    if incoming.shape[1]>overlap:
        audio[:,after_start:after_start+incoming.shape[1]-overlap]+=incoming[:,overlap:]
    edge=min(round(.03*STEM_SR),total//2)
    if edge:
        audio[:,:edge]*=np.linspace(0,1,edge)
        audio[:,-edge:]*=np.linspace(1,0,edge)
    peak=float(np.max(np.abs(audio)))
    if not np.isfinite(audio).all() or peak<1e-8:
        raise ValueError('The regular transition preview contains no usable audio.')
    audio*=min(1.,.98/peak)
    duration=audio.shape[1]/STEM_SR
    timeline=dict(kind='regular-fallback',duration=duration,events=[
        dict(at=0.,label='Outgoing original audio · regular Subwave transition'),
        dict(at=lead,label=f'Regular Subwave {fade:.1f}s crossfade begins'),
        dict(at=lead+fade,label='Outgoing recording ends; incoming continues'),
        dict(at=duration,label='Preview complete')])
    return audio,dict(timeline=timeline,method='regular-crossfade',experimental=False,
        transition=dict(method='regular-crossfade',durationSeconds=fade))


def render_automatic_transition(req,folders,records,gains,fetch_source):
    from subbeats_cues import load_cues
    from subbeats_cue_matching import plan_pair_transitions
    keys=req.get('cue_keys')
    candidates=[]
    if isinstance(keys,list) and len(keys)==2 and all(isinstance(key,str) for key in keys):
        try:
            cues=[load_cues(req['state_dir'],req.get('stems_root'),req['track_ids'][i],keys[i],folders[i]) for i in range(2)]
            if all(cue.get('algorithmVersion') in (5,6,7,8,9,10) for cue in cues):
                durations=[json.loads((folder/'analysis.json').read_text())['duration_seconds'] for folder in folders]
                coverage=req.get('_cue_coverage') or [None,None]
                outgoing_vocals=(coverage[0][1].get('metadata',{}).get('outgoing') if coverage[0] else None)
                incoming_vocals=(coverage[1][1].get('metadata',{}).get('incoming') if coverage[1] else None)
                candidates=plan_pair_transitions(cues[0].get('outgoing',[]),cues[1].get('incoming',[]),
                    *durations,outgoing_vocals,incoming_vocals)
        except (OSError,KeyError,TypeError,ValueError):
            candidates=[]
    for candidate in candidates[:12]:
        try:
            audio,result=render_cue_preview({**req,'auto_plan':False,
                'cue_indices':[candidate['outgoingCueIndex'],candidate['incomingCueIndex']]},
                folders,records,gains,fetch_source)
            out_bars,in_bars=candidate['outgoingBars'],candidate['incomingBars']
            label=(f'{out_bars} bars out → {in_bars} bars in' if out_bars and in_bars
                   else 'Cue-point Sub/Beat mix')
            label+= (f" · out cue {candidate['outgoingTimeToEndSeconds']:.2f}s to end"
                     f" · in arrival {candidate['incomingSeconds']:.2f}s from start")
            loop=result['transition']
            if loop.get('method')=='drum-loop':
                label+=f" · incoming drums looped for {loop['bars']} bars × {loop['repeats']}"
            result['timeline']['kind']='subbeats-transition'
            result['timeline']['events'][0]['label']='Outgoing track · '+label
            for event in result['timeline']['events']:
                if event['label']=='Selected outgoing closing cue':
                    event['label']=f"Selected outgoing cue · {candidate['outgoingTimeToEndSeconds']:.2f}s to track end"
                elif event['label'].startswith('Incoming opening ·'):
                    event['label']=f"Incoming arrival · {candidate['incomingSeconds']:.2f}s from source start"
            result['transition_summary']=label
            return audio,result
        except ValueError:
            continue
    return render_regular_fallback(req,folders,records,gains,fetch_source)


def render_cue_preview(req,folders,records,gains,fetch_source=None):
    import librosa
    from subbeats_cues import load_cues
    if req.get('auto_plan'):
        return render_automatic_transition(req,folders,records,gains,fetch_source)
    if req.get('bar_shift',0) or req.get('reference') is not None or req.get('window_plan') is not None:
        raise ValueError('Cue-point previews use saved cue choices. Reset the bar shift and find-match selection.')
    keys=req.get('cue_keys',[])
    indices=req.get('cue_indices',[0,0])
    if not isinstance(keys,list) or len(keys)!=2 or not isinstance(indices,list) or len(indices)!=2:
        raise ValueError('Choose two cue-prepared tracks')
    cues=[load_cues(req['state_dir'],req.get('stems_root'),req['track_ids'][i],keys[i],folders[i]) for i in range(2)]
    if any(c.get('algorithmVersion') not in (5,6,7,8,9,10) for c in cues):
        raise ValueError('Rescan both tracks with Beat This! for the new phrase preview.')
    outgoing=choose_cue(cues[0],'outgoing',indices[0])
    incoming=choose_cue(cues[1],'incoming',indices[1])
    durations=[json.loads((folder/'analysis.json').read_text())['duration_seconds'] for folder in folders]
    plan=passage_plan(outgoing,incoming,*durations)
    def parts(index,name,start,end):
        entry = (req.get('_cue_coverage') or [None,None])[index]
        if entry:
            import numpy as np
            region=next((r for r in entry[1]['metadata']['stem_regions'] if r['name']==name),None)
            if region is None:
                raise ValueError('The selected cue has no saved stem coverage. Rescan the track.')
            available=region['start_sample']/STEM_SR
            audio,_=load_region(entry[0],entry[1],name,limit_seconds=130,
                start_seconds=max(start,available),end_seconds=end,require_tempo=False)
            if start<available:
                if index!=0 or fetch_source is None:
                    raise ValueError('The original outgoing lead-in is unavailable. Choose another pair.')
                from urllib.parse import urlsplit
                from subbeats_reference_preview import source_audio
                urls=req.get('source_urls')
                if not isinstance(urls,list) or len(urls)!=2 or not isinstance(urls[0],str) or urlsplit(urls[0]).scheme not in ('http','https'):
                    raise ValueError('The original outgoing lead-in is unavailable. Choose another pair.')
                source=source_audio(urls[0],folders[0],records[0],fetch_source,require_hash=True)
                prefix=source[:,round(start*STEM_SR):round(available*STEM_SR)]
                # The original mix needs no separated stems before the closing
                # passage. Treat its unknown vocal content conservatively as
                # vocal energy, so an incoming vocal cannot slip through here.
                seam=min(round(.03*STEM_SR),audio['vocals'].shape[1])
                ramp=np.linspace(0,1,seam)
                for stem in audio:
                    audio[stem][:,:seam]*=ramp
                audio['vocals'][:,:seam]+=source[:,round(available*STEM_SR):round(available*STEM_SR)+seam]*(1-ramp)
                audio={stem:np.concatenate([prefix if stem=='vocals' else np.zeros_like(prefix),part],axis=1)
                       for stem,part in audio.items()}
            return audio,False
        if records[index].get('identity',{}).get('mode')=='cue-source':
            raise ValueError('Saved phrase coverage is missing. Rescan this track with Beat This!.')
        return cue_region(req,index,folders[index],records[index],name,start,end,fetch_source)
    out_parts,out_extended=parts(0,'exit',plan['first'],plan['out_end'])
    in_parts,in_extended=parts(1,'head',0.,plan['incoming_end'])
    from subbeats_vocals import measure_vocals
    from subbeats_cue_matching import assess_vocal_pair, plan_incoming_drum_loop
    actual_outgoing_vocals=measure_vocals(out_parts,STEM_SR,plan['first'])
    actual_incoming_vocals=measure_vocals(in_parts,STEM_SR)
    coverage=req.get('_cue_coverage') or [None,None]
    outgoing_vocals=(coverage[0][1].get('metadata',{}).get('outgoing') if coverage[0] else None) or actual_outgoing_vocals
    incoming_vocals=(coverage[1][1].get('metadata',{}).get('incoming') if coverage[1] else None) or actual_incoming_vocals
    vocal = assess_vocal_pair(outgoing_vocals,incoming_vocals,plan)
    transition=dict(method='standard')
    if vocal['status']=='conflict':
        loop_plan=plan_incoming_drum_loop(outgoing_vocals,incoming_vocals,incoming,plan)
        if loop_plan is None:
            raise ValueError(vocal['reason'])
        loop,_,_=loop_plan
        in_parts=insert_incoming_drum_loop(in_parts,loop)
        actual_incoming_vocals=measure_vocals(in_parts,STEM_SR)
        vocal=assess_vocal_pair(actual_outgoing_vocals,actual_incoming_vocals,plan)
        if vocal['status']=='conflict' or vocal['status']=='coverage':
            raise ValueError('The two-bar incoming drum loop did not clear the measured vocal overlap. Choose another transition.')
        transition=loop
        plan={**plan,'incoming_loop':loop}
    if plan['rate']!=1.:
        in_parts={name:librosa.effects.time_stretch(part,rate=plan['rate']) for name,part in in_parts.items()}
    out_parts={name:part*10**(gains[0]/20) for name,part in out_parts.items()}
    in_parts={name:part*10**(gains[1]/20) for name,part in in_parts.items()}
    audio,timeline=mix_passages(out_parts,in_parts,plan)
    return audio,dict(timeline=timeline,experimental=True,phrase_verified=False,
        method='cue-points',incoming_rate=plan['rate'],bpm=outgoing['bpm'],used_models=out_extended or in_extended,
        transition=transition,
        extended_regions=dict(outgoing=out_extended,incoming=in_extended),
        selected_windows=dict(outgoing_seconds=outgoing['sourceSeconds'],outgoing_handover_seconds=plan['handover'],
            incoming_seconds=incoming['sourceSeconds'],outgoing_end_seconds=plan['out_end'],incoming_start_seconds=0.,
            outgoing_preview_start_seconds=plan['first']))
