"""Passage confidence for auditions, not calibrated probabilities or word recognition.

Only an owner-reviewed boundary earns high confidence. Lyrics plus supporting
stem activity earn medium; energy/VAD alone, mismatched versions and truncated
coverage remain low/unknown. Missing evidence never proves silence.
"""
ALLOWANCE_SECONDS = 2.
CONFIDENCE_RANK = dict(unknown=0, low=1, medium=2, high=3)


def merged(spans):
    result = []
    for start, end in sorted((a, b) for a, b in spans if b > a):
        if result and start <= result[-1][1]:
            result[-1] = (result[-1][0], max(result[-1][1], end))
        else:
            result.append((start, end))
    return result


def boundary_assessment(activity, evidence, role, start, end, bar_seconds):
    evidence = evidence or {}
    head = role == 'head'
    anchor = evidence.get('firstSeconds' if head else 'lastStartSeconds')
    reviewed = evidence.get('reviewedHeadSeconds' if head else 'reviewedTailSeconds')
    result = dict(confidence='unknown', reason='No saved stem coverage.',
                  firstSeconds=None, lastSeconds=None, activeSeconds=0.,
                  boundaryVocal='unknown', lyricAnchorSeconds=anchor)
    if not activity:
        return result, []
    tolerance = activity.get('resolutionSeconds', .05)
    complete = (activity['coverageStartSeconds'] <= start+tolerance
                and activity['coverageEndSeconds'] >= end-tolerance
                and activity.get('unmeasuredUntilSeconds', start) <= start+tolerance)
    spans = []
    for passage in activity.get('passages', []):
        first, last = max(start, passage['startSeconds']), min(end, passage['endSeconds'])
        if reviewed is not None:
            if head:
                first = max(first, reviewed)
            else:
                last = min(last, reviewed)
        spans.append((first, last))
    spans = merged(spans)
    result.update(firstSeconds=spans[0][0] if spans else None,
                  lastSeconds=spans[-1][1] if spans else None,
                  activeSeconds=sum(b-a for a, b in spans), confidence='low',
                  reason='Stem activity estimates possible voice; words are unverified.')
    boundary_start, boundary_end = (start, min(end, start+bar_seconds)) if head else (max(start, end-bar_seconds), end)
    if spans and any(a < boundary_end and b > boundary_start for a, b in spans):
        result['boundaryVocal'] = 'likely'
    elif complete:
        result['boundaryVocal'] = 'unlikely'
    if not complete:
        result.update(reason='Stem coverage is incomplete or includes an unseparated original-mix lead-in.')
        return result, spans
    if reviewed is not None:
        result.update(confidence='high', reason='Boundary reviewed against this prepared recording; activity duration remains an estimate.')
        if head:
            result['firstSeconds'] = reviewed if start <= reviewed < end else result['firstSeconds']
            result['boundaryVocal'] = 'likely' if reviewed < boundary_end else 'unlikely'
        else:
            result['lastSeconds'] = reviewed if start < reviewed <= end else result['lastSeconds']
            result['boundaryVocal'] = 'likely' if reviewed > boundary_start else 'unlikely'
        if not spans and start <= reviewed <= end:
            result.update(confidence='low',reason='The boundary was reviewed, but the stem has no supporting duration measurement.')
        return result, spans
    if evidence.get('instrumental') is True and anchor is not None:
        result['reason'] = 'Timed lyrics disagree with the library instrumental flag.'
        return result, spans
    spread = evidence.get('firstSpreadSeconds' if head else 'tailSpreadSeconds', 0.)
    if spread > ALLOWANCE_SECONDS:
        result['reason'] = 'Plausible lyric versions disagree on this boundary by more than two seconds.'
        return result, spans
    if not spans and evidence.get('instrumental') is True:
        result.update(confidence='medium', reason='Library instrumental flag and quiet measured stem agree; silence is not proven.')
    elif anchor is not None and evidence.get('versionConfidence') == 'medium':
        if head:
            supported = (spans and abs(spans[0][0]-anchor) <= ALLOWANCE_SECONDS
                         or not spans and anchor >= end)
        else:
            # Extend the final line through the observed release. Never use its
            # start timestamp as a vocal end, or erase later unexplained activity.
            supported = bool(spans and spans[-1][0]-ALLOWANCE_SECONDS <= anchor <= spans[-1][1])
        if supported:
            result.update(confidence='medium', reason='Lyric timing and stem activity support this boundary; the words remain unverified.')
        else:
            result['reason'] = 'Lyric timing and measured stem activity disagree.'
    elif anchor is not None:
        result['reason'] = evidence.get('versionReason', 'The lyric version is uncertain.')
    return result, spans


def assess_pair(outgoing, incoming, plan, out_evidence=None, in_evidence=None):
    start, end = max(plan['first'], plan['entry']), min(plan['out_end'], plan['end'])
    head, ins = boundary_assessment(incoming, in_evidence, 'head', max(0., (start-plan['entry'])*plan['rate']),
                                    max(0., (end-plan['entry'])*plan['rate']), 4*plan['period']*plan['rate'])
    tail, outs = boundary_assessment(outgoing, out_evidence, 'tail', start, end, 4*plan['period'])
    ins = [(plan['entry']+a/plan['rate'], plan['entry']+b/plan['rate']) for a, b in ins]
    intersections = merged((max(a, c), min(b, d)) for a, b in outs for c, d in ins)
    total = sum(b-a for a, b in intersections)
    longest = max((b-a for a, b in intersections), default=0.)
    confidence = min((head['confidence'], tail['confidence']), key=CONFIDENCE_RANK.get)
    status = 'estimated' if confidence in ('medium', 'high') else 'uncertain'
    if not incoming or not outgoing:
        status = 'unassessed'
    elif any('incomplete' in part['reason'] for part in (head, tail)):
        status = 'coverage'
    elif total > ALLOWANCE_SECONDS:
        status = 'conflict' if confidence == 'high' else 'uncertain'
    reason = f'Estimated {total:.2f}s vocal overlap (longest {longest:.2f}s); {confidence} confidence. '
    reason += ('Longer reviewed vocal overlap; prefer another transition.' if status == 'conflict'
               else 'Short overlaps are allowed; uncertain passages remain available to audition.')
    return dict(status=status, reason=reason, confidence=confidence, overlapSeconds=total,
                longestOverlapSeconds=longest, allowanceSeconds=ALLOWANCE_SECONDS, head=head, tail=tail)


def shift_lyrics(evidence, loop):
    if not evidence:
        return evidence
    result = dict(evidence)
    boundary = loop['startSeconds']+loop['loopSeconds']
    for key in ('firstSeconds', 'lastStartSeconds', 'reviewedHeadSeconds', 'reviewedTailSeconds'):
        if result.get(key) is not None and result[key] >= boundary:
            result[key] += loop['repeats']*loop['loopSeconds']
    return result
