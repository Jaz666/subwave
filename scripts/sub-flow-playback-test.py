#!/usr/bin/env python3
"""Render the production Flow handoff and window gates with local audio only.

LIQUIDSOAP_BIN and LIQUIDSOAP_STDLIB select the station's pinned runtime.
No running station, Icecast output or live state directory is used.
"""
import array
import math
import os
from pathlib import Path
import random
import re
import subprocess
import tempfile
import wave

ROOT = Path(__file__).resolve().parents[1]
RATE = 44100


def write_wav(path, samples):
    stereo = array.array('h', (value for sample in samples for value in (sample, sample)))
    with wave.open(str(path), 'wb') as output:
        output.setparams((2, 2, RATE, 0, 'NONE', ''))
        output.writeframes(stereo.tobytes())


def main(directory):
    rng = random.Random(41)
    lengths = [12 * RATE + 123, 12 * RATE + 321, 12 * RATE + 155]
    count = int(os.environ.get('SUB_FLOW_MEMBERS', '2'))
    lengths = lengths[:count]
    if os.environ.get('SUB_FLOW_OVERLAP'):
        lengths = [6 * RATE + i * 111 for i in range(count)]
    if os.environ.get('SUB_FLOW_SHORT'):
        lengths[0] = 2 * RATE + 123
    members = [array.array('h', (rng.randrange(-2000, 2001) for _ in range(length))) for length in lengths]
    expected = sum(members, array.array('h'))
    write_wav(directory / 'flow.wav', expected)
    for name in ['before', 'after']:
        write_wav(directory / f'{name}.wav', [rng.randrange(-2000, 2001) for _ in range(4 * RATE)])
    write_wav(directory / 'emergency.wav', [0] * RATE)
    for frequency in [1200, 1300, 1800, 1900]:
        seconds = 8 if frequency == 1900 else 1
        write_wav(directory / f'{frequency}.wav', [int(3000 * math.sin(2 * math.pi * frequency * i / RATE)) for i in range(seconds * RATE)])
    for name, value in [('auto.m3u', ''), ('jingles.m3u', ''), ('liquidsoap_jingle_ratio.txt', '0'), ('liquidsoap_crossfade.txt', '1')]:
        (directory / name).write_text(value)
    if os.environ.get('SUB_FLOW_ROTATE'):
        (directory / 'jingles.m3u').write_text(str(directory / '1800.wav'))
        (directory / 'liquidsoap_jingle_ratio.txt').write_text('1')
    fields = {'title': 'one', 'artist': 'Test', 'album': 'Test', 'subsonic_id': 'one',
              'subwave_flow': 'test-occurrence', 'subwave_flow_count': str(count), 'subwave_flow_index': '0',
              'subwave_flow_buffer': '5', 'subwave_flow_entry': str(max(0, lengths[0] / RATE - 5.1)), 'liq_cross_duration': '1'}
    offset = 0
    for i, length in enumerate(lengths):
        for key, value in {'id': ['one', 'two', 'three'][i], 'title': ['one', 'two', 'three'][i],
                           'artist': 'Test', 'album': 'Test', 'offset': offset / RATE, 'duration': length / RATE}.items():
            fields[f'subwave_flow_{i}_{key}'] = str(value)
        offset += length
    annotation = ','.join(f'{key}="{value}"' for key, value in fields.items())
    (directory / 'next.txt').write_text(f'annotate:{annotation}:{directory / "flow.wav"}')
    radio = (ROOT / 'liquidsoap/radio.liq').read_text()
    radio = radio.replace('settings.log.file := true', 'settings.log.stdout := true\nsettings.log.file := false')
    radio = radio.replace('settings.server.telnet := true', 'settings.server.telnet := false')
    radio = radio.replace('single("/sounds/emergency.mp3")', f'single("{directory / "emergency.wav"}")')
    radio = radio.replace('dj_queue = request.queue(id="dj_queue")',
                          f'dj_queue = request.queue(id="dj_queue", queue=[request.create("annotate:title=before,artist=Test,subsonic_id=before,liq_cross_duration=1:{directory / "before.wav"}")])')
    radio = radio.replace('def dj_transition(a, b) =', 'def dj_transition(a, b) =\n  log("FLOW_CROSS: #{a.metadata[\\"title\\"]} -> #{b.metadata[\\"title\\"]}")')
    marker = '# OUTPUT — broadcast to Icecast.'
    radio = radio.split(marker)[0]
    radio += f'''
sent_safe = ref(false)
sent_risky = ref(false)
sent_jingle = ref(false)
sent_after = ref(false)
sent_idle = ref(false)
stream_on := true
if {str(os.environ.get('SUB_FLOW_PREEXISTING', '0') == '1').lower()} then
  ignore(voice_queue.push(request.create("{directory / '1900.wav'}")))
end
flow_output.on_metadata(synchronous=true, fun(m) ->
  log("FLOW_AUDIBLE: #{{flow_clock()}} #{{m[\\"title\\"]}}"))
flow_output.on_frame(synchronous=true, fun() -> begin
  if flow_origin() >= 0. then
    e = flow_clock() - flow_origin()
    if {str(os.environ.get('SUB_FLOW_IDLE', '0') == '1').lower()} and e > 1. and not sent_idle() then
      sent_idle := true
      idle_mode := true
      thread.run(delay=3., fun() -> idle_mode := false)
    end
    if e > 1. and not sent_safe() then
      sent_safe := true
      file.write(data="{directory / '1200.wav'}", "#{{state_dir}}/say.txt")
    end
    if e > 6. and not sent_risky() then
      sent_risky := true
      file.write(data="{directory / '1300.wav'}", "#{{state_dir}}/say.txt")
    end
    if {str(os.environ.get('SUB_FLOW_JINGLE', '0') == '1').lower()} and e > 8. and not sent_jingle() then
      sent_jingle := true
      file.write(data="{directory / '1800.wav'}", "#{{state_dir}}/jingle-now.txt")
    end
    if e > 2. and not sent_after() then
      sent_after := true
      file.write(data="annotate:title=after,artist=Test,subsonic_id=after,liq_cross_duration=1:{directory / 'after.wav'}", "#{{state_dir}}/next.txt")
    end
  end
end)
output.file(%wav, "{directory / 'out.wav'}", radio)
clock.assign_new(sync="auto", [radio])
thread.run(delay={sum(lengths) / RATE + (24 if os.environ.get('SUB_FLOW_PREEXISTING') else 12):.6f}, fun() -> shutdown())
'''
    path = directory / 'test.liq'
    path.write_text(radio)
    command = [os.environ.get('LIQUIDSOAP_BIN', 'liquidsoap')]
    if stdlib := os.environ.get('LIQUIDSOAP_STDLIB'):
        command += ['--stdlib', stdlib]
    result = subprocess.run(command + [str(path)], env={**os.environ, 'SUBWAVE_STATE_DIR': str(directory)},
                            capture_output=True, text=True, timeout=sum(lengths) / RATE + 55)
    (directory / 'run.log').write_text(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    with wave.open(str(directory / 'out.wav'), 'rb') as output:
        pcm = array.array('h', output.readframes((directory / 'out.wav').stat().st_size // 4))[::2]
    anchor = 4 * RATE
    needle = expected[anchor:anchor + 32]
    alignment = next((i - anchor for i in range(len(pcm) - len(needle)) if abs(pcm[i] - needle[0]) <= 2
                      and all(abs(pcm[i+j] - value) <= 2 for j, value in enumerate(needle))), None)
    if alignment is None:
        raise AssertionError('Could not align the prepared audio in the mixer output')
    seam = 0
    for length in lengths[:-1]:
        seam += length
        start = max(0, seam - 5*RATE)
        reference = expected[start:seam + 5*RATE]
        actual = pcm[alignment + start:alignment + seam + 5*RATE]
        assert len(actual) == len(reference)
        maximum = max(abs(a-b) for a,b in zip(actual, reference))
        if maximum > 2:
            print('alignment', alignment / RATE, 'seam', seam / RATE, 'maximum error', maximum)
            errors = [i for i, (a, b) in enumerate(zip(actual, reference)) if abs(a-b) > 2]
            print('changed samples', len(errors), 'first/last seconds', errors[0] / RATE, errors[-1] / RATE)
            print(result.stdout[-8000:])
        assert maximum <= 2, 'Protected samples changed'
    titles = re.findall(r'on_meta: title=(\w+)', result.stdout)
    assert titles == ['before', *['one', 'two', 'three'][:count], 'after'], titles
    crosses = re.findall(r'FLOW_CROSS: (\w+) -> (\w+)', result.stdout)
    assert not any(a in ['one', 'two'] and b in ['two', 'three'] for a,b in crosses), crosses
    print(f'{count} members: protected audio intact; metadata {titles}; outer transitions {crosses}')
    if not os.environ.get('SUB_FLOW_JINGLE', '0') == '1' and not os.environ.get('SUB_FLOW_ROTATE'):
        assert (['one', 'two', 'three'][count-1], 'after') in crosses, crosses
    audible = re.findall(r'FLOW_AUDIBLE: ([\d.]+) (\w+)', result.stdout)
    origin = next(float(t) for t, name in audible if name == 'one')
    offset = lengths[0] / RATE
    for index, title in enumerate(['two', 'three'][:count-1]):
        stamp = next(float(t) for t, name in audible if name == title)
        assert abs(stamp - (origin + offset)) < 0.05, (title, stamp, origin + offset)
        offset += lengths[index+1] / RATE
    assert '1300.wav' in result.stdout and 'DJ says:' in result.stdout


if __name__ == '__main__':
    if destination := os.environ.get('SUB_FLOW_RENDER_DIR'):
        main(Path(destination))
    else:
        with tempfile.TemporaryDirectory(prefix='sub-flow-playback-') as tmp:
            main(Path(tmp))
