"""Render raw model timestamps as diagnostic clicks, without repairing the grid.

Run after compare_beat_this.py, with the same research-directory argument.
"""
import json
from pathlib import Path
import subprocess
import sys

import numpy as np


def main():
    root = Path(sys.argv[1])
    audio_dir = root / 'audio'
    audio_dir.mkdir(exist_ok=True)
    comparison = json.loads((root / 'comparison.json').read_text())
    for row in comparison['tracks']:
        duration = row['opening'].get('scopeEndSeconds', 128)
        sr = 44100
        raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-nostdin', '-i', row['sourcePath'], '-t', str(duration), '-f', 'f32le', '-ac', '2', '-ar', str(sr), 'pipe:1'])
        music = np.frombuffer(raw, dtype='<f4').reshape(-1, 2).copy() * .35
        arrays = np.load(root / f'{row["name"]}-{row["model"]}.npz', allow_pickle=False)
        for t in arrays['beats']:
            offset = round(float(t) * sr)
            if offset >= len(music):
                break
            accent = bool(np.any(arrays['downbeats'] == t))
            length = min(round(.018 * sr), len(music) - offset)
            pulse = (.92 if accent else .72) * np.sin(2 * np.pi * (2100 if accent else 1400) * np.arange(length) / sr) * np.hanning(length)
            music[offset:offset + length] += pulse[:, None]
        peak = float(np.max(np.abs(music)))
        if peak > .95:
            music *= .95 / peak
        target = audio_dir / f'{row["name"]}-{row["model"]}.mp3'
        subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', '2', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', '160k', str(target)], input=music.astype('<f4').tobytes(), check=True)
        print(target)
    (audio_dir / 'README.txt').write_text('Original source time; no stretching, looping or grid repair.\nRaw model beats; louder/high clicks indicate model downbeats, not verified bars.\nMusic gain .35, ordinary click .72, downbeat click .92; common peak limit .95.\nRozalla/Urban/Gusto 32s; Afro-Left 75s; Cübik 128s.\n')


if __name__ == '__main__':
    main()
