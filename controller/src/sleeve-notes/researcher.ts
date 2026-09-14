// Contract between Sleeve Notes collection and a future isolated researcher.
// The controller owns source retrieval, pacing, evidence validation and all
// database writes. A researcher only receives bounded source material and
// returns candidate notes; it never decides that a claim is safe to retain.

export const SLEEVE_NOTE_CATEGORIES = [
  'artist-stories',
  'track-stories',
  'musical-connections',
  'milestones',
  'credits',
] as const;

export type SleeveNoteCategory = typeof SLEEVE_NOTE_CATEGORIES[number];

export interface ResearchDocument {
  id: string;
  entityId: string;
  provider: string;
  sourceUrl: string;
  revisionId: string | null;
  text: string;
}

export interface ResearchJob {
  id: string;
  document: ResearchDocument;
  categories: readonly SleeveNoteCategory[];
  maxCandidates: number;
}

export interface ResearchCandidate {
  category: SleeveNoteCategory;
  topic: string;
  wording: string;
  /** Exact supporting source text, not a model-generated paraphrase. */
  evidence: string;
}

export interface Researcher {
  extract(job: ResearchJob, signal: AbortSignal): Promise<ResearchCandidate[]>;
}

export interface ValidatedResearch {
  accepted: ResearchCandidate[];
  rejected: Array<{ candidate: ResearchCandidate; reason: 'category' | 'shape' | 'unsupported' | 'duplicate' }>;
}

function normal(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function validText(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && normal(value).length >= min && normal(value).length <= max;
}

function isCategory(value: string): value is SleeveNoteCategory {
  return (SLEEVE_NOTE_CATEGORIES as readonly string[]).includes(value);
}

/**
 * The controller's trust boundary for researcher output.
 *
 * A candidate must use an enabled category, fit deliberately small DJ-facing
 * fields, cite a bounded exact passage from the supplied document, and not
 * duplicate an accepted category/topic. This makes an LLM useful for editorial
 * selection without making it an authority on what the source says.
 */
export function validateResearchCandidates(job: ResearchJob, candidates: readonly ResearchCandidate[]): ValidatedResearch {
  const accepted: ResearchCandidate[] = [];
  const rejected: ValidatedResearch['rejected'] = [];
  const source = normal(job.document.text);
  const enabled = new Set(job.categories);
  const seen = new Set<string>();
  const max = Math.max(0, Math.min(job.maxCandidates, 12));

  for (const candidate of candidates) {
    if (accepted.length >= max) break;
    if (!isCategory(candidate.category) || !enabled.has(candidate.category)) {
      rejected.push({ candidate, reason: 'category' });
      continue;
    }
    if (!validText(candidate.topic, 2, 100) || !validText(candidate.wording, 8, 360) || !validText(candidate.evidence, 8, 900)) {
      rejected.push({ candidate, reason: 'shape' });
      continue;
    }
    if (!source.includes(normal(candidate.evidence))) {
      rejected.push({ candidate, reason: 'unsupported' });
      continue;
    }
    const key = `${candidate.category}\u0000${normal(candidate.topic).toLowerCase()}`;
    if (seen.has(key)) {
      rejected.push({ candidate, reason: 'duplicate' });
      continue;
    }
    seen.add(key);
    accepted.push({
      category: candidate.category,
      topic: normal(candidate.topic),
      wording: normal(candidate.wording),
      evidence: normal(candidate.evidence),
    });
  }
  return { accepted, rejected };
}
