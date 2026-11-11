#!/usr/bin/env python3
"""Render listening-only source-zero previews for the opening-grid audit."""
import argparse
from array import array
import json
import math
from pathlib import Path
import re
import subprocess
import sys

SR = 44100
CLICK_GAIN = 0.72
DOWNBEAT_GAIN = 0.92
MUSIC_GAIN = 0.35


def tone(frequency, duration, amplitude):
    count = round(SR * duration)
    return array('f', (amplitude * math.sin(2 * math.pi * frequency * i / SR)
                       * math.sin(math.pi * i / (count - 1)) ** 2
                       for i in range(count)))


def add(samples, start_frame, mono):
    for i, value in enumerate(mono):
        j = (start_frame + i) * 2
        if j + 1 >= len(samples):
            break
        samples[j] += value
        samples[j + 1] += value


def source_path(audio_path):
    prefix = '/compilations/'
    if not audio_path.startswith(prefix):
        raise ValueError(f'Unexpected source path: {audio_path}')
    path = Path('/media/satadrive/Compilations') / audio_path[len(prefix):]
    if not path.is_file():
        raise FileNotFoundError(path)
    return path


def render(record, track, output):
    cues = sorted((record['proposed_incoming'] if record['status'] == 'candidate'
                   else record['saved_incoming']), key=lambda cue: cue['sourceSeconds'])
    bpm = cues[0]['bpm']
    origin = cues[0]['phraseStartSeconds']
    beat = 60 / bpm
    end = max(cue['sourceSeconds'] for cue in cues) + 8 * beat
    audio = subprocess.run([
        'ffmpeg', '-v', 'error', '-nostdin', '-ss', '0', '-t', str(end),
        '-i', str(source_path(track['audio_path'])), '-ar', str(SR), '-ac', '2',
        '-f', 'f32le', 'pipe:1'], check=True, stdout=subprocess.PIPE).stdout
    samples = array('f')
    samples.frombytes(audio)
    if sys.byteorder == 'big':
        samples.byteswap()
    frames = len(samples) // 2
    duration = frames / SR
    last_cue = max(cue['sourceSeconds'] for cue in cues)
    if duration < last_cue + beat:
        raise ValueError(f'{record["artist"]}: source ends before cue context')
    for i in range(len(samples)):
        samples[i] *= MUSIC_GAIN

    cue_frames = {round((cue['sourceSeconds'] - origin) / beat): cue
                  for cue in cues}
    click = tone(1650, .018, CLICK_GAIN)
    downbeat = tone(2250, .022, DOWNBEAT_GAIN)
    marker_tones = {
        8: tone(880, .14, DOWNBEAT_GAIN),
        16: tone(660, .14, DOWNBEAT_GAIN),
        None: tone(1180, .12, DOWNBEAT_GAIN),
    }
    first = max(0, math.ceil(-origin / beat))
    last = math.floor((duration - origin) / beat)
    for n in range(first, last + 1):
        at = origin + n * beat
        if at < 0:
            continue
        cue = cue_frames.get(n)
        bar_one = n % 4 == 0
        pulse = (marker_tones.get(cue.get('phraseBars'), marker_tones[None])
                 if cue else downbeat if bar_one else click)
        add(samples, round(at * SR), pulse)

    peak = max(abs(value) for value in samples)
    scale = min(1.0, .95 / peak) if peak else 1.0
    if scale < 1:
        for i in range(len(samples)):
            samples[i] *= scale
    subprocess.run([
        'ffmpeg', '-v', 'error', '-nostdin', '-y', '-f', 'f32le', '-ar', str(SR),
        '-ac', '2', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', '160k',
        str(output)], input=samples.tobytes(), check=True)
    return {
        'id': record['id'], 'artist': record['artist'], 'title': record['title'],
        'kind': record['status'], 'method': record.get('method'),
        'source_library_path': track['audio_path'], 'bpm': bpm,
        'grid_origin_seconds': origin, 'duration_seconds': duration,
        'music_gain': MUSIC_GAIN, 'click_gain': CLICK_GAIN,
        'downbeat_gain': DOWNBEAT_GAIN, 'peak_limiter_scale': scale,
        'markers': [{
            'seconds': cue['sourceSeconds'],
            'bar': cue.get('phraseBars', cue.get('barNumber')),
            'label': (f'{cue["phraseBars"]}-bar cue' if cue.get('phraseBars')
                      else f'saved cue at bar {cue.get("barNumber")}'),
        } for cue in cues],
        'audio': str(output),
    }


def main():
    research = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-map', type=Path,
                        default=research / 'beat-this-opening-grid-audition-sources-2026-11-05.json')
    parser.add_argument('--audio-dir', type=Path, required=True)
    parser.add_argument('--output-index', type=Path, required=True)
    args = parser.parse_args()

    audit = json.loads((research / 'beat-this-opening-grid-routing-audit.json').read_text())
    tracks = {item['id']: item for item in json.loads(args.source_map.read_text())}
    records = [item for item in audit['records'] if item['status'] in ('candidate', 'control')]
    records.sort(key=lambda item: (item['status'] != 'candidate', item['artist'].casefold()))
    args.audio_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for record in records:
        track = tracks[record['id']]
        slug = re.sub(r'[^a-z0-9]+', '-', f"{record['artist']}-{record['title']}".casefold()).strip('-')
        output = args.audio_dir / f'{slug}-{record["id"]}.mp3'
        result = render(record, track, output)
        results.append(result)
        print(f'{record["artist"]} — {record["title"]}: {result["duration_seconds"]:.1f}s → {output}')

    assert sum(item['kind'] == 'candidate' for item in results) == 14
    assert sum(item['kind'] == 'control' for item in results) == 5
    args.output_index.parent.mkdir(parents=True, exist_ok=True)
    args.output_index.write_text(json.dumps({
        'source_audit': str(research / 'beat-this-opening-grid-routing-audit.json'),
        'method': ('Natural source opening, music at 0.35 gain, audible per-beat clicks '
                   'with bar accents; 8-bar and 16-bar cue markers use distinct tones. '
                   'No time stretching or other audio edits.'),
        'results': results,
    }, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
