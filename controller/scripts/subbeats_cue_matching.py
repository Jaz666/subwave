"""Pair-specific cue suggestions from saved evidence; no audio/model/cache work.

Loop suggestions use the fitted incoming grid and measured vocal passages. The
preview renderer checks the actual drum stem and remains the final audition.
"""
import math

from subbeats_cue_preview import passage_plan


def assess_vocal_pair(outgoing, incoming, plan):
    def result(status, reason):
        return dict(status=status, reason=reason)
    if not outgoing or not incoming:
        return result('unassessed', 'Saved vocal measurements are missing. Audition checks the prepared audio.')
    # Compare source-coordinate observations on the outgoing recording's clock.
    start, end = max(plan['first'], plan['entry']), min(plan['out_end'], plan['end'])
    if any(max(start,plan['entry']+p['startSeconds']/plan['rate']) <
           min(end,outgoing['coverageStartSeconds'],plan['entry']+p['endSeconds']/plan['rate'])
           for p in incoming['passages']):
        return result('conflict', 'An incoming vocal would overlap the unmeasured outgoing lead-in. Choose a shorter opening or another pair.')
    outs = [(max(start,p['startSeconds']), min(end,p['endSeconds']))
            for p in outgoing['passages']]
    ins = [(max(start,plan['entry']+p['startSeconds']/plan['rate']),
            min(end,plan['entry']+p['endSeconds']/plan['rate']))
           for p in incoming['passages']]
    if any(max(a,c) < min(b,d) for a,b in outs for c,d in ins):
        return result('conflict', 'Detected vocal passages overlap. Choose another incoming cue or outgoing finish.')
    tolerance = max(outgoing['resolutionSeconds'],incoming['resolutionSeconds']/plan['rate'])
    if (outgoing['coverageStartSeconds'] > start+tolerance
            and outgoing['coverageEndSeconds'] >= end-tolerance
            and incoming['coverageStartSeconds'] <= (start-plan['entry'])*plan['rate']+tolerance
            and incoming['coverageEndSeconds'] >= (end-plan['entry'])*plan['rate']-tolerance):
        return result('uncertain', 'The earlier outgoing lead-in uses the original mix. No incoming vocal was detected there; preview checks the overlap conservatively.')
    if (outgoing['coverageStartSeconds'] > start+tolerance
            or outgoing['coverageEndSeconds'] < end-tolerance
            or incoming['coverageStartSeconds'] > (start-plan['entry'])*plan['rate']+tolerance
            or incoming['coverageEndSeconds'] < (end-plan['entry'])*plan['rate']-tolerance):
        return result('coverage', 'Saved vocal coverage is incomplete. Audition checks the full overlap against prepared audio and the original lead-in.')
    if not outgoing['passages'] or not incoming['passages']:
        return result('uncertain', 'No clear vocal passage was detected on one side. This does not prove a vocal-free overlap.')
    return result('estimated', 'No detected vocal passages overlap. Background vocals and musical fit still need listening.')


def plan_incoming_drum_loop(outgoing, incoming, cue, plan, max_repeats=2):
    """Suggest up to two vocal-free, fitted-grid, two-bar incoming drum loops."""
    if assess_vocal_pair(outgoing, incoming, plan)['status'] != 'conflict':
        return None
    if cue.get('timingSource') not in ('fitted-grid','opening-grid','onset-grid') or cue.get('phraseBars') not in (8, 16):
        return None
    try:
        start, bpm = cue['sourceSeconds'], cue['bpm']
        if not math.isfinite(start) or not math.isfinite(bpm) or start < 0 or bpm <= 0:
            return None
        loop_seconds = 8 * 60 / bpm
    except (KeyError, TypeError, ZeroDivisionError):
        return None

    timeline_start = max(plan['first'], plan['entry'])
    timeline_end = min(plan['out_end'], plan['end'])
    source_end = (timeline_end - plan['entry']) * plan['rate']
    tolerance = max(outgoing.get('resolutionSeconds', 0), incoming.get('resolutionSeconds', 0) / plan['rate'])
    if (outgoing.get('coverageEndSeconds', 0) < timeline_end - tolerance
            or incoming.get('coverageStartSeconds', float('inf')) > tolerance
            or incoming.get('coverageEndSeconds', 0) < source_end - tolerance
            or incoming.get('coverageStartSeconds', float('inf')) > start + tolerance
            or incoming.get('coverageEndSeconds', 0) < start + loop_seconds + tolerance):
        return None

    loop_end = start + loop_seconds
    # Measurements include vocal release padding, so any intersection makes
    # this phrase unsafe to repeat.
    if any(p['startSeconds'] < loop_end and p['endSeconds'] > start
           for p in incoming.get('passages', [])):
        return None

    conflicts = []
    for out_passage in outgoing.get('passages', []):
        out_start = max(timeline_start, out_passage['startSeconds'])
        out_end = min(timeline_end, out_passage['endSeconds'])
        if out_start >= out_end:
            continue
        for in_passage in incoming.get('passages', []):
            in_start = plan['entry'] + in_passage['startSeconds'] / plan['rate']
            in_end = plan['entry'] + in_passage['endSeconds'] / plan['rate']
            if max(out_start, in_start) < min(out_end, in_end):
                # A loop at this cue cannot move a vocal passage that starts
                # before the repeated section has finished.
                if in_passage['startSeconds'] < loop_end:
                    return None
                conflicts.append((out_start, out_end, in_passage))
    if not conflicts:
        return None

    for repeats in range(1, max_repeats + 1):
        source_shift = repeats * loop_seconds
        shifted = dict(incoming)
        shifted['coverageEndSeconds'] = incoming['coverageEndSeconds'] + source_shift
        shifted['passages'] = []
        for passage in incoming.get('passages', []):
            if passage['startSeconds'] >= loop_end:
                shifted['passages'].append({
                    **passage,
                    'startSeconds': passage['startSeconds'] + source_shift,
                    'endSeconds': passage['endSeconds'] + source_shift,
                    'activityStartSeconds': passage.get('activityStartSeconds', passage['startSeconds']) + source_shift,
                    'activityEndSeconds': passage.get('activityEndSeconds', passage['endSeconds']) + source_shift,
                })
            else:
                shifted['passages'].append(passage)
        fit = assess_vocal_pair(outgoing, shifted, plan)
        if fit['status'] in ('conflict', 'coverage'):
            continue

        safe = True
        for out_start, out_end, passage in conflicts:
            in_start = plan['entry'] + (passage['startSeconds'] + source_shift) / plan['rate']
            in_end = plan['entry'] + (passage['endSeconds'] + source_shift) / plan['rate']
            if max(out_start, in_start) < min(out_end, in_end):
                safe = False
                break
            gap = in_start - out_end if in_start >= out_end else out_start - in_end
            if gap < plan['period']:
                safe = False
                break
        if safe:
            loop = dict(method='drum-loop', startSeconds=start, bars=2, repeats=repeats,
                        loopSeconds=loop_seconds, addedSeconds=source_shift / plan['rate'])
            return loop, shifted, fit
    return None


def plan_pair_transitions(out_cues, in_cues, out_duration, in_duration, outgoing_vocals=None, incoming_vocals=None):
    """Rank feasible cue combinations for one selected pair."""
    choices=[]
    vocal_rank=dict(estimated=0,uncertain=1,coverage=2,unassessed=3)
    for out_index,out in enumerate(out_cues):
        if out.get('sourceSeconds',0)<out_duration*.5:
            continue
        for in_index,cue in enumerate(in_cues):
            try:
                plan=passage_plan(out,cue,out_duration,in_duration)
            except (KeyError,TypeError,ValueError):
                continue
            vocal=assess_vocal_pair(outgoing_vocals,incoming_vocals,plan)
            transition=dict(method='standard')
            if vocal['status']=='conflict':
                loop_plan=plan_incoming_drum_loop(outgoing_vocals,incoming_vocals,cue,plan)
                if loop_plan is None:
                    continue
                loop,_,fit=loop_plan
                vocal=fit
                transition=loop
            out_bars=out.get('phraseBars') if out.get('phraseBars') in (8,16) else None
            in_bars=cue.get('phraseBars') if cue.get('phraseBars') in (8,16) else None
            difference=abs((plan['handover']-out['sourceSeconds'])-cue['sourceSeconds']/plan['rate'])
            rank=(vocal_rank[vocal['status']],difference,abs(plan['rate']-1),
                  -(out_bars or 0)-(in_bars or 0),transition.get('repeats',0),out_index,in_index)
            choices.append((rank,dict(outgoingCueIndex=out_index,incomingCueIndex=in_index,
                outgoingBars=out_bars,incomingBars=in_bars,
                outgoingTimeToEndSeconds=out['sourceSeconds']-out_duration,
                incomingSeconds=cue['sourceSeconds'],transition=transition,vocal=vocal)))
    return [choice for _,choice in sorted(choices,key=lambda item:item[0])]


def find_cue_matches(jobs, outgoing_id, out_index=0):
    outgoing_job = next((j for j in jobs if j['id']==outgoing_id and j['status']=='prepared'),None)
    points = (outgoing_job or {}).get('cuePoints') or {}
    if points.get('algorithmVersion') not in (5,6):
        raise ValueError('Rescan the outgoing track with Beat This! for the new phrase preview.')
    outs = points.get('outgoing',[])
    duration = points.get('durationSeconds')
    if (type(out_index) is not int or not 0<=out_index<len(outs) or not duration
            or not duration*.5<=outs[out_index]['sourceSeconds']<duration):
        raise ValueError('Choose a saved outgoing cue in the second half. Recheck cue preparation if needed.')
    out = outs[out_index]
    outgoing_vocals = ((outgoing_job.get('cueCoverage') or {}).get('outgoing')
                       or ((outgoing_job.get('suitability') or {}).get('outgoing') or {}).get('vocalActivity'))
    matches = []
    excluded = dict(tempo=0,coverage=0,unassessed=0,vocals=0)
    for job in jobs:
        if job['id']==outgoing_id or job['status']!='prepared':
            continue
        incoming_points = job.get('cuePoints') or {}
        if incoming_points.get('algorithmVersion') not in (5,6) or not incoming_points.get('incoming') or not incoming_points.get('durationSeconds'):
            excluded['unassessed'] += 1
            continue
        choices = []
        reason = 'tempo'
        incoming_vocals = ((job.get('cueCoverage') or {}).get('incoming')
                           or ((job.get('suitability') or {}).get('incoming') or {}).get('vocalActivity'))
        for index, cue in enumerate(incoming_points['incoming']):
            if abs(out['bpm']/cue['bpm']-1)>.08:
                continue
            try:
                plan = passage_plan(out,cue,duration,incoming_points['durationSeconds'])
            except ValueError:
                if reason != 'vocals':
                    reason = 'coverage'
                continue
            vocal = assess_vocal_pair(outgoing_vocals, incoming_vocals, plan)
            transition = dict(method='standard')
            if vocal['status']=='conflict':
                loop_plan = plan_incoming_drum_loop(outgoing_vocals, incoming_vocals, cue, plan)
                if loop_plan is None:
                    reason = 'vocals'
                    continue
                loop, _, fit = loop_plan
                lead_in_note = (' The original-mix lead-in remains uncertain; the preview checks it before playback.'
                                if fit['status'] == 'uncertain' else '')
                vocal = dict(status=fit['status'], reason=(
                    f"A {loop['repeats']}× two-bar incoming drum loop is estimated to clear the detected vocal overlap. "
                    f"{lead_in_note} Audition the groove, loop seam and background-vocal leakage."
                ))
                transition = dict(method=loop['method'],loopStartSeconds=loop['startSeconds'],
                                  loopBars=loop['bars'],repeatCount=loop['repeats'],
                                  addedSeconds=loop['addedSeconds'])
            closing = plan['handover']-out['sourceSeconds']
            difference = abs(cue['sourceSeconds']/plan['rate']-closing)
            vocal_rank = dict(estimated=0,uncertain=1,coverage=2,unassessed=3)[vocal['status']]
            if transition['method']=='drum-loop' and vocal['status']=='uncertain':
                # This uncertainty is only the short original-mix lead-in; the
                # loop clears every measured vocal passage and the preview rechecks it.
                vocal_rank = 0
            rank = (vocal_rank,
                    abs(plan['rate']-1),difference,index)
            choices.append((rank,dict(id=job['id'],title=job['title'],artist=job['artist'],
                outgoingCueIndex=out_index,incomingCueIndex=index,incomingSeconds=cue['sourceSeconds'],
                phraseBars=cue.get('phraseBars'),bpm=cue['bpm'],
                tempoAdjustmentPercent=(plan['rate']-1)*100,
                openingDifferenceSeconds=difference,vocal=vocal,transition=transition)))
        if choices:
            matches.append(min(choices,key=lambda choice:choice[0]))
        else:
            excluded[reason] += 1
    matches.sort(key=lambda choice:(choice[0][:3],choice[1]['artist'].lower(),choice[1]['title'].lower(),choice[1]['id']))
    return dict(method='cue-points',outgoingId=outgoing_id,outgoingCueIndex=out_index,
                matches=[choice[1] for choice in matches],excluded=excluded)
