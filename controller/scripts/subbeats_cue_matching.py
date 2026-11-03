"""Pair-specific cue suggestions from saved evidence; no audio/model/cache work.

The renderer uses the same vocal timeline assessment with freshly measured stems.
Energy estimates cannot identify words or vocals separated into `other`.
"""
from subbeats_cue_preview import passage_plan


def assess_vocal_pair(outgoing, incoming, plan):
    def result(status, reason):
        return dict(status=status, reason=reason)
    if not outgoing or not incoming:
        return result('unassessed', 'Saved vocal measurements are missing. Audition checks the prepared audio.')
    # Compare source-coordinate observations on the outgoing recording's clock.
    start, end = max(plan['first'], plan['entry']), min(plan['out_end'], plan['end'])
    outs = [(max(start,p['startSeconds']), min(end,p['endSeconds']))
            for p in outgoing['passages']]
    ins = [(max(start,plan['entry']+p['startSeconds']/plan['rate']),
            min(end,plan['entry']+p['endSeconds']/plan['rate']))
           for p in incoming['passages']]
    if any(max(a,c) < min(b,d) for a,b in outs for c,d in ins):
        return result('conflict', 'Detected vocal passages overlap. Choose another incoming cue or outgoing finish.')
    tolerance = max(outgoing['resolutionSeconds'],incoming['resolutionSeconds']/plan['rate'])
    if (outgoing['coverageStartSeconds'] > start+tolerance
            or outgoing['coverageEndSeconds'] < end-tolerance
            or incoming['coverageStartSeconds'] > (start-plan['entry'])*plan['rate']+tolerance
            or incoming['coverageEndSeconds'] < (end-plan['entry'])*plan['rate']-tolerance):
        return result('coverage', 'Saved vocal coverage is incomplete. Audition checks the full overlap, preparing stems if needed.')
    if not outgoing['passages'] or not incoming['passages']:
        return result('uncertain', 'No clear vocal passage was detected on one side. This does not prove a vocal-free overlap.')
    return result('estimated', 'No detected vocal passages overlap. Background vocals and musical fit still need listening.')


def find_cue_matches(jobs, outgoing_id, out_index=0):
    outgoing = next((j for j in jobs if j['id']==outgoing_id and j['status']=='prepared'),None)
    points = (outgoing or {}).get('cuePoints') or {}
    outs = points.get('outgoing',[])
    duration = points.get('durationSeconds')
    if (type(out_index) is not int or not 0<=out_index<len(outs) or not duration
            or not duration*.5<=outs[out_index]['sourceSeconds']<duration):
        raise ValueError('Choose a saved outgoing cue in the second half. Recheck cue preparation if needed.')
    out = outs[out_index]
    matches = []
    excluded = dict(tempo=0,coverage=0,unassessed=0,vocals=0)
    for job in jobs:
        if job['id']==outgoing_id or job['status']!='prepared':
            continue
        incoming = job.get('cuePoints') or {}
        if not incoming.get('incoming') or not incoming.get('durationSeconds'):
            excluded['unassessed'] += 1
            continue
        choices = []
        reason = 'tempo'
        for index, cue in enumerate(incoming['incoming']):
            if abs(out['bpm']/cue['bpm']-1)>.08:
                continue
            try:
                plan = passage_plan(out,cue,duration,incoming['durationSeconds'])
            except ValueError:
                if reason != 'vocals':
                    reason = 'coverage'
                continue
            vocal = assess_vocal_pair(
                ((outgoing.get('suitability') or {}).get('outgoing') or {}).get('vocalActivity'),
                ((job.get('suitability') or {}).get('incoming') or {}).get('vocalActivity'),plan)
            if vocal['status']=='conflict':
                reason = 'vocals'
                continue
            closing = plan['handover']-out['sourceSeconds']
            difference = abs(cue['sourceSeconds']/plan['rate']-closing)
            rank = (dict(estimated=0,uncertain=1,coverage=2,unassessed=3)[vocal['status']],
                    abs(plan['rate']-1),difference,index)
            choices.append((rank,dict(id=job['id'],title=job['title'],artist=job['artist'],
                outgoingCueIndex=out_index,incomingCueIndex=index,incomingSeconds=cue['sourceSeconds'],
                phraseBars=cue.get('phraseBars'),bpm=cue['bpm'],
                tempoAdjustmentPercent=(plan['rate']-1)*100,
                openingDifferenceSeconds=difference,vocal=vocal)))
        if choices:
            matches.append(min(choices,key=lambda choice:choice[0]))
        else:
            excluded[reason] += 1
    matches.sort(key=lambda choice:(choice[0][:3],choice[1]['artist'].lower(),choice[1]['title'].lower(),choice[1]['id']))
    return dict(method='cue-points',outgoingId=outgoing_id,outgoingCueIndex=out_index,
                matches=[choice[1] for choice in matches],excluded=excluded)
