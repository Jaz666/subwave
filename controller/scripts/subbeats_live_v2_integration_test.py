"""Run inside the analyzer image; exercise one real CPU render without models/network."""
import hashlib
import json
import math
from pathlib import Path
import tempfile
import sys
from unittest.mock import patch

try:
    import numpy as np
    import soundfile as sf
    import librosa
except ImportError:
    print('skipped: analyzer audio dependencies are unavailable')
    sys.exit(0)

from subbeats_cue_matching import live_handoff_timing
from subbeats_cue_preview import passage_plan
from subbeats_live import render_live_v2, LiveRenderError
from subbeats_prepare import STEM_SR
import analyze_worker as worker


def render_case(duration=180., incoming_bpm=124., fractional_cues=False):
    with tempfile.TemporaryDirectory(prefix='stembeats-v2-render-') as temporary:
        root = Path(temporary)
        state = root / 'state'
        stems_root = state / 'stems'
        feature_root = stems_root / 'stembeats' / 'pick-time'
        workspace = feature_root / '.pick-fixture'
        workspace.mkdir(parents=True)
        (workspace / '.subwave-stembeats').touch()
        for side in ('tail', 'head'):
            (workspace / side).mkdir()
        (state / 'transitions').mkdir(parents=True)

        frames = round(duration * STEM_SR)
        duration = frames / STEM_SR
        times = np.arange(frames, dtype=np.float32) / STEM_SR
        wave = (.1 * np.sin(2 * math.pi * 110 * times) + .02 * np.sin(2 * math.pi * 2 * times)).astype(np.float32)
        audio = np.stack([wave, wave], axis=1)
        cues = [
            {'sourceSeconds': 140., 'bpm': 128., 'strength': 1., 'reason': 'repetition', 'phraseEndSeconds': 160.},
            {'sourceSeconds': 30., 'bpm': incoming_bpm, 'strength': 1., 'reason': 'opening'},
        ]
        if fractional_cues:
            for cue in cues:
                cue['sourceSeconds'] += .123456
            cues[0]['phraseEndSeconds'] += .123456
        roles = []
        for index, (side, track, cue) in enumerate((('tail', 'out', cues[0]), ('head', 'in', cues[1]))):
            source_path = root / f'{track}.wav'
            sf.write(source_path, audio, STEM_SR, subtype='PCM_16')
            source = {'path': str(source_path), 'sha256': hashlib.sha256(source_path.read_bytes()).hexdigest(),
                      'bytes': source_path.stat().st_size, 'durationSeconds': float(duration)}
            roles.append({'id': track, 'side': side, 'cueIndex': 0, 'cue': cue, 'source': source})
            if side == 'tail':
                def measure_head(decoded, sr, _librosa, _beats, offset_s):
                    assert sr == worker.ANALYZE_SR and offset_s == 0.
                    assert abs(len(decoded)-round(59.999*sr)) <= 2
                    return [500, 1000], list(range(1000, 59000, 2000)), {
                        'version': 1, 'backend': 'beat-this-onnx', 'model': 'small0',
                        'modelSha256': 'a'*64, 'preprocessingVersion': 1,
                        'windowStartMs': 0, 'windowEndMs': round(len(decoded)*1000/sr),
                        'evidence': {'medianBpm': 120, 'intervalSupport': 1, 'librosaBeatSupport': None},
                    }
                with patch.object(worker, 'measure_bar_grid', side_effect=measure_head):
                    head = worker.analyze_facet_request(librosa, {'path': str(source_path), 'complete': True,
                        'facets': ['head'], 'head_grid_seconds': 60})
                head_data = head['facets']['head']
                assert head_data['status'] == 'ok', head_data
                assert head_data['data']['grid_provenance']['source']['sha256'] == source['sha256']
                assert head_data['data']['grid_provenance']['source']['complete'] is True

        plan = passage_plan(cues[0], cues[1], float(duration), float(duration))
        timing = live_handoff_timing(plan, cues[1]['bpm'], release_beats=16)
        for role in roles:
            side = role['side']
            outgoing = side == 'tail'
            first = timing['outgoingStartSample'] if outgoing else 0
            stop = frames if outgoing else timing['incomingResumeSample']
            start_ms = first * 1000 / STEM_SR
            end_ms = stop * 1000 / STEM_SR
            directory = workspace / side
            evidence = {'version': 1, 'side': side, 'start_ms': start_ms, 'end_ms': end_ms,
                        'key': ('b' if outgoing else 'c') * 64, 'source_sha256': role['source']['sha256'],
                        'source_bytes': role['source']['bytes'], 'model': 'htdemucs'}
            source = worker.FileSource(role['source']['path'], complete=True)
            source.duration_s = duration
            class Detector:
                def separate(self, decoded, *, device):
                    assert device == 'cpu'
                    return {name: decoded if name == 'drums' else np.zeros_like(decoded)
                            for name in ('drums', 'bass', 'other', 'vocals')}
            # Keep production decoding, fingerprinting, files and completion
            # evidence; replace only Demucs, which is not a timing authority.
            with patch.object(worker, 'get_vocal_detector', return_value=Detector()):
                stamp = worker.extract_stembeats_stem_window(librosa, source, evidence, str(directory))
            assert stamp['samples'] == stop-first
            decoded_source, _ = sf.read(role['source']['path'], dtype='float32', always_2d=True)
            drums, _ = sf.read(directory / f'{side}-drums.flac', dtype='float32', always_2d=True)
            np.testing.assert_array_equal(drums, decoded_source[first:stop])
            role['window'] = {'directory': str(directory), 'evidence': evidence}

        request = {'version': 2, 'transitionId': '33333333-3333-4333-8333-333333333333',
                   'deadlineMs': 9_999_999_999_999, 'stateDir': str(state), 'stemsRoot': str(stems_root),
                   'outgoingId': 'out', 'incomingId': 'in', 'roles': roles, 'gainsDb': [0., 0.],
                   'mixStyle': 'long-blend', 'evidenceFingerprint': 'd' * 64}
        result = render_live_v2(request)
        assert result['status'] == 'rendered' and result['sourceVerified'] is True
        assert result['timing'] == timing
        assert Path(result['clipPath']).is_file()
        # Lost real audio is a coverage rejection, never silent padding.
        evidence = roles[0]['window']['evidence']
        evidence['end_ms'] -= 1000 / STEM_SR
        stamp_path = Path(roles[0]['window']['directory']) / 'tail-stembeats.json'
        stamp = json.loads(stamp_path.read_text())
        stamp['end_ms'] = evidence['end_ms']
        stamp_path.write_text(json.dumps(stamp))
        try:
            render_live_v2(request)
        except LiveRenderError as error:
            assert error.code == 'window-coverage'
        else:
            raise AssertionError('shortened window was accepted')
        roles[0]['source']['sha256'] = '0' * 64
        try:
            render_live_v2(request)
        except LiveRenderError as error:
            assert error.code == 'source-mismatch'
        else:
            raise AssertionError('changed source was accepted')
        print(f'Stem Beats V2 CPU render and refusal checks: {duration:.9f}s, {incoming_bpm} BPM ok', flush=True)


def main():
    render_case()
    fractional_duration = (180 * STEM_SR + 5444) / STEM_SR
    render_case(fractional_duration, 128., True)
    render_case(fractional_duration, 124., True)


if __name__ == '__main__':
    main()
