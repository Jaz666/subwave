"""Render paired style auditions using the actual cue-preview mixer.

Usage in the analyzer environment (controller/scripts and this directory on
PYTHONPATH): python subbeats_style_auditions.py INPUT.json STEMS_ROOT OUTPUT_DIR
Reads cached stems; writes only OUTPUT_DIR. No separation or network requests.
"""
import json
from pathlib import Path
import sys

import librosa
import numpy as np

from subbeats_cue_preview import MIX_STYLE_LABELS, mix_passages
from subbeats_preview import STEM_SR, load_region
from subbeats_harmonic_auditions import encode, key_probe, load


def main():
    source, stems, destination = map(Path, sys.argv[1:])
    result = json.loads(source.read_text())
    destination.mkdir(parents=True, exist_ok=True)
    for pair in result['pairs']:
        print(f"{pair['number']}/{len(result['pairs'])}: {pair['outgoing']} → {pair['incoming']}", flush=True)
        plan = dict(pair['plan'])
        a, b = load(pair['tracks'][0], 'exit', stems), load(pair['tracks'][1], 'head', stems)
        first = max(plan['first'], a[2])
        if first >= plan['out_end'] or b[2] > 0 or b[3] < plan['incoming_end']:
            raise ValueError('Insufficient cached coverage for this extract')
        pair['extractStartSeconds'] = first
        pair['incomingPrefixOmittedSeconds'] = max(0, first-plan['entry'])*plan['rate']
        plan['first'] = first
        out, _ = load_region(a[0], a[1], 'exit', start_seconds=first,
                             end_seconds=plan['out_end'], limit_seconds=130, require_tempo=False)
        inc, _ = load_region(b[0], b[1], 'head', start_seconds=0,
                             end_seconds=plan['incoming_end'], limit_seconds=130, require_tempo=False)
        out_start = round((max(first, plan['entry'])-first)*STEM_SR)
        in_end = (plan['out_end']-plan['entry'])*plan['rate']
        pair['sectionKeys'] = [key_probe({s:p[:,out_start:] for s,p in out.items()}, max(first,plan['entry']), plan['out_end']),
                               key_probe({s:p[:,:round(in_end*STEM_SR)] for s,p in inc.items()}, 0, in_end)]
        if plan['rate'] != 1:
            inc = {s:librosa.effects.time_stretch(p, rate=plan['rate']) for s,p in inc.items()}
        rendered = [(style, *mix_passages(out, inc, plan, style, normalize=False)) for style in pair['styles']]
        gain = min(1., .98/max(float(np.max(np.abs(audio))) for _,audio,_ in rendered))
        pair['commonPeakGain'] = gain
        pair['loudnessGainsDb'] = [0,0]
        pair['renders'] = []
        for style, audio, timeline in rendered:
            filename = f"{pair['number']:02}-{style}.mp3"
            encode(destination/filename, audio*gain)
            pair['renders'].append(dict(style=style, label=MIX_STYLE_LABELS[style], file=filename, timeline=timeline))
        (destination/'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
        print('  Saved:', ', '.join(pair['styles']), '; section estimates:', pair['sectionKeys'], flush=True)


if __name__ == '__main__':
    main()
