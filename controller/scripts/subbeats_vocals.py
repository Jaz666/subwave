"""Conservative vocal-passage estimates from already-separated preview regions.
Energy gates cannot prove words/phrases or musical bar starts. No mixing changes.
"""
import math
import numpy as np
from analyze_worker import TAIL_VOCAL_MIX_FLOOR, VOCAL_STEM_REL, vocal_ranges_from_rms


def measure_vocals(parts, sample_rate, start_seconds=0.):
    if not math.isfinite(start_seconds) or start_seconds < 0:
        raise ValueError('Invalid vocal coverage start')
    if not math.isfinite(sample_rate) or sample_rate <= 0:
        raise ValueError('Invalid vocal measurement sample rate')
    size = parts['vocals'].shape[1]
    if not size or any(part.shape != (2,size) or not np.isfinite(part).all() for part in parts.values()):
        raise ValueError('Invalid cached audio for vocal measurement')
    hop = max(1,round(sample_rate * .05))
    duration = size / sample_rate
    def rms(audio):
        count,extra = divmod(size,hop)
        energy = np.mean(audio[:,:count*hop].reshape(2,count,hop)**2,axis=(0,2)) if count else np.array([])
        if extra:
            energy = np.r_[energy,np.mean(audio[:,-extra:]**2)]
        return np.sqrt(energy)
    vocal = rms(parts['vocals'])
    mix = rms(sum(parts.values()))
    # Sparse passages must not disappear when over 90% of the stem is silent.
    reference = vocal[vocal > 0]
    core = vocal_ranges_from_rms(vocal,mix,sample_rate,hop,TAIL_VOCAL_MIX_FLOOR,loud_reference=reference)
    # Lower thresholds extend observed passages through quieter releases; they
    # cannot create a passage without evidence from the normal vocal gate.
    tails = vocal_ranges_from_rms(vocal,mix,sample_rate,hop,TAIL_VOCAL_MIX_FLOOR*.2,
                                  stem_rel=VOCAL_STEM_REL*.2,
                                  loud_reference=reference)
    passages = []
    for tail in tails:
        active = [run for run in core if run['startMs'] < tail['endMs'] and run['endMs'] > tail['startMs']]
        if not active:
            continue
        first = max(0.,tail['startMs']/1000-.2)
        last = min(duration,tail['endMs']/1000+.2)
        passage = dict(startSeconds=start_seconds+first,endSeconds=start_seconds+last,
                       activityStartSeconds=start_seconds+min(run['startMs'] for run in active)/1000,
                       activityEndSeconds=start_seconds+max(run['endMs'] for run in active)/1000,
                       openStart=first <= 0.,openEnd=last >= duration,
                       confidence='uncertain' if first <= 0. or last >= duration else 'estimated')
        # Padding can join two observations; keep one conservative passage.
        if passages and passage['startSeconds'] <= passages[-1]['endSeconds']:
            previous = passages[-1]
            previous.update(endSeconds=passage['endSeconds'],activityEndSeconds=passage['activityEndSeconds'],openEnd=passage['openEnd'])
            if passage['confidence'] == 'uncertain':
                previous['confidence'] = 'uncertain'
        else:
            passages.append(passage)
    return dict(version=1,method='stem-energy',barAlignment='unverified',
                coverageStartSeconds=start_seconds,coverageEndSeconds=start_seconds+duration,
                resolutionSeconds=hop/sample_rate,passages=passages)
