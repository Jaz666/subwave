// Read-only pair planning shared by operator diagnostics and future queue admission.
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

type KeyTrack = Pick<TrackRecord,'musicalKey'|'keyRanges'|'durationSec'>;

export function subbeatsHarmonicChoice(outgoing:KeyTrack,incoming:KeyTrack) {
  const outgoingKey = endingKeyFrom(outgoing.keyRanges,
    outgoing.durationSec == null ? null : outgoing.durationSec*1000,outgoing.musicalKey);
  const incomingKey = openingKeyFrom(incoming.keyRanges,incoming.musicalKey);
  const known = !!parseCamelot(outgoingKey) && !!parseCamelot(incomingKey);
  const compatibility = !known ? 'unknown' : keyCompat(outgoingKey,incomingKey) > 0 ? 'compatible' : 'mismatch';
  return {
    mixStyle:compatibility === 'compatible' ? 'long-blend' as const : 'short-exchange' as const,
    harmonic:{compatibility,outgoingKey,incomingKey,evidence:'library-estimate' as const,
      reason:!known ? 'A usable Camelot key is missing; the pair remains eligible.'
        : 'Library key estimates guide style only; an ending without measured coverage uses the leading-window fallback.'},
  };
}

export async function assessSubbeatsPair(outgoingId:string,incomingId:string) {
  subbeatsPairPlanRequestSchema.parse({outgoingId,incomingId});
  await library.load();
  await blocklist.load();
  const snapshot = () => {
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
    const evidenceFingerprint = createHash('sha256').update(JSON.stringify({version:1,
      outgoingId,incomingId,jobs,choice})).digest('hex');
    return {jobs,...choice,evidenceFingerprint};
  };
  const before = snapshot();
  const plan = await planSubbeatsPairFromEvidence(before.jobs,outgoingId,incomingId,before.mixStyle);
  if (snapshot().evidenceFingerprint !== before.evidenceFingerprint) {
    throw new Error('The prepared evidence changed while planning. Request the pair plan again.');
  }
  return subbeatsPairAssessmentSchema.parse({plan,harmonic:before.harmonic,evidenceFingerprint:before.evidenceFingerprint});
}
