"""Offline A/B extracts from cached stems; no station, library or cache writes.

Run with the analyzer Python environment and controller/scripts on PYTHONPATH:
  python subbeats_harmonic_auditions.py INPUT.json STEMS_ROOT OUTPUT_DIR
The key estimates are diagnostic; listening determines harmonic suitability.
"""
import json
from pathlib import Path
import subprocess
import sys

import librosa
import numpy as np

from analyze_worker import estimate_key
from subbeats_cache import cached_entry
from subbeats_preview import STEM_SR, STEMS, load_region


def load(track, role, stems):
    folder = stems / track['id'] / 'subbeats' / 'v1' / track['coverageKey']
    manifest = json.loads((folder / 'manifest.json').read_text())
    record = cached_entry(folder, manifest['identity'])
    if record is None:
        raise ValueError('Cached stem integrity check failed')
    region = next(r for r in record['metadata']['stem_regions'] if r['name'] == role)
    return folder, record, region['start_sample'] / STEM_SR, region['end_sample'] / STEM_SR


def key_probe(parts, start, end):
    # Same chroma/key estimator as library analysis, applied to cached pitched
    # stems in the actual overlap. Score separation is not a probability.
    harmonic = sum(parts[s] for s in ('bass', 'other', 'vocals')).mean(axis=0)
    if not np.isfinite(harmonic).all() or np.sqrt(np.mean(harmonic**2)) < 1e-5:
        return dict(startSeconds=start, endSeconds=end, key=None, separation=None)
    mono = librosa.resample(harmonic, orig_sr=STEM_SR, target_sr=22050)
    chroma = librosa.feature.chroma_cqt(y=mono, sr=22050)
    key, separation = estimate_key(np.mean(chroma, axis=1))
    return dict(startSeconds=start, endSeconds=end, key=key, separation=float(separation))


def render(outgoing, incoming, plan, short):
    first, end = plan['first'], plan['end']
    total = round((end - first) * STEM_SR)
    begin = round((plan['entry'] - first) * STEM_SR)
    # An extract can begin after the source prefix when exit coverage starts
    # later. Both A/B variants use exactly the same crop and playback timing.
    in_offset = max(0, -begin)
    begin = max(0, begin)
    t = first + np.arange(total) / STEM_SR
    arrival = plan['handover']
    cross_start = max(plan['entry'], arrival - 4 * plan['period'])
    rhythm = np.clip((t - cross_start) / (arrival - cross_start), 0, 1)
    exchange = np.clip((t - (arrival - 2 * plan['period'])) / (4 * plan['period']), 0, 1)
    audio = np.zeros((2, total), dtype=np.float32)
    for stem in STEMS:
        out = outgoing[stem]
        inc = incoming[stem][:, in_offset:]
        n, m = min(total, out.shape[1]), min(total - begin, inc.shape[1])
        out_gain = np.ones(n)
        if stem in ('other', 'vocals'):
            out_gain *= np.clip((out.shape[1] - np.arange(n)) / (.03 * STEM_SR), 0, 1)
        in_gain = rhythm[begin:begin + m] if stem in ('drums', 'bass') else np.ones(m)
        if short and stem in ('bass', 'other'):
            out_gain *= 1 - exchange[:n]
            in_gain = exchange[begin:begin + m]
        audio[:, :n] += out[:, :n] * out_gain
        audio[:, begin:begin + m] += inc[:, :m] * in_gain
    edge = min(round(.03 * STEM_SR), total // 2)
    audio[:, :edge] *= np.linspace(0, 1, edge)
    audio[:, -edge:] *= np.linspace(1, 0, edge)
    if not np.isfinite(audio).all() or np.max(np.abs(audio)) < 1e-8:
        raise ValueError('Invalid audition audio')
    return audio


def encode(path, audio):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(STEM_SR), '-ac', '2',
                    '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', '192k', str(path)],
                   input=audio.T.astype('<f4').tobytes(), check=True)


def main():
    source, stems, destination = map(Path, sys.argv[1:])
    result = json.loads(source.read_text())
    destination.mkdir(parents=True, exist_ok=True)
    for pair in result['pairs']:
        print(f"{pair['number']}/6: {pair['outgoing']} → {pair['incoming']}", flush=True)
        plan = dict(pair['plan'])
        a = load(pair['tracks'][0], 'exit', stems)
        b = load(pair['tracks'][1], 'head', stems)
        first = max(plan['first'], a[2])
        if first >= plan['out_end'] or b[2] > 0 or b[3] < plan['incoming_end']:
            raise ValueError('Insufficient cached coverage for this extract')
        pair['extractStartSeconds'] = first
        pair['originalPreviewStartSeconds'] = plan['first']
        pair['incomingPrefixOmittedSeconds'] = max(0, first - plan['entry']) * plan['rate']
        plan['first'] = first
        out, _ = load_region(a[0], a[1], 'exit', start_seconds=first,
                             end_seconds=plan['out_end'], limit_seconds=130, require_tempo=False)
        inc, _ = load_region(b[0], b[1], 'head', start_seconds=0,
                             end_seconds=plan['incoming_end'], limit_seconds=130, require_tempo=False)
        overlap_start = max(first, plan['entry'])
        out_start = round((overlap_start - first) * STEM_SR)
        in_end = (plan['out_end'] - plan['entry']) * plan['rate']
        pair['sectionKeys'] = [key_probe({s:out[s][:, out_start:] for s in STEMS}, overlap_start, plan['out_end']),
                               key_probe({s:inc[s][:, :round(in_end * STEM_SR)] for s in STEMS}, 0, in_end)]
        if plan['rate'] != 1:
            inc = {s:librosa.effects.time_stretch(part, rate=plan['rate']) for s,part in inc.items()}
        original, short = render(out, inc, plan, False), render(out, inc, plan, True)
        gain = min(1., .98 / max(np.max(np.abs(original)), np.max(np.abs(short))))
        prefix = f"{pair['number']:02}"
        encode(destination / f'{prefix}-A-current.mp3', original * gain)
        encode(destination / f'{prefix}-B-short-handover.mp3', short * gain)
        pair['comparison'] = dict(current=f'{prefix}-A-current.mp3', short=f'{prefix}-B-short-handover.mp3',
            commonPeakGain=float(gain), loudnessGainsDb=[0,0],
            durationSeconds=original.shape[1]/STEM_SR,
            arrivalSeconds=plan['handover']-first,
            outgoingEndSeconds=plan['out_end']-first,
            exchangeSeconds=4*plan['period'],
            vocals='Both vocal stems retain the current envelope; no pitch shift.',
            harmonicReview='pending')
        (destination / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
        print('  Saved A/B; overlap section keys:', pair['sectionKeys'], flush=True)


if __name__ == '__main__':
    main()
