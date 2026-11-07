"""Provisional complete-passage handovers; beat phase is not a verified bar grid.
Suggestions are never audio instructions or approval of a pair.
"""
import math


def suggest_handover(outgoing, incoming, out_window, in_window, plan, bar_shift=0):
    def result(status, reason, **details):
        return dict(status=status,reason=reason,approved=False,barAlignment='unverified',**details)
    if not outgoing or not incoming:
        return result('unassessed','Vocal measurements are missing; assess saved stems.')
    period,rate = plan['period'],plan['rate']
    bar = 4*period
    shift = bar_shift*bar
    lead = max(4.,plan['inCue']/rate-shift+2.,-shift)
    out_origin,in_origin = out_window['cueSeconds'],in_window['cueSeconds']
    in_start = in_origin-in_window['leadSeconds']
    if (outgoing['coverageStartSeconds'] > out_origin-lead+1e-6
            or outgoing['coverageEndSeconds'] < out_origin+64*period-1e-6
            or incoming['coverageStartSeconds'] > in_start+1e-6
            or incoming['coverageEndSeconds'] < in_origin+rate*(64*period+8-shift)-1e-6):
        return result('coverage','Vocal measurement coverage does not cover this preview window.')
    incoming_passages = [p for p in incoming['passages'] if p['endSeconds'] > in_start]
    if not incoming_passages:
        return result('uncertain','No clear incoming passage was detected; this does not establish a vocal-free opening.')
    first = min(incoming_passages,key=lambda passage:passage['startSeconds'])
    if first['openStart'] or first['openEnd'] or first['startSeconds'] < in_start:
        return result('coverage','The first incoming passage has an unresolved beginning or ending; preserve it rather than skipping to a later line.')
    entry = (first['activityStartSeconds']-in_origin)/rate+shift
    entry_guard = (first['startSeconds']-in_origin)/rate+shift
    if entry < -lead or entry > 64*period:
        return result('uncertain','The first incoming vocal entry is outside the measured overlap.')
    in_boundary = round(entry/bar)*bar
    tolerance = min(.15,period*.25)
    if abs(entry-in_boundary) > tolerance:
        return result('conflict','The complete incoming passage does not begin near the provisional bar boundary; its pickup must not be trimmed.')
    passages = [p for p in outgoing['passages'] if p['endSeconds'] > out_origin-lead and p['startSeconds'] < out_origin+64*period]
    if not passages:
        return result('uncertain','No clear outgoing passage was detected; this does not establish a vocal-free outro.')
    unresolved = False
    candidates = []
    for passage in passages:
        if passage['openEnd']:
            unresolved = True
            continue
        end = passage['endSeconds']-out_origin
        boundary = math.ceil((end-1e-6)/bar)*bar
        if boundary < -lead or boundary > 64*period or end > entry_guard:
            continue
        # A boundary inside another vocal passage would cut that passage off.
        if any(other['startSeconds']-out_origin < boundary-1e-6
               and other['endSeconds']-out_origin > boundary+1e-6 for other in passages):
            continue
        if any(other['startSeconds'] > passage['startSeconds']
               and other['startSeconds']-out_origin < boundary-1e-6 for other in passages):
            continue  # The last passage before the boundary must also be preserved.
        gap = round((in_boundary-boundary)/bar)
        if gap < 0 or (gap != 0 and gap % 4):
            continue
        candidates.append((gap,passage,boundary))
    if not candidates:
        return result('coverage' if unresolved else 'conflict',
                      'The outgoing passage runs beyond measured coverage.' if unresolved else
                      'No complete-passage handover satisfies a direct swap or a gap of 4, 8, 12… bars on the provisional grid.')
    gap,passage,boundary = min(candidates,key=lambda candidate:candidate[0])
    return result('suggested','Complete observed passages fit the spacing rule, but musical bar alignment and phrase boundaries remain unverified. This suggestion is not applied to preview audio.',
                  mode='direct' if gap == 0 else 'gap',gapBars=gap,plan=plan,
                  outgoingCueSeconds=out_origin,incomingCueSeconds=in_origin,
                  outgoingEndSeconds=passage['endSeconds'],incomingStartSeconds=first['startSeconds'],
                  outgoingBoundarySeconds=out_origin+boundary,
                  incomingBoundarySeconds=in_origin+(in_boundary-shift)*rate)
