"""Preview-only phrase windows. Four beats per bar; no invented downbeat proof."""
import math

ALLOWED_BARS = (16, 8, 4)


def plan_phrase(in_cue, period, incoming_seconds, outgoing_seconds, out_cue,
                candidates, *, bar_shift=0, allowed_bars=ALLOWED_BARS):
    """A musical destination fixes the exchange; preserve source zero before it.

    Cue positions must come from sustained kick fits. The caller separately
    establishes outgoing phrase phase and checks loop repetition. A counted
    opening boundary is an explicit inference, never a measured sound change.
    """
    if (any(not math.isfinite(v) for v in (in_cue, period, incoming_seconds, outgoing_seconds, out_cue))
            or not .25 <= period <= 1 or min(in_cue, out_cue) < 0
            or not allowed_bars or any(b not in ALLOWED_BARS for b in allowed_bars)
            or type(bar_shift) is not int or not -2 <= bar_shift <= 2):
        raise ValueError('Invalid phrase planning evidence')
    choices = []
    for event in candidates:
        at = event['at_seconds']
        count = round((at - in_cue) / (16 * period)) * 16
        if (count < 16 or abs(at - (in_cue + count * period)) > .5 * period
                or event['strength'] < 1 or len(event['evidence']) < 2):
            continue
        choices.append((count, 'structural', float(event['strength'])))
    # Immediate, sustained opening: sixteen counted bars are useful even when
    # a later phrase boundary has no large energy/timbre discontinuity.
    if in_cue < period:
        choices.extend((count, 'counted_opening', 0.) for count in (64, 32, 16))
    plans = []
    for reference_beats, evidence, strength in choices:
        for bars in allowed_bars:
            hold_bars = reference_beats // 4 - bars
            if hold_bars not in (0, 4, 8, 16):
                continue
            source_exchange = in_cue + hold_bars * 4 * period
            shift = bar_shift * 4 * period
            leads = [b for b in (4, 8, 16) if b * 4 * period - source_exchange + shift >= .1]
            if not leads:
                continue
            lead_bars = min(leads)
            lead = lead_bars * 4 * period
            duration = lead + bars * 4 * period + 8
            incoming_start = lead - source_exchange + shift
            if (duration > 120 or duration - incoming_start > incoming_seconds
                    or out_cue + bars * 4 * period > outgoing_seconds):
                continue
            plans.append({'bars': bars, 'hold_bars': hold_bars, 'lead_bars': lead_bars,
                          'loop_bars': 4, 'period': period, 'out_cue': out_cue,
                          'incoming_start': incoming_start, 'source_exchange': source_exchange,
                          'incoming_reference': in_cue + reference_beats * period,
                          'reference_evidence': evidence, 'strength': strength,
                          'lead': lead, 'duration': duration, 'bar_shift': bar_shift,
                          'phrase_verified': False})
    if not plans:
        raise ValueError('No complete 4-, 8- or 16-bar phrase window fits the prepared audio.')
    # Prefer the established 16-bar mix, then structural evidence and the first
    # suitable destination. A later louder chorus must not replace a useful intro.
    return min(plans, key=lambda p: (-p['bars'], p['reference_evidence'] != 'structural',
                                    p['incoming_reference'], -p['strength']))


def mix_phrase(out_parts, in_parts, plan, sr):
    import numpy as np
    period, lead, bars = plan['period'], plan['lead'], plan['bars']
    if bars not in ALLOWED_BARS or plan['lead_bars'] not in ALLOWED_BARS or plan['loop_bars'] not in ALLOWED_BARS:
        raise ValueError('Phrase lengths must be 4, 8 or 16 bars')
    total = round(plan['duration'] * sr)
    incoming_start = round(plan['incoming_start'] * sr)
    lead_sample = round(lead * sr)
    unit = round(plan['loop_bars'] * 4 * period * sr)
    first = round(plan['out_cue'] * sr)
    stop = first + round(bars * 4 * period * sr)
    needed = total - incoming_start
    if (incoming_start < 0 or any(a.shape[1] < stop for a in out_parts.values())
            or any(a.shape[1] < needed for a in in_parts.values())):
        raise ValueError('Prepared coverage does not fit the phrase plan')
    t = np.arange(total) / sr - lead
    overlap = bars * 4 * period
    mix = np.zeros((2, total), dtype=np.float32)
    prefix = in_parts['vocals'][:, :round(plan['source_exchange'] * sr)]
    # Short windows withhold outgoing vocals instead of shrinking the established
    # four-bar vocal gap to fit. No outgoing vocal is ever looped.
    intro_vocals = bool(prefix.size and np.sqrt(np.mean(prefix**2)) > 1e-3) or bars < 16
    for stem in out_parts:
        outgoing = np.zeros((2, total), dtype=np.float32)
        if stem != 'vocals':
            # Whole four-bar instrumental loops before the final natural exit.
            outgoing[:, :lead_sample] = out_parts[stem][:, first + np.arange(lead_sample) % unit]
            # A very short seam ramp preserves sample/beat positions.
        length = stop - first
        outgoing[:, lead_sample:lead_sample+length] = out_parts[stem][:, first:stop]
        if stem != 'vocals':
            edge = max(1, round(.005 * sr))
            for join in sorted(set(range(unit, lead_sample + 1, unit)) | {lead_sample}):
                outgoing[:, join-edge:join] *= np.linspace(1, 0, edge)
                outgoing[:, join:join+edge] *= np.linspace(0, 1, edge)
        if stem == 'vocals':
            # Sixteen bars keeps the two-bar fade, four-bar gap and two-bar
            # incoming fade. Shorter windows use incoming vocals only.
            fade = overlap / 8
            out_env = np.clip((fade - t) / fade, 0, 1)
            out_env *= np.clip(t / .1, 0, 1)
            in_env = np.clip((t - 3 * fade) / fade, 0, 1)
            if intro_vocals:
                out_env[:] = 0; in_env[:] = 1
        else:
            out_env = np.clip((overlap - t) / (overlap / 2), 0, 1)
            in_env = np.clip((np.arange(total) / sr - plan['incoming_start']) / (overlap / 2), 0, 1)
        mix += outgoing * out_env
        ramp = min(round(.1 * sr), needed)
        in_env[incoming_start:incoming_start+ramp] *= np.linspace(0, 1, ramp)
        mix[:, incoming_start:] += in_parts[stem][:, :needed] * in_env[incoming_start:]
    edge = max(1, round(.03 * sr))
    mix[:, :edge] *= np.linspace(0, 1, edge); mix[:, -edge:] *= np.linspace(1, 0, edge)
    peak = float(np.max(np.abs(mix)))
    if not np.isfinite(mix).all() or peak < 1e-8:
        raise ValueError('The phrase preview contains no usable audio')
    mix *= min(1., .98 / peak)
    return mix, intro_vocals


def phrase_timeline(plan, intro_vocals):
    lead, period, bars = plan['lead'], plan['period'], plan['bars']
    end = lead + bars * 4 * period
    reference = end + plan['bar_shift'] * 4 * period
    source = round(plan.get('incoming_reference_source_seconds', plan['incoming_reference']))
    stamp = f'{source // 60}:{source % 60:02d}'
    events = [{'at': 0., 'label': f"{plan['lead_bars']}-bar instrumental lead; outgoing four-bar loop"},
              {'at': plan['incoming_start'], 'label': 'Incoming opening enters; source start preserved'},
              {'at': lead, 'label': f'{bars}-bar phrase exchange starts'},
              {'at': reference, 'label': f'Incoming reference at source {stamp}; inferred from opening' if plan['reference_evidence'] == 'counted_opening' else f'Incoming reference at source {stamp}; supported by a musical change'},
              {'at': end, 'label': 'Exchange complete; incoming alone at matched tempo'},
              {'at': plan['incoming_start'] + bars * 2 * period, 'label': 'Incoming instruments reach full mix level'},
              {'at': lead + bars * 2 * period, 'label': 'Outgoing instruments begin fading'}]
    if plan['bar_shift']:
        events[0]['label'] += '; manual bar shift overrides phrase alignment'
    if intro_vocals:
        events[1]['label'] += '; outgoing vocals withheld'
    else:
        fade = bars * 4 * period / 8
        events.extend([{'at': lead + fade, 'label': 'Outgoing vocal fade complete'},
                       {'at': lead + 3 * fade, 'label': 'Incoming vocal fade starts'},
                       {'at': lead + 4 * fade, 'label': 'Incoming vocal fade complete'}])
    merged = []
    for event in sorted(events, key=lambda e: e['at']):
        if merged and abs(event['at'] - merged[-1]['at']) < 1e-6:
            merged[-1]['label'] += '; ' + event['label']
        else:
            merged.append(event)
    return {'duration': plan['duration'], 'events': merged}
