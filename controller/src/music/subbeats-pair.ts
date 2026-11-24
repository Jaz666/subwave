// Read-only pair planning shared by operator diagnostics and live queue admission.
// A metadata proposal is never permission to publish a clip or its cue stamps.
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { subbeatsPairAssessmentSchema, subbeatsPairPlanRequestSchema } from '../schemas/subbeats.js';
import * as library from './library.js';
import * as db from './library-db.js';
import type { TrackRecord } from './library-db/types.js';
import * as blocklist from './blocklist.js';
import { endingKeyFrom, openingKeyFrom, parseCamelot, keyCompat } from './mix.js';
import { planSubbeatsPairFromEvidence } from './analyzer.js';
import { readSubbeatsQueue } from './subbeats-store.js';
import { withSubbeatsLyrics } from './subbeats-lyrics.js';
import { subbeatsRoleDecision } from './subbeats-role-policy.js';
import { latestSubbeatsPrepV2Role } from './subbeats-prep-v2-library.js';

type KeyTrack = Pick<TrackRecord,'musicalKey'|'keyRanges'|'durationSec'>;

export type SubbeatsPrepV2RoleEvidence = ReturnType<typeof latestSubbeatsPrepV2Role>;
type V2Role = SubbeatsPrepV2RoleEvidence;

// Match Python round() at exact half-samples as well as ordinary positions.
export function roundStemBeatsSample(samples: number): number {
  const lower = Math.floor(samples);
  return samples - lower === .5 ? lower + lower % 2 : Math.round(samples);
}

export function assessSubbeatsPrepV2Roles(outgoingRole: V2Role, incomingRole: V2Role) {
  const cuePairs = outgoingRole.state === 'cue-ready' && incomingRole.state === 'cue-ready'
    ? outgoingRole.cues.flatMap((outCue, outgoingCueIndex) =>
      incomingRole.cues.flatMap((inCue, incomingCueIndex) => {
        const difference = Math.abs(outCue.bpm / inCue.bpm - 1);
        return difference <= .08 ? [{ outgoingCueIndex, incomingCueIndex,
          outgoingSeconds: outCue.sourceSeconds, incomingSeconds: inCue.sourceSeconds,
          outgoingBpm: outCue.bpm, incomingBpm: inCue.bpm, tempoDifference: difference }] : [];
      }))
    : [];
  return { outgoingRole, incomingRole, cuePairs,
    state: outgoingRole.state !== 'cue-ready' ? outgoingRole.state
      : incomingRole.state !== 'cue-ready' ? incomingRole.state
        : cuePairs.length ? 'tempo-compatible' as const : 'pair-tempo-rejected' as const };
}

export function planSubbeatsPrepV2Extraction(outgoingRole: V2Role, incomingRole: V2Role) {
  const assessed = assessSubbeatsPrepV2Roles(outgoingRole, incomingRole);
  if (assessed.state !== 'tempo-compatible') return { ...assessed, plan: null };
  if (outgoingRole.state !== 'cue-ready' || incomingRole.state !== 'cue-ready')
    return { ...assessed, state: 'role-unavailable' as const, plan: null };
  const outDuration = outgoingRole.job.source!.durationSeconds;
  const inDuration = incomingRole.job.source!.durationSeconds;
  const candidates = assessed.cuePairs.flatMap(pair => {
    const outgoing = outgoingRole.cues[pair.outgoingCueIndex]!;
    const incoming = incomingRole.cues[pair.incomingCueIndex]!;
    const period = 60 / outgoing.bpm;
    const rawRate = outgoing.bpm / incoming.bpm;
    const rate = Math.abs(rawRate - 1) < .0001 ? 1 : rawRate;
    const handover = outgoing.phraseEndSeconds ?? outgoing.sourceSeconds;
    if (!Number.isFinite(handover) || outgoing.sourceSeconds > handover || handover > outDuration
        || incoming.sourceSeconds / rate < 4 * period || incoming.sourceSeconds / rate >= inDuration / rate) return [];
    const entry = handover - incoming.sourceSeconds / rate;
    const first = Math.max(0, Math.min(outgoing.sourceSeconds, entry) - 4);
    const end = Math.max(outDuration, handover + 8 * period);
    const incomingEnd = (end - entry) * rate;
    if (entry < 0 || end - first > 120 || incomingEnd > inDuration) return [];
    const sampleRate = 44100;
    const firstFrame = roundStemBeatsSample(first * sampleRate);
    const outgoingEndFrame = roundStemBeatsSample(outDuration * sampleRate) - firstFrame;
    const arrivalFrame = roundStemBeatsSample(handover * sampleRate) - firstFrame;
    const entryFrame = roundStemBeatsSample(entry * sampleRate) - firstFrame;
    const releaseStart = Math.max(outgoingEndFrame, arrivalFrame + roundStemBeatsSample(2 * period * sampleRate));
    const releaseFrames = rate === 1 ? 0 : roundStemBeatsSample(16 * period * sampleRate);
    const releaseEnd = releaseStart + releaseFrames;
    const nativeFrames = Math.max(sampleRate, roundStemBeatsSample(4 * 60 / incoming.bpm * sampleRate));
    const clipFrames = releaseEnd + nativeFrames;
    const resumeFrames = roundStemBeatsSample(rate * (releaseStart - entryFrame)
      + (rate + 1) * .5 * releaseFrames + nativeFrames);
    const resumeSeconds = resumeFrames / sampleRate;
    const outgoingStartMs = firstFrame * 1000 / sampleRate;
    const outgoingEndMs = roundStemBeatsSample(outDuration * sampleRate) * 1000 / sampleRate;
    const incomingEndMs = resumeFrames * 1000 / sampleRate;
    if (clipFrames > 120 * sampleRate || resumeSeconds >= inDuration || resumeSeconds > 120
        || outgoingEndMs - outgoingStartMs > 120000 || incomingEndMs > 120000) return [];
    return [{ ...pair, firstSeconds: first, outgoingEndSeconds: outDuration,
      incomingStartSeconds: 0, incomingEndSeconds: resumeSeconds,
      rate, tempoAdjustmentPercent: (rate - 1) * 100,
      rank: [Math.abs(rate - 1), Math.abs((handover - outgoing.sourceSeconds) - incoming.sourceSeconds / rate),
        pair.outgoingCueIndex, pair.incomingCueIndex] as const }];
  }).sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1]
    || a.rank[2] - b.rank[2] || a.rank[3] - b.rank[3]);
  const selected = candidates[0];
  return { ...assessed, state: selected ? 'windows-ready' as const : 'window-unavailable' as const,
    plan: selected ? { ...selected,
      outgoing: { startSeconds: selected.firstSeconds, endSeconds: selected.outgoingEndSeconds },
      incoming: { startSeconds: selected.incomingStartSeconds, endSeconds: selected.incomingEndSeconds } } : null };
}

/**
 * Pick-time admission evidence from the independent V2 prep store. This is
 * deliberately only a cue/grid and tempo screen; it does not imply that the
 * exact windows have been extracted or that a transition can be rendered.
 */
export function subbeatsPrepV2PairSnapshot(outgoingId: string, incomingId: string) {
  const outgoing = db.getTrack(outgoingId), incoming = db.getTrack(incomingId);
  if (!outgoing || !incoming || outgoingId === incomingId
      || blocklist.hitOf(outgoing) || blocklist.hitOf(incoming)) {
    throw new Error('A selected track is unavailable or blocked. Choose another pair.');
  }
  const outgoingRole = latestSubbeatsPrepV2Role(outgoingId, 'outgoing');
  const incomingRole = latestSubbeatsPrepV2Role(incomingId, 'incoming');
  const assessment = assessSubbeatsPrepV2Roles(outgoingRole, incomingRole);
  const choice = subbeatsHarmonicChoice(outgoing, incoming);
  const roleIdentity = (result: V2Role) => result.state === 'cue-ready'
    ? { state: result.state, runId: result.runId, role: result.role,
      source: result.job.source, gridArtifact: result.job.roles[result.role].gridArtifact,
      cues: result.cues }
    : { state: result.state, reason: result.reason };
  const evidenceFingerprint = createHash('sha256').update(JSON.stringify({ version: 1,
    outgoingId, incomingId, outgoingRole: roleIdentity(outgoingRole), incomingRole: roleIdentity(incomingRole),
    cuePairs: assessment.cuePairs, choice })).digest('hex');
  return { ...assessment, ...choice, evidenceFingerprint };
}

export function subbeatsHarmonicChoice(outgoing:KeyTrack,incoming:KeyTrack) {
  const outgoingKey = endingKeyFrom(outgoing.keyRanges,
    outgoing.durationSec == null ? null : outgoing.durationSec*1000,outgoing.musicalKey);
  const incomingKey = openingKeyFrom(incoming.keyRanges,incoming.musicalKey);
  const known = !!parseCamelot(outgoingKey) && !!parseCamelot(incomingKey);
  const compatibility = !known ? 'unknown' : keyCompat(outgoingKey,incomingKey) > 0 ? 'compatible' : 'mismatch';
  return {
    mixStyle:compatibility === 'compatible' ? 'long-blend' as const
      : compatibility === 'mismatch' ? 'drums-first' as const : 'short-exchange' as const,
    harmonic:{compatibility,outgoingKey,incomingKey,evidence:'library-estimate' as const,
      reason:!known ? 'A usable Camelot key is missing; the pair remains eligible.'
        : 'Library key estimates guide style only; an ending without measured coverage uses the leading-window fallback.'},
  };
}

// Call after library/blocklist load. Reused after audition rendering so a
// cancelled preparation or edited lyric correction cannot return stale audio.
export function subbeatsPairSnapshot(outgoingId:string,incomingId:string) {
  const outgoing = db.getTrack(outgoingId), incoming = db.getTrack(incomingId);
  if (!outgoing || !incoming || blocklist.hitOf(outgoing) || blocklist.hitOf(incoming)) {
    throw new Error('A selected track is unavailable or blocked. Choose another pair.');
  }
  const prepared = readSubbeatsQueue(config.stateDir).jobs;
  const jobs = withSubbeatsLyrics([outgoingId,incomingId].flatMap(id => {
    const job = prepared.find(item => item.id === id);
    return job ? [job] : [];
  }),config.stateDir);
  const choice = subbeatsHarmonicChoice(outgoing,incoming);
  const sourceEvidence = [
    { grid: outgoing.outro?.gridProvenance, bars: outgoing.outro?.bars ?? [], bytes: db.trackFileSize(outgoingId) },
    { grid: incoming.gridProvenance, bars: incoming.bars ?? [], bytes: db.trackFileSize(incomingId) },
  ];
  const roles = sourceEvidence.map(({ grid, bars, bytes }, index) => subbeatsRoleDecision(
    jobs.find(job => job.id === (index === 0 ? outgoingId : incomingId)),
    index === 0 ? 'tail' : 'head', grid, bytes, bars,
  ));
  const evidenceFingerprint = createHash('sha256').update(JSON.stringify({version:1,
    outgoingId,incomingId,jobs,choice,sourceEvidence,roles})).digest('hex');
  return {jobs,roles,sourceEvidence,...choice,evidenceFingerprint};
}

export async function assessSubbeatsPair(outgoingId:string,incomingId:string) {
  subbeatsPairPlanRequestSchema.parse({outgoingId,incomingId});
  await library.load();
  await blocklist.load();
  const before = subbeatsPairSnapshot(outgoingId,incomingId);
  const plan = await planSubbeatsPairFromEvidence(before.jobs,outgoingId,incomingId,before.mixStyle);
  if (subbeatsPairSnapshot(outgoingId,incomingId).evidenceFingerprint !== before.evidenceFingerprint) {
    throw new Error('The prepared evidence changed while planning. Request the pair plan again.');
  }
  return subbeatsPairAssessmentSchema.parse({plan,harmonic:before.harmonic,evidenceFingerprint:before.evidenceFingerprint});
}
