"""Read-only cached-stem diagnostics, not vocal phrase recognition or cue approval.

Requires the two copied head-vocal FLACs/manifests in ROOT/vocal-edges.
Uses the existing RMS gate on original-mix RMS, not reconstructed stem-sum RMS.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import numpy as np

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / 'controller/scripts'))
from analyze_worker import vocal_ranges_from_rms

SR = 44100
HOP = 2205


def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def decode(path, seconds=68):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(path), '-t', str(seconds), '-f', 'f32le', '-ar', str(SR), '-ac', '2', 'pipe:1'])
    return np.frombuffer(raw, dtype='<f4').reshape(-1, 2).copy()


def rms(audio):
    n = len(audio) // HOP
    return np.sqrt(np.mean(audio[:n*HOP].reshape(n, HOP, 2)**2, axis=(1, 2)))


def boundary_evidence(ranges, at, limit):
    runs = [(r['startMs']/1000, r['endMs']/1000) for r in ranges]
    crossing = [r for r in runs if r[0] <= at < r[1]]
    before = max((r[1] for r in runs if r[1] <= at), default=None)
    after = min((r[0] for r in runs if r[0] > at), default=None)
    return dict(sourceSeconds=at, detectedRunCrossesBoundary=bool(crossing), crossingRunsSeconds=crossing,
                nearestEarlierDetectedEndSeconds=before, nearestLaterDetectedStartSeconds=after,
                noDetectionIsNotVocalAbsence=True,
                nearbyDetectedRanges=[dict(startSeconds=a,endSeconds=b) for a,b in runs if b>at-3 and a<at+3],
                coverageEndSeconds=limit)


def audition(vocal, path, markers):
    # No silence trim, gate, noise reduction, cut simulation, stretch or loop.
    start, end = 4., 28.
    audio = vocal[round(start*SR):round(end*SR)].copy()
    gain = .7 / max(float(np.max(np.abs(audio))), 1e-12)
    audio *= gain
    for at in markers:
        offset = round((at-start)*SR)
        length = round(.1*SR)
        t = np.arange(length)/SR
        chord = .12 * sum(np.sin(2*np.pi*f*t) for f in (600,900,1200)) * np.hanning(length)
        audio[offset:offset+length] += chord[:,None]
    peak = float(np.max(np.abs(audio)))
    if peak>.95:
        audio *= .95/peak
    subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-f','f32le','-ar',str(SR),'-ac','2','-i','pipe:0','-codec:a','libmp3lame','-b:a','160k',str(path)],input=audio.astype('<f4').tobytes(),check=True)
    return dict(sourceStartSeconds=start,sourceEndSeconds=end,stemGainBeforeChimes=gain,
                markerSourceSeconds=markers,markerClipSeconds=[t-start for t in markers],
                caveat='Stem level normalized for inspection; separation bleed remains; gain is not source vocal loudness')


def main():
    # Minimal envelope/edge checks; this does not test recognition of vocals.
    assert np.all(rms(np.ones((2*HOP,2))) == 1)
    assert boundary_evidence([dict(startMs=1000,endMs=2000)],1.5,3)['detectedRunCrossesBoundary']
    assert not boundary_evidence([],1.5,3)['detectedRunCrossesBoundary']
    root = Path(sys.argv[1]); out = root/'vocal-edges'
    comparison = json.loads((root/'comparison.json').read_text())
    result = dict(method='Existing RMS gate; 68-second head context, original mix and storage-gain-corrected existing vocal stem',
                  frameSeconds=.05,thresholdsAreDiagnosticsOnly=True,phraseCompletion='unknown',cutSafety='unknown',records=[])
    for name, slug, markers in [('urban','urban-cookie-collective',[7.6,22.38]),('gusto','gusto',[7.72,22.94])]:
        manifest_path=out/f'{name}-manifest.json'
        manifest=json.loads(manifest_path.read_text())
        source=next(r for r in comparison['tracks'] if r['name']==slug)
        assert digest(Path(source['sourcePath'])) == source['sourceSha256'] == manifest['identity']['source_sha256']
        region=next(r for r in manifest['metadata']['stem_regions'] if r['name']=='head')
        assert region['start_sample']==0 and region['sample_rate']==SR
        stem_path=out/f'{name}-head-vocals.flac'
        expected=manifest['files']['head-vocals.flac']
        assert stem_path.stat().st_size==expected['bytes'] and digest(stem_path)==expected['sha256']
        vocal=decode(stem_path)/region['storage_gain']
        mix=decode(Path(source['sourcePath']))
        assert len(vocal)==len(mix)==region['end_sample']
        v,m=rms(vocal),rms(mix)
        gate_results=[]
        for scale in (1.,.2,.05):
            reference=v[v>0]
            threshold=max(.15*scale*float(np.percentile(reference,90)),.06*scale*float(np.percentile(m,90)))
            ranges=vocal_ranges_from_rms(v,m,SR,HOP,stem_rel=.15*scale,mix_floor=.06*scale,loud_reference=reference)
            gate_results.append(dict(scale=scale,thresholdRms=threshold,thresholdDbfs=float(20*np.log10(max(1e-12,threshold))),
                allHeadRanges=ranges,openingRanges=[r for r in ranges if r['startMs']<32000],
                boundaryEvidence=[boundary_evidence(ranges,t,68) for t in markers]))
        contexts=[]
        for at in markers:
            frames=[]
            for a,b in [(at-.5,at),(at,at+.5),(at+.5,at+1),(at+1,at+2)]:
                segment=vocal[round(a*SR):round(b*SR)]
                frames.append(dict(startSeconds=a,endSeconds=b,stemRmsDbfs=float(10*np.log10(max(1e-12,float(np.mean(segment**2)))))))
            contexts.append(dict(sourceSeconds=at,windows=frames))
        render=audition(vocal,out/f'{name}-vocal-boundaries.mp3',markers)
        row=dict(name=slug,sourceSha256=source['sourceSha256'],manifestSha256=digest(manifest_path),
                 vocalStemSha256=expected['sha256'],separator=manifest['identity']['separator'],
                 stemCoverageStartSeconds=0,stemCoverageEndSeconds=len(vocal)/SR,storageGainUndone=region['storage_gain'],
                 mixReference='original source; differs from legacy reconstructed-stem mix',
                 gateSensitivity=gate_results,boundaryStemLevels=contexts,audition=render,
                 envelope=dict(startSeconds=0,hopSeconds=.05,vocalRmsDbfs=(20*np.log10(np.maximum(v[:640],1e-6))).round(2).tolist(),
                               mixRmsDbfs=(20*np.log10(np.maximum(m[:640],1e-6))).round(2).tolist()))
        if name=='gusto':
            other_path=out/'gusto-head-other.flac'
            other_expected=manifest['files']['head-other.flac']
            assert other_path.stat().st_size==other_expected['bytes'] and digest(other_path)==other_expected['sha256']
            other=decode(other_path)/region['storage_gain']
            assert other.shape==vocal.shape
            row['otherStemInspection']=dict(stemSha256=other_expected['sha256'],
                purpose='Check whether known background vocal sample is in other; listening required, not machine-confirmed allocation',
                audition=audition(other,out/'gusto-other-boundaries.mp3',markers))
        result['records'].append(row)
        print(slug,[(g['scale'],g['openingRanges']) for g in gate_results],flush=True)
    (out/'results.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')


if __name__=='__main__':
    main()
