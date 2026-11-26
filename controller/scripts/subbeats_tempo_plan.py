"""Offline-only Stem Beats audition tempo policy, version 1.

This deliberately does not change live pick-time admission. Keep behavior in
sync with controller/src/music/subbeats-tempo-plan.ts and its shared fixtures.
"""
import math

PLAN_VERSION = 1
LEGACY_DIRECTIONAL_LIMIT = 0.08
SPLIT_PAIR_GAP_LIMIT = 0.12
SPLIT_DECK_ADJUSTMENT_LIMIT = 0.06


def plan_stem_beats_tempo(outgoing_bpm, incoming_bpm):
    if (not all(isinstance(value, (int, float)) and math.isfinite(value)
                and value > 0 for value in (outgoing_bpm, incoming_bpm))):
        return None

    ratio = outgoing_bpm / incoming_bpm
    symmetric_gap = max(ratio, 1 / ratio) - 1
    if abs(ratio - 1) <= LEGACY_DIRECTIONAL_LIMIT:
        return {
            'planVersion': PLAN_VERSION,
            'mode': 'incoming-only',
            'outgoingBpm': outgoing_bpm,
            'incomingBpm': incoming_bpm,
            'commonBpm': outgoing_bpm,
            'outgoingRate': 1.0,
            'incomingRate': ratio,
            'symmetricGap': symmetric_gap,
        }

    if symmetric_gap > SPLIT_PAIR_GAP_LIMIT + math.ulp(1.0):
        return None

    common_bpm = math.sqrt(outgoing_bpm * incoming_bpm)
    outgoing_rate = common_bpm / outgoing_bpm
    incoming_rate = common_bpm / incoming_bpm
    if max(abs(outgoing_rate - 1), abs(incoming_rate - 1)) > SPLIT_DECK_ADJUSTMENT_LIMIT + math.ulp(1.0):
        return None

    return {
        'planVersion': PLAN_VERSION,
        'mode': 'split',
        'outgoingBpm': outgoing_bpm,
        'incomingBpm': incoming_bpm,
        'commonBpm': common_bpm,
        'outgoingRate': outgoing_rate,
        'incomingRate': incoming_rate,
        'symmetricGap': symmetric_gap,
    }


def build_stem_beats_tempo_timeline(plan, timeline_input):
    """Build an offline timing proposal with source positions and clip frames.

    The outgoing rate ramps linearly over ``ramp_bars`` before its cue. Rate is
    constant through the handoff and outgoing tail. The incoming rate returns
    linearly to native only once the outgoing source has ended.
    """
    outgoing_cue_seconds = timeline_input.get('outgoingCueSeconds')
    handover_seconds = timeline_input.get('handoverSeconds')
    outgoing_duration_seconds = timeline_input.get('outgoingDurationSeconds')
    incoming_cue_seconds = timeline_input.get('incomingCueSeconds')
    incoming_duration_seconds = timeline_input.get('incomingDurationSeconds')
    ramp_bars = timeline_input.get('rampBars', 8)
    release_beats = timeline_input.get('releaseBeats', 64)
    native_tail_bars = timeline_input.get('nativeTailBars', 4)
    seam_guard_seconds = timeline_input.get('seamGuardSeconds', 0.3)
    sample_rate = timeline_input.get('sampleRate', 44100)
    values = (outgoing_cue_seconds, handover_seconds, outgoing_duration_seconds,
              incoming_cue_seconds, incoming_duration_seconds, ramp_bars,
              release_beats, native_tail_bars, seam_guard_seconds, sample_rate)
    if (not all(isinstance(value, (int, float)) and math.isfinite(value) for value in values)
            or outgoing_cue_seconds < 0 or handover_seconds < outgoing_cue_seconds
            or handover_seconds > outgoing_duration_seconds or incoming_cue_seconds < 0
            or incoming_cue_seconds >= incoming_duration_seconds
            or outgoing_duration_seconds <= 0 or incoming_duration_seconds <= 0
            or ramp_bars < 0 or release_beats < 0 or native_tail_bars <= 0
            or seam_guard_seconds < 0 or sample_rate <= 0):
        return None

    ramp_start_source = None
    ramp_end_output = None
    if plan['mode'] == 'split' and plan['outgoingRate'] != 1 and ramp_bars > 0:
        ramp_source_seconds = ramp_bars * 4 * 60 / plan['outgoingBpm']
        ramp_output_seconds = ramp_bars * 4 * 60 / (
            plan['outgoingBpm'] * (1 + plan['outgoingRate']) / 2)
        ramp_start_source = outgoing_cue_seconds - ramp_source_seconds
        if ramp_start_source < 0:
            return None
        ramp_end_output = ramp_start_source + ramp_output_seconds
        handover_output = ramp_end_output + (
            handover_seconds - outgoing_cue_seconds) / plan['outgoingRate']
        outgoing_end_output = ramp_end_output + (
            outgoing_duration_seconds - outgoing_cue_seconds) / plan['outgoingRate']
        incoming_entry = handover_output - incoming_cue_seconds / plan['incomingRate']
    else:
        handover_output = handover_seconds
        outgoing_end_output = outgoing_duration_seconds
        incoming_entry = handover_output - incoming_cue_seconds / plan['incomingRate']

    release_duration = (0 if plan['incomingRate'] == 1 or release_beats == 0 else
                        release_beats * 60 / (plan['incomingBpm'] * (plan['incomingRate'] + 1) / 2))
    release_start_output = outgoing_end_output
    release_end_output = release_start_output + release_duration
    incoming_resume_source = ((release_start_output - incoming_entry) * plan['incomingRate']
                              + release_duration * (plan['incomingRate'] + 1) / 2)
    native_tail_seconds = native_tail_bars * 4 * 60 / plan['incomingBpm']
    incoming_end_source = incoming_resume_source + native_tail_seconds
    if incoming_entry < 0 or incoming_end_source > incoming_duration_seconds:
        return None

    outgoing_start_output = ramp_start_source if ramp_start_source is not None else outgoing_cue_seconds
    clip_start_seconds = max(0, min(outgoing_start_output, incoming_entry) - seam_guard_seconds)
    clip_end_seconds = release_end_output + native_tail_seconds
    frame = lambda seconds: round((seconds - clip_start_seconds) * sample_rate)
    timeline = {
        'planVersion': PLAN_VERSION,
        'mode': plan['mode'],
        'sampleRate': sample_rate,
        'clipStartSeconds': clip_start_seconds,
        'clipFrames': round((clip_end_seconds - clip_start_seconds) * sample_rate),
        'incomingEntrySeconds': incoming_entry,
        'handoverOutputSeconds': handover_output,
        'outgoingEndOutputSeconds': outgoing_end_output,
        'outgoingCueSourceSeconds': outgoing_cue_seconds,
        'outgoingRampStartSourceSeconds': ramp_start_source,
        'outgoingRampEndOutputSeconds': ramp_end_output,
        'incomingReleaseEndOutputSeconds': release_end_output,
        'incomingEntryFrame': frame(incoming_entry),
        'handoverFrame': frame(handover_output),
        'outgoingEndFrame': frame(outgoing_end_output),
        'rampStartFrame': frame(ramp_start_source) if ramp_start_source is not None else None,
        'rampEndFrame': frame(ramp_end_output) if ramp_end_output is not None else None,
        'releaseStartFrame': frame(release_start_output),
        'releaseEndFrame': frame(release_end_output),
        'outgoingEndSourceSeconds': outgoing_duration_seconds,
        'incomingResumeSourceSeconds': incoming_resume_source,
        'incomingEndSourceSeconds': incoming_end_source,
    }
    if timeline['clipFrames'] <= 0 or timeline['clipFrames'] > 120 * sample_rate:
        return None
    return timeline


def stem_beats_source_seconds_at_output(plan, timeline, side, output_seconds):
    """Map output time to original source time; None means incoming has not entered."""
    if (side not in ('outgoing', 'incoming') or not isinstance(output_seconds, (int, float))
            or not math.isfinite(output_seconds) or output_seconds < 0):
        return None
    if side == 'outgoing':
        start = timeline['outgoingRampStartSourceSeconds']
        end = timeline['outgoingRampEndOutputSeconds']
        if start is None or end is None:
            return output_seconds
        if output_seconds <= start:
            return output_seconds
        if output_seconds <= end:
            elapsed = output_seconds - start
            duration = end - start
            return start + elapsed + (plan['outgoingRate'] - 1) * elapsed * elapsed / (2 * duration)
        return timeline['outgoingCueSourceSeconds'] + (output_seconds - end) * plan['outgoingRate']

    if output_seconds < timeline['incomingEntrySeconds']:
        return None
    release_start = timeline['outgoingEndOutputSeconds']
    release_end = timeline['incomingReleaseEndOutputSeconds']
    if output_seconds <= release_start:
        return (output_seconds - timeline['incomingEntrySeconds']) * plan['incomingRate']
    before_release = (release_start - timeline['incomingEntrySeconds']) * plan['incomingRate']
    release_duration = release_end - release_start
    if output_seconds <= release_end and release_duration > 0:
        elapsed = output_seconds - release_start
        return (before_release + plan['incomingRate'] * elapsed
                + (1 - plan['incomingRate']) * elapsed * elapsed / (2 * release_duration))
    return timeline['incomingResumeSourceSeconds'] + output_seconds - release_end
