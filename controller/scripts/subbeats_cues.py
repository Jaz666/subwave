"""Estimated opening/closing passages on a consistent Beat This! grid.

Retain source-zero introductions and natural ending tails. Historical local
arrangement scoring remains for offline comparisons, not new phrase selection.
Cue evidence is for preview, never automatic pair or phrase approval.
"""
import importlib.metadata
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from subbeats_cache import cached_entry, digest, prepare_cached

VERSION = 1
ALGORITHM_VERSION = 6
TAIL_SECONDS = 16
OPENING_WINDOW_BEATS = 32
OPENING_WINDOW_STEP = 4
OPENING_MAX_START_BEATS = 16
SPAN_FIT_MAX_P95_SECONDS = .1


def stable_beat_windows(beats, downbeats):
    """Locally steady Beat This! windows with a supported bar phase."""
    import numpy as np
    beats, downbeats = np.asarray(beats, dtype=float), np.asarray(downbeats, dtype=float)
    indices = np.searchsorted(beats, downbeats)
    valid = indices < len(beats)
    indices, matched = indices[valid], downbeats[valid]
    exact = np.abs(beats[indices] - matched) < .02
    indices = indices[exact]
    windows = []
    for start in range(0, len(beats) - OPENING_WINDOW_BEATS + 1, OPENING_WINDOW_STEP):
        times = beats[start:start + OPENING_WINDOW_BEATS]
        period, origin = np.polyfit(np.arange(OPENING_WINDOW_BEATS), times, 1)
        error = np.abs(times - (origin + period * np.arange(OPENING_WINDOW_BEATS)))
        if (not 60 <= 60 / period <= 190 or np.percentile(error, 95) > .045
                or np.mean(np.abs(np.diff(times) / period - 1) < .2) < .9):
            continue
        local = indices[(indices >= start) & (indices < start + OPENING_WINDOW_BEATS)]
        if len(local) < 5:
            continue
        phases, counts = np.unique(local % 4, return_counts=True)
        winner = int(np.argmax(counts))
        support = float(counts[winner] / len(local))
        if support >= .75:
            windows.append(dict(start_index=start, end_index=start + OPENING_WINDOW_BEATS - 1,
                start_seconds=float(times[0]), end_seconds=float(times[-1]), bpm=float(60 / period),
                p95_error_ms=float(np.percentile(error, 95) * 1000),
                downbeat_phase=int(phases[winner]), downbeat_phase_support=support))
    return windows, indices


def tempo_relation(a, b):
    import numpy as np
    error, factor = min((abs(a / (b * factor) - 1), factor) for factor in (.5, 1., 2.))
    return float(error), float(factor)


def supported_grid_matches(windows, regions, beats):
    """Require a stable Beat This! phase chain and independent Librosa tempo."""
    import numpy as np
    matches = []
    by_start = {window['start_index']: window for window in windows}
    for window in windows:
        for region in regions:
            if region['end_seconds'] < window['end_seconds']:
                continue
            relation, factor = tempo_relation(region['bpm'], window['bpm'])
            if relation > .02:
                continue
            region_end = int(np.searchsorted(beats, region['end_seconds']))
            expected = range(window['start_index'], max(window['start_index'] + 1, region_end - 31), 4)
            chain = [by_start[start] for start in expected if start in by_start
                and tempo_relation(by_start[start]['bpm'], window['bpm'])[1] == 1.
                and tempo_relation(by_start[start]['bpm'], window['bpm'])[0] <= .02
                and by_start[start]['downbeat_phase'] == window['downbeat_phase']
                and by_start[start]['downbeat_phase_support'] >= .75]
            coverage = len(chain) / max(1, len(expected))
            if coverage < .7 or not chain or any(b['start_index']-a['start_index'] > 8 for a,b in zip(chain,chain[1:])):
                continue
            prior = [candidate for candidate in windows if candidate['start_index'] < window['start_index']
                and candidate['downbeat_phase'] != window['downbeat_phase']
                and tempo_relation(candidate['bpm'], window['bpm'])[1] == 1.
                and tempo_relation(candidate['bpm'], window['bpm'])[0] <= .02]
            matches.append(dict(window=window, region=region, relative_error=relation, factor=factor,
                chain_coverage=coverage, earlier_phase_conflict=len(prior) >= 3))
    matches.sort(key=lambda item:(item['window']['start_seconds'],item['relative_error'],
        item['window']['downbeat_phase_support']*-1,item['region']['start_seconds']))
    return matches


def refit_opening_sixteen(beats, origin, initial_bpm):
    """Use the observed 64-beat passage when its fixed-phase fit is sound."""
    import numpy as np
    beats = np.asarray(beats, dtype=float)
    index = int(np.searchsorted(beats, origin))
    if index >= len(beats) or (index and abs(beats[index - 1] - origin) < abs(beats[index] - origin)):
        index -= 1
    if index < 0 or abs(beats[index] - origin) > .05 or index + 64 >= len(beats):
        return None
    times = beats[index:index + 65]
    period = (float(times[-1]) - origin) / 64
    intervals = np.diff(times) / period
    error = times - (origin + np.arange(65) * period)
    bpm = 60 / period
    if (not 60 <= bpm <= 190 or abs(bpm / initial_bpm - 1) > .02
            or np.mean(np.abs(intervals - 1) < .2) < .98
            or np.percentile(np.abs(error), 95) > SPAN_FIT_MAX_P95_SECONDS):
        return None
    return dict(sourceSeconds=float(times[-1]), bpm=float(bpm),
        p95ErrorSeconds=float(np.percentile(np.abs(error), 95)))


def opening_grid_incoming(beats, downbeats, supported_regions, duration):
    """Propose early 8/16-bar arrivals; correct only a verified 16-bar span."""
    import numpy as np
    windows, downbeat_indices = stable_beat_windows(beats, downbeats)
    matches = supported_grid_matches(windows, supported_regions, beats)
    if not matches:
        return None
    match = matches[0]
    window = match['window']
    if (match['earlier_phase_conflict'] or window['start_index'] > OPENING_MAX_START_BEATS):
        return None
    phase_downbeats = [(float(at), int(index)) for at,index in zip(downbeats,
        np.searchsorted(beats, downbeats)) if index < len(beats)
        and abs(beats[index]-at) < .02 and window['start_index'] <= index <= window['end_index']
        and index % 4 == window['downbeat_phase']]
    if not phase_downbeats:
        return None
    origin = phase_downbeats[0][0]
    period = 60 / window['bpm']
    incoming = []
    for bars in (8, 16):
        seconds = origin + bars * 4 * period
        bpm = window['bpm']
        if bars == 16:
            fitted = refit_opening_sixteen(beats, origin, bpm)
            if fitted:
                seconds, bpm = fitted['sourceSeconds'], fitted['bpm']
        if seconds + 8 * period < duration and seconds < 130 - 16 * 1.08 - .05:
            incoming.append(dict(sourceSeconds=float(seconds), bpm=float(bpm),
                strength=float(match['chain_coverage']), reason='opening', phraseBars=bars,
                barNumber=bars, timingSource='opening-grid', phraseStartSeconds=origin))
    return incoming or None


def onset_grid_incoming(beats, downbeats, onset, duration):
    """Fallback for light/high-passed openings whose Beat This! grid is stable later."""
    import numpy as np
    beats, downbeats, onset = np.asarray(beats), np.asarray(downbeats), np.asarray(onset)
    if len(beats) < 64 or len(downbeats) < 8 or not len(onset):
        return None
    steps = np.diff(beats)
    median = float(np.median(steps))
    period = float(np.mean(steps[np.abs(steps / median - 1) < .2]))
    if not 60 <= 60 / period <= 190:
        return None
    hop = 256 / 22050
    early, late = np.zeros(len(beats)), np.zeros(len(beats))
    for i, at in enumerate(beats):
        first = max(0, int(at / hop))
        stop = min(len(onset), first + max(1, round(.16 / hop)))
        late_first, late_stop = min(len(onset), first + round(.55 * period / hop)), min(len(onset), first + round(.9 * period / hop))
        if first < len(onset): early[i] = float(np.max(onset[first:stop]))
        if late_first < late_stop: late[i] = float(np.max(onset[late_first:late_stop]))
    reference = float(np.percentile(early, 75))
    if reference < 1e-5:
        return None
    strong = (early >= reference * .5) & (early - late >= reference * .1)
    indices = np.searchsorted(beats, downbeats)
    exact = (indices < len(beats)) & (np.abs(beats[np.minimum(indices, len(beats)-1)] - downbeats) < .02)
    entry = next((float(at) for at,index in zip(downbeats[exact],indices[exact])
        if index + 16 <= len(beats) and strong[index]
        and np.mean(strong[index:index+16]) >= .85
        and np.mean(np.abs(np.diff(beats[index:index+16]) / period - 1) < .2) >= .85), None)
    if entry is None:
        return None
    anchor = entry
    if entry < 16 * period:
        earlier = downbeats[(downbeats <= entry) & (np.abs((entry-downbeats)/(4*period)
            - np.rint((entry-downbeats)/(4*period))) < .08)]
        if len(earlier): anchor = float(earlier[0])
    fit = beats[beats >= anchor]
    for _ in range(5):
        ordinals = np.rint((fit-anchor)/period)
        good = np.abs(fit-(anchor+ordinals*period)) < .06
        if good.sum() < 64 or np.dot(ordinals[good],ordinals[good]) == 0:
            return None
        period = float(np.dot(ordinals[good],fit[good]-anchor)/np.dot(ordinals[good],ordinals[good]))
    residual = np.abs(fit-(anchor+np.rint((fit-anchor)/period)*period))
    if not 60 <= 60 / period <= 190 or np.mean(residual < .06) < .85:
        return None
    bars_before = max(0, round((anchor-float(downbeats[0]))/(4*period)))
    origin = anchor-bars_before*4*period
    if bars_before > 16: origin += ((bars_before-16)//4)*16*period
    if origin < 0: origin += 4*period
    bpm = 60 / period
    incoming = []
    for bars in (16, 8):
        seconds = origin + bars * 4 * period
        if seconds + 8*period < duration and seconds < 130-16*1.08-.05:
            point = dict(sourceSeconds=float(seconds),bpm=float(bpm),strength=float(np.mean(residual < .06)),
                reason='opening',phraseBars=bars,phraseStartSeconds=float(origin),timingSource='onset-grid')
            if bars == 16:
                fitted = refit_opening_sixteen(beats, origin, bpm)
                if fitted: point.update(sourceSeconds=fitted['sourceSeconds'],bpm=fitted['bpm'])
            incoming.append(point)
    if entry-origin >= 32*period and entry < 130-16*1.08-.05 and all(abs(entry-c['sourceSeconds'])>.1 for c in incoming):
        incoming.insert(0,dict(sourceSeconds=float(entry),bpm=float(bpm),strength=float(np.mean(residual < .06)),
            reason='opening',phraseStartSeconds=float(origin),timingSource='onset-grid'))
    return incoming or None


def bar_candidates(beats, downbeats, energy, spectrum, chroma, *, earliest_seconds=0., outgoing=False, incoming=False):
    import numpy as np
    beats, downbeats = np.asarray(beats), np.asarray(downbeats)
    if (not np.isfinite(beats).all() or not np.isfinite(downbeats).all()
            or np.any(np.diff(beats) <= 0) or np.any(np.diff(downbeats) <= 0)
            or not np.isin(downbeats, beats).all()):
        raise ValueError('Invalid learned beat/bar grid')
    bars = []
    for start, end in zip(downbeats, downbeats[1:]):
        ix = np.flatnonzero((beats >= start) & (beats < end))
        if len(ix) != 4:
            bars.append(None)
            continue
        intervals = np.diff(np.r_[beats[ix], end])
        if np.max(np.abs(intervals / np.median(intervals) - 1)) > .2:
            bars.append(None)
            continue
        bars.append(ix)
    levels = np.array([float(np.median(energy[0, bar])) if bar is not None else np.nan for bar in bars])
    candidates = []
    fade_found = False
    for i in range(2, len(bars)-2):
        if downbeats[i] < earliest_seconds:
            continue
        # Never bridge a missed beat or changed bar origin with an ordinal count.
        if any(bar is None for bar in bars[i-2:i+2]):
            continue
        local = np.concatenate(bars[i-2:i+2])
        slope, origin = np.polyfit(np.arange(len(local)), beats[local], 1)
        error = float(np.max(np.abs(beats[local] - (origin+slope*np.arange(len(local))))))
        if error > .035 or not 60 <= 60/slope <= 190:
            continue
        novelty, repeat = 0., 0.
        for width in (1, 2, 4):
            if i < 2*width or i+width > len(bars) or any(bar is None for bar in bars[i-2*width:i+width]):
                continue
            previous, before, after = [np.array(bars[a:b]) for a,b in ((i-2*width,i-width),(i-width,i),(i,i+width))]
            def distance(a,b):
                return float(np.abs(spectrum[:,a] - spectrum[:,b]).sum(axis=0).mean())
            repeat = max(repeat, distance(before,after)-distance(previous,before))
            delta = energy[:,after].mean(axis=(1,2))-energy[:,before].mean(axis=(1,2))
            timbre = float(np.abs(spectrum[:,after].mean(axis=(1,2))-spectrum[:,before].mean(axis=(1,2))).sum())
            ca, cb = chroma[:,before].mean(axis=(1,2)), chroma[:,after].mean(axis=(1,2))
            harmonic = float(np.linalg.norm(ca/max(1e-12,np.linalg.norm(ca))-cb/max(1e-12,np.linalg.norm(cb))))
            novelty = max(novelty, float(np.max(np.abs(delta)))/6, timbre/.35, harmonic/.5)
        fade = 0.
        if outgoing and not fade_found:
            before_level = float(np.median(levels[i-2:i]))
            future = levels[i:]
            future = future[np.isfinite(future)]
            if len(future) >= 6:
                initial_drop = before_level-float(np.median(future[:2]))
                final_drop = before_level-float(np.median(future[-2:]))
                # A gradual, sustained decline with no later return to full level.
                # The first supported onset is useful; do not fill the menu with
                # successive points inside the same fade.
                if (1 <= initial_drop <= 4 and final_drop >= 6
                        and np.max(future[2:]) <= before_level-initial_drop+.75
                        and np.mean(np.diff(future) <= .75) >= .75):
                    fade = final_drop/6
                    fade_found = True
        # Absolute evidence floors allow an empty result in unchanging material.
        if repeat < .04 and novelty < 1 and not fade:
            continue
        candidates.append(dict(sourceSeconds=float(downbeats[i]), bpm=float(60/slope),
                               strength=max(repeat*10,novelty,fade),
                               reason='fade' if fade else 'repetition' if repeat*10 >= novelty else 'arrangement'))
    phrases = {}
    if outgoing:
        by_bar = {int(np.searchsorted(downbeats,c['sourceSeconds'])): c for c in candidates}
        fade_start = next((c['sourceSeconds'] for c in candidates if c['reason']=='fade'), float('inf'))
        for i, item in by_bar.items():
            if item['sourceSeconds'] >= fade_start:
                continue
            for width in (8, 16):
                j = i+width
                end = by_bar.get(j)
                if end is None or any(bar is None for bar in bars[i:j+2]):
                    continue
                # Count observed complete bars, never project from file end or
                # across a gap. Check timing throughout the proposed passage.
                local = np.concatenate(bars[i:j+2])
                periods = np.diff(beats[local])
                if np.max(np.abs(periods/np.median(periods)-1)) > .2:
                    continue
                body = float(np.median(levels[i:j]))
                ending = float(np.median(levels[j:j+2]))
                future = levels[j:]
                future = future[np.isfinite(future)]
                # ponytail: energy decline plus two structural boundaries is a
                # phrase hypothesis; vocal/section recognition needs listening.
                if (not 1 <= body-ending <= 6 or len(future) < 4
                        or np.mean(future <= body-1) < .75
                        or np.max((future[:-1]+future[1:])/2) > body):
                    continue
                score = min(item['strength'],4)+min(end['strength'],4)+(0.5 if width==16 else 0)
                if score > phrases.get(i,0):
                    phrases[i] = score
                    item.update(phraseBars=width,phraseEndSeconds=end['sourceSeconds'])
    if incoming:
        by_bar = {int(np.searchsorted(downbeats,c['sourceSeconds'])): c for c in candidates}
        first = next((i for i,bar in enumerate(bars) if bar is not None), None)
        for i,item in by_bar.items():
            for width in (8,16):
                j = i-width
                if j < 0 or (j != first and j not in by_bar) or any(bar is None for bar in bars[j:i+2]):
                    continue
                local = np.concatenate(bars[j:i+2])
                periods = np.diff(beats[local])
                if np.max(np.abs(periods/np.median(periods)-1)) > .2:
                    continue
                body = float(np.median(levels[j:i]))
                arrival = float(np.median(levels[i:i+2]))
                # ponytail: structural arrivals and continuous bars suggest an
                # opening phrase; they do not establish vocal-free material.
                if arrival < body-1:
                    continue
                start = float(downbeats[j])
                score = min(item['strength'],4)+min(max(0,arrival-body)/3,2)+2/(1+start)
                if score > phrases.get(i,0):
                    phrases[i] = score
                    item.update(phraseBars=width,phraseStartSeconds=start)
    selected = []
    if incoming:
        # Keep strong unconstrained arrivals alongside phrase hypotheses.
        for item in sorted(candidates,key=lambda c:c['strength'],reverse=True):
            if all(abs(item['sourceSeconds']-c['sourceSeconds']) >= 6*60/item['bpm'] for c in selected):
                selected.append(item)
            if len(selected)==3:
                break
    def rank(c):
        i = int(np.searchsorted(downbeats,c['sourceSeconds']))
        return (i in phrases, phrases.get(i,0), c['reason']!='fade', c['strength'])
    # Reserve one alternative for the recorded fade, without promoting it above
    # a supported closing passage or filling the menu with fade-internal changes.
    fade = next((c for c in candidates if c['reason']=='fade'), None)
    for item in sorted(candidates,key=rank,reverse=True):
        if all(abs(item['sourceSeconds']-c['sourceSeconds']) >= 6*60/item['bpm'] for c in selected):
            selected.append(item)
        if len(selected)==(7 if fade is not None else 8):
            break
    if fade is not None and fade not in selected:
        selected.append(fade)
    return sorted(selected,key=rank,reverse=True) if incoming else selected


def fitted_passages(y, sr, beats, downbeats):
    """Estimated phrase grid, full opening and natural-ending hypotheses.

    Audio origin is never a cue-in. Four-bar ending alignment is a conservative
    phrase hypothesis, not proof of structure; retain the recording's whole tail.
    """
    import numpy as np
    from scipy.signal import butter, sosfiltfilt
    beats, downbeats = np.asarray(beats), np.asarray(downbeats)
    if (beats.ndim != 1 or downbeats.ndim != 1 or not np.isfinite(beats).all()
            or not np.isfinite(downbeats).all() or np.any(np.diff(beats)<=0)
            or np.any(np.diff(downbeats)<=0) or not np.isin(downbeats,beats).all()
            or np.any(beats<0) or np.any(beats>=len(y)/sr)):
        raise ValueError('Invalid learned beat/bar grid')
    empty = dict(incoming=[],outgoing=[],grid=None,ending=None)
    if len(beats)<64 or len(downbeats)<8:
        return empty
    steps = np.diff(beats)
    median = float(np.median(steps))
    period = float(np.mean(steps[abs(steps/median-1)<.2]))
    if not 60<=60/period<=190:
        return empty
    low = sosfiltfilt(butter(3,[35,160],btype='bandpass',fs=sr,output='sos'),y)
    power = np.r_[0.,np.cumsum(low*low,dtype=np.float64)]
    first = np.rint(beats*sr).astype(int)
    stop = np.minimum(len(y),first+round(.16*sr))
    strength = np.sqrt(np.maximum(0,power[stop]-power[first])/np.maximum(1,stop-first))
    reference = float(np.percentile(strength,75))
    if reference<1e-5:
        return empty
    late_first=np.minimum(len(y),first+round(.55*period*sr))
    late_stop=np.minimum(len(y),first+round(.9*period*sr))
    late=np.sqrt(np.maximum(0,power[late_stop]-power[late_first])/np.maximum(1,late_stop-late_first))
    strong=(strength>=reference*.75)&(strength-late>=reference*.15)
    # An established entry needs sustained beat-spaced low-frequency support.
    # A single bass note or a model downbeat in a beatless intro is insufficient.
    entry = None
    for at in downbeats:
        i = int(np.searchsorted(beats,at))
        if (i+16<=len(beats) and strong[i] and np.mean(strong[i:i+16])>=.85
                and np.mean(abs(np.diff(beats[i:i+16])/period-1)<.2)>=.85):
            entry=float(at)
            break
    if entry is None:
        return empty
    # Short pickups use the earliest consistent bar phase. A long beatless
    # opening is projected back sixteen bars from its established entry instead.
    anchor = entry
    if entry<16*period:
        earlier = downbeats[(downbeats<=entry)&(abs((entry-downbeats)/(4*period)-np.rint((entry-downbeats)/(4*period)))<.08)]
        if len(earlier):
            anchor=float(earlier[0])
    fit = beats[beats>=anchor]
    for _ in range(5):
        ordinals = np.rint((fit-anchor)/period)
        good = abs(fit-(anchor+ordinals*period))<.06
        if good.sum()<64 or np.dot(ordinals[good],ordinals[good])==0:
            return empty
        period = float(np.dot(ordinals[good],fit[good]-anchor)/np.dot(ordinals[good],ordinals[good]))
    residual = abs(fit-(anchor+np.rint((fit-anchor)/period)*period))
    if not 60<=60/period<=190 or np.mean(residual<.06)<.85:
        return empty
    bars_before=max(0,round((anchor-float(downbeats[0]))/(4*period)))
    origin=anchor-bars_before*4*period
    # Long openings retain at least sixteen bars before the established entry.
    # Shift only whole four-bar groups, keeping the earlier phrase phase instead
    # of assigning every late entry a new universal bar-zero phase.
    if bars_before>16:
        origin+=((bars_before-16)//4)*16*period
    if origin<0:
        origin+=4*period
    bpm = 60/period
    grid = dict(originSeconds=origin,anchorSeconds=anchor,drivingBeatSeconds=entry,bpm=bpm,
                fitFraction=float(np.mean(residual<.06)),p95ErrorSeconds=float(np.percentile(residual[residual<.06],95)),
                phaseDisagreements=int(np.sum(abs((downbeats-origin)/(4*period)-np.rint((downbeats-origin)/(4*period)))>.15)),
                confidence='estimated')
    def point(seconds,width,role):
        return dict(sourceSeconds=float(seconds),bpm=bpm,strength=grid['fitFraction'],
                    reason='opening' if role=='incoming' else 'ending',phraseBars=width,
                    barNumber=int(round((seconds-origin)/(4*period))),timingSource='fitted-grid',
                    **({'phraseStartSeconds':origin} if role=='incoming' else {'phraseEndSeconds':endpoint}))
    duration=len(y)/sr
    incoming=[]
    for width in (16,8):
        arrival=origin+width*4*period
        if (arrival+8*period<duration and arrival<130-TAIL_SECONDS*1.08-.05
                and (arrival>=entry-.1 or entry<16*period
                     or float(np.interp(arrival,beats,strength))>=reference*.75)):
            incoming.append(point(arrival,width,'incoming'))
    if (entry-origin>=32*period and entry<130-TAIL_SECONDS*1.08-.05
            and all(abs(entry-c['sourceSeconds'])>.1 for c in incoming)):
        arrival=point(entry,16,'incoming')
        arrival.pop('phraseBars')  # An observed entry need not be 8 or 16 bars.
        incoming.insert(0,arrival)
    # Last audible body/decay evidence is separate from EOF and the last model
    # prediction. Relative threshold tolerates fades; an absolute floor avoids
    # retaining digital noise as a musical ending. The complete tail stays saved.
    hop=max(1,round(.05*sr));count=len(y)//hop
    rms=np.sqrt(np.mean(y[:count*hop].reshape(count,hop)**2,axis=1))
    audible=np.flatnonzero(rms>=max(1e-3,float(np.percentile(rms,75))*.01))
    if not len(audible):
        return {**empty,'grid':grid}
    audible_end=min(duration,(int(audible[-1])+1)*hop/sr)
    # ponytail: four-bar phrase continuation is an explicit hypothesis; section
    # recognition can replace this after a broader set of listening references.
    body=np.flatnonzero(rms>=max(1e-3,float(np.percentile(rms,75))*.4))
    body_end=min(duration,(int(body[-1])+1)*hop/sr) if len(body) else audible_end
    phrase=round((body_end-origin)/(16*period))
    endpoint=origin+phrase*16*period
    if endpoint>=duration:
        endpoint-=16*period
    outgoing=[];ending=None
    if (audible_end<duration-.15 and duration*.5<endpoint<duration and 0<duration-endpoint<=TAIL_SECONDS
            and abs(endpoint-body_end)<=8*period):
        ending=dict(phraseEndSeconds=endpoint,audibleEndSeconds=audible_end,
                    tailSeconds=duration-endpoint,bodyEndSeconds=body_end,confidence='estimated')
        for width in (16,8):
            start=endpoint-width*4*period
            if start>=duration*.5:
                outgoing.append(point(start,width,'outgoing'))
    return dict(incoming=incoming,outgoing=outgoing,grid=grid,ending=ending)


def predict(y, sr, model):
    from subbeats_models import model_path
    path = model_path(model)
    try:
        import torch
        from beat_this.inference import Audio2Beats
    except ImportError as error:
        raise ValueError('Beat This! preparation needs an updated heavy analyzer. Choose current preparation until it is rebuilt.') from error
    threads = torch.get_num_threads()
    try:
        torch.set_num_threads(2)
        tracker = Audio2Beats(checkpoint_path=str(path), device='cpu', dbn=False)
        return tracker(y, sr)
    finally:
        torch.set_num_threads(threads)


def prepare_cues(path, state_dir, folder, record, model, *, cache_root, allowance, expected_cache_id):
    import librosa
    import numpy as np
    from subbeats_models import MODELS
    from subbeats_prepare import SR, analyze, decode, require_shared_cache
    if model not in MODELS:
        raise ValueError('Unknown cue preparation method')
    identity = dict(mode='cue-points',version=ALGORITHM_VERSION,model=model,model_sha256=MODELS[model],
                    beat_this='1.1.0',librosa=librosa.__version__,
                    source_sha256=record['identity']['source_sha256'],bundle_sha256=digest(Path(folder)/'manifest.json'))
    def build(stage):
        if digest(Path(path)) != identity['source_sha256']:
            raise ValueError('Cue source no longer matches the prepared stems')
        if importlib.metadata.version('beat-this') != identity['beat_this']:
            raise ValueError('Rebuild the heavy analyzer for the supported Beat This! version')
        y = decode(path,SR,1)[0]
        beats, downbeats = predict(y,SR,model)
        if (not np.isfinite(beats).all() or np.any(beats < 0) or np.any(beats >= len(y)/SR)):
            raise ValueError('Learned grid is outside the decoded recording')
        duration = len(y)/SR
        roles = fitted_passages(y,SR,beats,downbeats)
        if not roles['incoming']:
            with TemporaryDirectory(prefix='.cue-analysis-',dir=stage) as work:
                evidence = analyze(path,Path(work),librosa)
                windows, downbeat_indices = stable_beat_windows(beats,downbeats)
                matches = supported_grid_matches(windows,evidence['supported_regions'],beats)
                if matches:
                    selected = matches[0]
                    incoming = opening_grid_incoming(beats,downbeats,evidence['supported_regions'],duration)
                    if (incoming is None and not selected['earlier_phase_conflict']
                            and selected['chain_coverage'] >= .7):
                        with np.load(Path(work)/'rhythm.npz') as rhythm:
                            onset = rhythm['onset'].copy()
                        fallback = onset_grid_incoming(beats,downbeats,onset,duration)
                        if fallback:
                            relation, _ = tempo_relation(selected['region']['bpm'],fallback[0]['bpm'])
                            if relation <= .02:
                                incoming = fallback
                    if incoming:
                        roles['incoming'] = incoming
        if digest(Path(path)) != identity['source_sha256']:
            raise ValueError('Cue source changed during preparation')
        require_shared_cache(state_dir,expected_cache_id)
        (stage/'grid.json').write_text(json.dumps(dict(beatsSeconds=np.asarray(beats).tolist(),downbeatsSeconds=np.asarray(downbeats).tolist()),allow_nan=False)+'\n')
        (stage/'cues.json').write_text(json.dumps(dict(version=VERSION,algorithmVersion=ALGORITHM_VERSION,model=model,durationSeconds=duration,**roles),allow_nan=False)+'\n')
        return dict(bundle_key=Path(folder).name,model=model,durationSeconds=duration,**roles)
    result = prepare_cached(state_dir,identity,build,cache_root=cache_root,allowance=allowance)
    return dict(version=VERSION,algorithmVersion=ALGORITHM_VERSION,model=model,artifactKey=Path(result['directory']).name,durationSeconds=result['metadata']['durationSeconds'],
                incoming=result['metadata']['incoming'],outgoing=result['metadata']['outgoing'],
                grid=result['metadata'].get('grid'),ending=result['metadata'].get('ending'))


def load_cues(state, stems_root, track_id, key, bundle):
    import re
    from subbeats_cache import bundle_folder
    if not isinstance(key,str) or not re.fullmatch('[a-f0-9]{64}',key):
        raise ValueError('Prepare cue points for both tracks first')
    folder = bundle_folder(state,key,stems_root,track_id)
    identity = json.loads((folder/'manifest.json').read_text())['identity']
    record = cached_entry(folder,identity)
    if (record is None or identity.get('mode')!='cue-points' or identity.get('version') not in (3,4,5,ALGORITHM_VERSION)
            or record['metadata'].get('bundle_key')!=bundle.name
            or identity.get('bundle_sha256')!=digest(bundle/'manifest.json')):
        raise ValueError('Cue points no longer match these stems. Recheck with a cue-point method.')
    return json.loads((folder/'cues.json').read_text())
