"""Conservative vocal-passage estimates from already-separated preview regions.
Energy gates cannot prove words/phrases or musical bar starts. No mixing changes.
"""
import math
import os
from pathlib import Path
import numpy as np
from analyze_worker import VOCAL_MIX_FLOOR, VOCAL_STEM_REL, vocal_ranges_from_rms

SILERO_MODEL = Path(os.environ.get('SILERO_VAD_MODEL', '/opt/analyzer/silero_vad.onnx'))
SILERO_THRESHOLD = .5


def measure_silero(vocal, sample_rate, start_seconds=0.):
    """Run the pinned Silero ONNX VAD over a mono vocal stem; return evidence spans."""
    import librosa
    import onnxruntime as ort

    audio = np.asarray(vocal, dtype=np.float32)
    if audio.ndim == 2:
        audio = audio.mean(axis=0)
    if audio.ndim != 1 or not audio.size or not np.isfinite(audio).all():
        raise ValueError('Invalid audio for Silero VAD')
    if sample_rate != 16000:
        audio = librosa.resample(audio, orig_sr=sample_rate, target_sr=16000)
    options = ort.SessionOptions()
    options.inter_op_num_threads = options.intra_op_num_threads = 1
    session = ort.InferenceSession(str(SILERO_MODEL), sess_options=options, providers=['CPUExecutionProvider'])
    state = np.zeros((2, 1, 128), dtype=np.float32)
    context = np.zeros((1, 64), dtype=np.float32)
    probabilities = []
    for offset in range(0, len(audio), 512):
        chunk = audio[offset:offset + 512]
        if len(chunk) < 512:
            chunk = np.pad(chunk, (0, 512-len(chunk)))
        data = np.concatenate((context, chunk[None, :]), axis=1)
        out, state = session.run(None, {'input': data, 'state': state, 'sr': np.array(16000, dtype=np.int64)})
        probabilities.append(float(out[0][0]))
        context = data[:, -64:]
    # Collapse adjacent 32 ms windows, allowing the default 150 ms hysteresis.
    active = np.array(probabilities) >= SILERO_THRESHOLD
    spans, began = [], None
    last_active = None
    for i, yes in enumerate(active):
        if yes:
            if began is None:
                began = i
            last_active = i
        elif began is not None and (i-last_active)*.032 >= .15:
            if (last_active+1-began)*.032 >= .25:
                spans.append(dict(startSeconds=start_seconds+began*.032,
                                  endSeconds=start_seconds+(last_active+1)*.032))
            began = last_active = None
    if began is not None and (len(active)-began)*.032 >= .25:
        spans.append(dict(startSeconds=start_seconds+began*.032,
                          endSeconds=start_seconds+len(active)*.032))
    return dict(method='silero-vad-v5.1.2', threshold=SILERO_THRESHOLD,
                sampleRate=16000, resolutionSeconds=.032, passages=spans)


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
    core = vocal_ranges_from_rms(vocal,mix,sample_rate,hop,loud_reference=reference)
    # Lower thresholds extend observed passages through quieter releases; they
    # cannot create a passage without evidence from the normal vocal gate.
    tails = vocal_ranges_from_rms(vocal,mix,sample_rate,hop,stem_rel=VOCAL_STEM_REL*.2,mix_floor=VOCAL_MIX_FLOOR*.2,loud_reference=reference)
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
