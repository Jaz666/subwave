"""Cue-point audition: source opening retained, rhythm handover and voice tails separate.

No looping or automated pair approval. The current 16-bar renderer stays separate.
"""
import math

from subbeats_preview import STEM_SR, STEMS, load_region


def choose_cue(cues, role, index):
    if type(index) is not int or not 0<=index<len(cues.get(role,[])):
        raise ValueError('Choose an available saved cue point')
    cue = cues[role][index]
    if not all(isinstance(cue.get(k),(int,float)) and math.isfinite(cue[k]) for k in ('sourceSeconds','bpm')) or not 60<=cue['bpm']<=190:
        raise ValueError('Invalid saved cue point. Recheck this track.')
    return cue


def tail_endpoint(cue, period, passages, coverage):
    end = cue+8*period
    for _ in range(len(passages)+1):
        extended = max([end]+[p['endSeconds']+.5 for p in passages if p['startSeconds']<end and p['endSeconds']>cue])
        if extended==end:
            break
        end=extended
    if end>coverage or end<=cue:
        raise ValueError('The outgoing vocal tail needs more saved coverage. Choose another cue or the current preview method.')
    return end


def mix_cues(out_parts,in_parts,out_cue,in_arrival,period,passages):
    import numpy as np
    lead=4.
    out_length=out_parts['drums'].shape[1]/STEM_SR
    in_length=in_parts['drums'].shape[1]/STEM_SR
    end=tail_endpoint(out_cue,period,passages,out_length)
    overlap=in_arrival
    first=out_cue-overlap-lead
    duration=lead+overlap+end-out_cue
    if first<0 or in_arrival<4*period or duration>120 or in_length<duration-lead:
        raise ValueError('These cue points need more saved intro/outro coverage. Choose another cue pair or the current preview method.')
    total=round(duration*STEM_SR)
    begin=round(lead*STEM_SR)
    first_sample=round(first*STEM_SR)
    t=np.arange(total)/STEM_SR
    arrival=lead+overlap
    rhythm=np.clip((t-arrival+4*period)/(4*period),0,1)
    audio=np.zeros((2,total),dtype=np.float32)
    for name in STEMS:
        outgoing=out_parts[name][:,first_sample:first_sample+total]
        incoming=in_parts[name][:,:total-begin]
        if outgoing.shape[1]!=total or incoming.shape[1]!=total-begin:
            raise ValueError('Saved stem samples do not cover this cue-point preview')
        if name in ('drums','bass'):
            out_env=1-rhythm
            in_env=rhythm[begin:]
        else:
            # Include both other stems: sampled background vocals need not be in vocals.
            # Do not infer a vocal-free intro or suppress the outgoing lead voice.
            out_env=np.clip((duration-t)/.5,0,1)
            in_env=np.ones(total-begin)
        audio+=outgoing*out_env
        audio[:,begin:]+=incoming*in_env
    edge=min(round(.03*STEM_SR),total//2)
    audio[:,:edge]*=np.linspace(0,1,edge)
    audio[:,-edge:]*=np.linspace(1,0,edge)
    peak=float(np.max(np.abs(audio)))
    if not np.isfinite(audio).all() or peak<1e-8:
        raise ValueError('This cue-point preview contains no usable audio')
    audio*=min(1.,.98/peak)
    return audio,dict(duration=audio.shape[1]/STEM_SR,events=[
        dict(at=0.,label='Outgoing track'),dict(at=lead,label='Incoming opening · vocals and background groove retained'),
        dict(at=max(lead,arrival-4*period),label='Rhythm handover begins'),
        dict(at=arrival,label='Selected cue points align · outgoing vocal tail continues'),
        dict(at=audio.shape[1]/STEM_SR,label='Outgoing tail fade complete')])


def render_cue_preview(req,folders,records,gains):
    import librosa
    from subbeats_cues import load_cues
    from subbeats_vocals import measure_vocals
    if req.get('bar_shift',0) or req.get('reference') is not None or req.get('window_plan') is not None:
        raise ValueError('Cue-point previews use saved cue choices. Reset the bar shift and find-match selection.')
    keys=req.get('cue_keys',[])
    indices=req.get('cue_indices',[0,0])
    if not isinstance(keys,list) or len(keys)!=2 or not isinstance(indices,list) or len(indices)!=2:
        raise ValueError('Choose two cue-prepared tracks')
    cues=[load_cues(req['state_dir'],req['stems_root'],req['track_ids'][i],keys[i],folders[i]) for i in range(2)]
    outgoing=choose_cue(cues[0],'outgoing',indices[0])
    incoming=choose_cue(cues[1],'incoming',indices[1])
    out_parts,_=load_region(folders[0],records[0],'exit')
    in_parts,_=load_region(folders[1],records[1],'head')
    out_region=next(r for r in records[0]['metadata']['stem_regions'] if r['name']=='exit')
    in_region=next(r for r in records[1]['metadata']['stem_regions'] if r['name']=='head')
    if in_region['start_sample']!=0:
        raise ValueError('Cue-point preview needs the complete saved incoming opening')
    out_cue=outgoing['sourceSeconds']-out_region['start_sample']/STEM_SR
    if not 0 <= out_cue < out_parts['drums'].shape[1]/STEM_SR:
        raise ValueError('This closing cue is outside the saved outgoing stems. Audition the original ending on its own; pair mixing needs extended ending coverage.')
    period=60/outgoing['bpm']
    rate=outgoing['bpm']/incoming['bpm']
    if abs(rate-1)>.08:
        raise ValueError('The cue tempos differ by more than 8%. Choose another pair.')
    if abs(rate-1)>.0001:
        in_parts={name:librosa.effects.time_stretch(part,rate=rate) for name,part in in_parts.items()}
    else:
        rate=1.
    activity=measure_vocals(out_parts,STEM_SR)
    out_parts={name:part*10**(gains[0]/20) for name,part in out_parts.items()}
    in_parts={name:part*10**(gains[1]/20) for name,part in in_parts.items()}
    audio,timeline=mix_cues(out_parts,in_parts,out_cue,incoming['sourceSeconds']/rate,period,activity['passages'])
    return audio,dict(timeline=timeline,experimental=True,phrase_verified=False,
                      method='cue-points',incoming_rate=rate,bpm=outgoing['bpm'],
                      selected_windows=dict(outgoing_seconds=outgoing['sourceSeconds'],incoming_seconds=incoming['sourceSeconds']))
