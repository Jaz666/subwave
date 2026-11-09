"""Offline complete-handoff auditions through the production preview renderer.

Usage: python subbeats_handoff_auditions.py INPUT.json STEMS_ROOT MUSIC_ROOT OUTPUT_DIR
INPUT supplies selected prepared jobs, relative original paths and named pairs.
All inputs are read-only. Only OUTPUT_DIR and temporary copies are written.
"""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

from subbeats_cue_matching import plan_live_pair
from subbeats_preview import render_preview
from subbeats_prepare import STEM_SR, decode


def main():
    input_file, stems, music, output = map(Path, sys.argv[1:])
    data = json.loads(input_file.read_text())
    output.mkdir(parents=True, exist_ok=True)
    state = output / 'state'
    (state / 'subbeats').mkdir(parents=True, exist_ok=True)
    cache_id = 'isolated-handoff-audition-20261109'
    (state / 'subbeats' / '.cache-id').write_text(cache_id)
    jobs = {job['id']: job for job in data['jobs']}
    result = dict(pairs=[], stationChanged=False, loudnessGainsDb=[0, 0], listening='pending')
    for number, pair in enumerate(data['pairs'], 1):
        outgoing, incoming = pair['trackIds']
        print(f"{number}/{len(data['pairs'])}: {pair['label']}", flush=True)
        assessment = plan_live_pair(list(jobs.values()), outgoing, incoming, pair['mixStyle'])
        row = dict(number=number, label=pair['label'], assessment=assessment)
        if not assessment['plans']:
            result['pairs'].append(row)
            (output / 'results.json').write_text(json.dumps(result, indent=2) + '\n')
            print('  No complete handoff fits:', assessment['reason'], flush=True)
            continue
        chosen = assessment['plans'][0]
        selected = [jobs[outgoing], jobs[incoming]]
        originals = [music / data['sourcePaths'][track_id] for track_id in (outgoing, incoming)]
        def fetch_source(url, **_kwargs):
            source_index = int(url.rsplit('/', 1)[-1])
            with tempfile.NamedTemporaryFile(suffix=originals[source_index].suffix, dir=output, delete=False) as temp:
                target = Path(temp.name)
            shutil.copyfile(originals[source_index], target)
            return target, True
        request = dict(state_dir=str(state), cache_id=cache_id, stems_root=str(stems), track_ids=[outgoing, incoming],
            out_key=selected[0]['bundleKey'], in_key=selected[1]['bundleKey'], method='cue-points', auto_plan=False,
            mix_style=pair['mixStyle'], cue_keys=[job['cuePoints']['artifactKey'] for job in selected],
            coverage_keys=[job['cueCoverage']['artifactKey'] for job in selected],
            cue_indices=[chosen['outgoingCueIndex'], chosen['incomingCueIndex']],
            lyric_evidence=[job.get('lyricEvidence') for job in selected], source_urls=['https://audition.invalid/0', 'https://audition.invalid/1'],
            handoff=dict(version=1, evidenceFingerprint='0' * 64, candidate=chosen))
        rendered = render_preview(request, fetch_source=fetch_source)
        clip, sample_rate = sf.read(rendered['subbeats_preview'], dtype='float32', always_2d=True)
        if sample_rate != STEM_SR:
            raise ValueError('Unexpected handoff sample rate.')
        timing = rendered['subbeats_timeline']['handoff']['timing']
        source_out, source_in = [decode(path, STEM_SR, 2).T for path in originals]
        first, resume = timing['outgoingStartSample'], timing['incomingResumeSample']
        guard = round(.3 * STEM_SR)
        # Report the exact source match before any audition-only level change.
        row['sourceGuardMaxError'] = [float(np.max(np.abs(clip[:guard] - source_out[first:first + guard]))),
                                      float(np.max(np.abs(clip[-guard:] - source_in[resume - guard:resume])))]
        lead = source_out[max(0, first - 4 * STEM_SR):first]
        follow = source_in[resume:resume + 8 * STEM_SR]
        audio = np.concatenate([lead, clip, follow])
        gain = min(1., .98 / max(1e-8, float(np.max(np.abs(audio)))))
        audio *= gain
        # Only the outer audition edges fade. Both internal joins are untouched.
        edge = round(.02 * STEM_SR)
        audio[:edge] *= np.linspace(0, 1, edge)[:, None]
        audio[-edge:] *= np.linspace(1, 0, edge)[:, None]
        filename = f'{number:02}-complete-handoff.mp3'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(STEM_SR), '-ac', '2',
                        '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', '192k', str(output / filename)],
                       input=audio.astype('<f4').tobytes(), check=True)
        row.update(file=filename, timeline=rendered['subbeats_timeline'],
                   clipStartsSeconds=len(lead) / STEM_SR, clipEndsSeconds=(len(lead) + len(clip)) / STEM_SR,
                   durationSeconds=len(audio) / STEM_SR, auditionPeakGain=gain)
        result['pairs'].append(row)
        (output / 'results.json').write_text(json.dumps(result, indent=2) + '\n')
        print('  Saved', filename, '; original seam errors:', row['sourceGuardMaxError'], flush=True)


if __name__ == '__main__':
    main()
