"""Saved-evidence match search, shared by Preview and future track selection.
No source/cache reads, separation, stretching or rendering.
"""
from subbeats_preview import select_windows
from subbeats_vocal_plan import suggest_handover


def role_windows(job, role):
    value = (job.get('suitability') or {}).get(role) or {}
    if value.get('level') != 'subbeat':
        return []
    if 'windows' in value:
        return value['windows']
    # Older assessments have one verified window; heads start at source zero.
    if not value.get('bpm') or value.get('cueSeconds') is None or (role == 'outgoing' and value.get('leadSeconds') is None):
        return []
    return [{'cueSeconds':value['cueSeconds'], 'bpm':value['bpm'],
             'leadSeconds':value['leadSeconds'] if role == 'outgoing' else value['cueSeconds'],
             'postSeconds':value.get('postSeconds') or 0.}]


def find_matches(jobs, outgoing_id, bar_shift=0):
    outgoing = next((job for job in jobs if job['id'] == outgoing_id and job['status'] == 'prepared'), None)
    outs = role_windows(outgoing or {}, 'outgoing')
    if not outs:
        raise ValueError('Choose an outgoing track assessed as Sub/Beat. Assess its saved stems if needed.')
    matches = []
    excluded = dict(tempo=0,coverage=0,unassessed=0,unsuitable=0)
    for job in jobs:
        if job['id'] == outgoing_id or job['status'] != 'prepared':
            continue
        ins = role_windows(job,'incoming')
        if not ins:
            excluded['unassessed' if not job.get('suitability') else 'unsuitable'] += 1
            continue
        plan = None
        plan_bpm = None
        vocal = None
        vocal_key = None
        reason = 'tempo'
        # The same incoming-first ordering and geometry as the renderer.
        for inc in ins:
            for out in outs:
                try:
                    cue_out,cue_in,period,rate = select_windows(
                        [(out['leadSeconds'],60/out['bpm'])], [(inc['leadSeconds'],60/inc['bpm'])],
                        out['leadSeconds']+64*60/out['bpm']+out['postSeconds'],
                        inc['leadSeconds']+64*60/inc['bpm']+inc['postSeconds'],bar_shift)
                    candidate = dict(outCue=cue_out,inCue=cue_in,period=period,rate=rate)
                    if plan is None:
                        plan = candidate  # Preserve the current renderer's structural choice.
                        plan_bpm = inc['bpm']
                    suggestion = suggest_handover(
                        (outgoing.get('suitability') or {}).get('outgoing',{}).get('vocalActivity'),
                        (job.get('suitability') or {}).get('incoming',{}).get('vocalActivity'),
                        out,inc,candidate,bar_shift)
                    rank = {'suggested':0,'conflict':1,'coverage':2,'uncertain':3,'unassessed':4}[suggestion['status']]
                    key = (rank,suggestion.get('gapBars',0),abs(rate-1))
                    if vocal_key is None or key < vocal_key:
                        vocal,vocal_key = suggestion,key
                except ValueError as error:
                    if 'compatible tempos' not in str(error):
                        reason = 'coverage'
        if not plan:
            excluded[reason] += 1
            continue
        matches.append(dict(id=job['id'],title=job['title'],artist=job['artist'],bpm=plan_bpm,
                            tempoAdjustmentPercent=(plan['rate']-1)*100,plan=plan,vocalSuggestion=vocal))
    matches.sort(key=lambda match:(0 if match['vocalSuggestion']['status'] == 'suggested' else 1,abs(match['tempoAdjustmentPercent']),match['artist'].lower(),match['title'].lower(),match['id']))
    return dict(outgoingId=outgoing_id,barShift=bar_shift,matches=matches,excluded=excluded)
