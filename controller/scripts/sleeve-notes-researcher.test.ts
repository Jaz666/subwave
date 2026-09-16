import assert from 'node:assert/strict';
import test from 'node:test';
import { validateResearchCandidates, type ResearchJob } from '../src/sleeve-notes/researcher.js';
import { candidatesFromResearchResult, researchOutcomeDebug } from '../src/sleeve-notes/llm-researcher.js';

const job: ResearchJob = {
  id: 'research-1',
  document: {
    id: 'source-1', entityId: 'artist-1', provider: 'wikipedia',
    sourceUrl: 'https://en.wikipedia.org/wiki/Example', revisionId: '123',
    text: 'The Example Band formed in Liverpool in 1980. Their debut album arrived in 1982.',
  },
  categories: ['artist-stories', 'milestones'],
  maxCandidates: 3,
};

test('researcher output must be grounded in the supplied source document', () => {
  const result = validateResearchCandidates(job, [{
    category: 'artist-stories', topic: 'origin', wording: 'The Example Band formed in Liverpool in 1980.',
    evidence: 'The Example Band formed in Liverpool in 1980.',
  }, {
    category: 'artist-stories', topic: 'invented', wording: 'The band invented stadium rock.',
    evidence: 'The band invented stadium rock.',
  }]);
  assert.deepEqual(result.accepted.map((candidate) => candidate.topic), ['origin']);
  assert.deepEqual(result.rejected.map((candidate) => candidate.reason), ['unsupported']);
});

test('researcher output respects enabled categories, topic diversity and bounds', () => {
  const result = validateResearchCandidates(job, [{
    category: 'credits', topic: 'producer', wording: 'Produced by A Producer.',
    evidence: 'The Example Band formed in Liverpool in 1980.',
  }, {
    category: 'artist-stories', topic: 'origin', wording: 'The Example Band formed in Liverpool in 1980.',
    evidence: 'The Example Band formed in Liverpool in 1980.',
  }, {
    category: 'artist-stories', topic: 'ORIGIN', wording: 'They began in Liverpool in 1980.',
    evidence: 'The Example Band formed in Liverpool in 1980.',
  }, {
    category: 'milestones', topic: 'debut', wording: 'Their debut album arrived in 1982.',
    evidence: 'Their debut album arrived in 1982.',
  }]);
  assert.deepEqual(result.accepted.map((candidate) => [candidate.category, candidate.topic]), [
    ['artist-stories', 'origin'],
  ]);
  assert.deepEqual(result.rejected.map((candidate) => candidate.reason), ['category', 'duplicate', 'bare-milestone']);
});

test('an empty research result is a valid no-claim outcome', () => {
  const result = validateResearchCandidates(job, []);
  assert.deepEqual(result, { accepted: [], rejected: [] });
});

test('researcher rejects evidence that appears in source but does not entail the wording', () => {
  const result = validateResearchCandidates(job, [{
    category: 'artist-stories', topic: 'hit', wording: 'She is best known for her biggest hit single.',
    evidence: 'Their debut album arrived in 1982.',
  }]);
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.rejected.map((candidate) => candidate.reason), ['unsupported']);
});

test('researcher rejects evidence whose concrete detail is absent from the wording', () => {
  const evidenceJob = { ...job, document: { ...job.document, text: 'The single I Follow Rivers became their biggest international hit.' } };
  const result = validateResearchCandidates(evidenceJob, [{
    category: 'artist-stories', topic: 'hit', wording: 'It became their biggest international hit.',
    evidence: 'The single I Follow Rivers became their biggest international hit.',
  }]);
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.rejected.map((candidate) => candidate.reason), ['unsupported']);
});

test('researcher rejects a sentence that adds names or facts from elsewhere in the article', () => {
  const evidenceJob = { ...job, document: { ...job.document, text: [
    'Duke Erikson and Butch Vig had been in several bands together, including Spooner and Fire Town.',
    'In 1990, the band explored jazz fusion, punk rock and Delta blues on its second album.',
  ].join(' ') } };
  const result = validateResearchCandidates(evidenceJob, [{
    category: 'artist-stories', topic: 'line-up',
    wording: 'Shirley Manson, Duke Erikson, Steve Marker and Butch Vig have remained in the band since its inception.',
    evidence: 'Duke Erikson and Butch Vig had been in several bands together, including Spooner and Fire Town.',
  }, {
    category: 'milestones', topic: 'awards',
    wording: 'The band won a Grammy Award for Best Hard Rock Performance in 1990.',
    evidence: 'In 1990, the band explored jazz fusion, punk rock and Delta blues on its second album.',
  }]);
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.rejected.map((candidate) => candidate.reason), ['unsupported', 'unsupported']);
});

test('researcher requires each sentence of a compound note to be evidenced', () => {
  const evidenceJob = { ...job, document: { ...job.document, text: [
    'The band were created by German record producer Frank Farian, who was the group\'s primary songwriter.',
    'The four original members were Liz Mitchell, Marcia Barrett, Maizie Williams and Bobby Farrell.',
  ].join(' ') } };
  const result = validateResearchCandidates(evidenceJob, [{
    category: 'artist-stories', topic: 'formation',
    wording: 'The band was created by German record producer Frank Farian. The original line-up included Liz Mitchell, Marcia Barrett, Maizie Williams and Bobby Farrell.',
    evidence: 'The band were created by German record producer Frank Farian, who was the group\'s primary songwriter.',
  }]);
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.rejected.map((candidate) => candidate.reason), ['unsupported']);
});

test('researcher refuses a bare name or date as evidence for a larger claim', () => {
  const result = validateResearchCandidates(job, [{
    category: 'artist-stories', topic: 'label', wording: "They were originally signed to Tony Wilson's Factory Records label.",
    evidence: 'Tony Wilson',
  }, {
    category: 'artist-stories', topic: 'member', wording: 'Rowetta performed with the band until December 2024.',
    evidence: 'December 2024',
  }]);
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.rejected.map((candidate) => candidate.reason), ['shape', 'shape']);
});

test('researcher rejects a bare release-date milestone but keeps an evidenced release story', () => {
  const richerJob = { ...job, document: { ...job.document, text: 'Their debut album arrived in 1982. It was produced by A Producer after the band signed to Example Records.' } };
  const result = validateResearchCandidates(richerJob, [{
    category: 'milestones', topic: 'debut date', wording: 'Their debut album arrived in 1982.',
    evidence: 'Their debut album arrived in 1982.',
  }, {
    category: 'milestones', topic: 'debut production', wording: 'Their debut album was produced by A Producer after the band signed to Example Records.',
    evidence: 'It was produced by A Producer after the band signed to Example Records.',
  }]);
  assert.deepEqual(result.accepted.map((candidate) => candidate.topic), ['debut production']);
  assert.deepEqual(result.rejected.map((candidate) => candidate.reason), ['bare-milestone']);
});

test('the LLM researcher reads candidates from djObject\'s decoded result', () => {
  const candidates = [{
    category: 'artist-stories', topic: 'origin', wording: 'The Example Band formed in Liverpool in 1980.',
    evidence: 'The Example Band formed in Liverpool in 1980.',
  }] as const;
  assert.deepEqual(candidatesFromResearchResult({ candidates }), candidates);
  assert.deepEqual(candidatesFromResearchResult({ value: { candidates } }), []);
  assert.deepEqual(candidatesFromResearchResult(undefined), []);
});

test('research debug outcome separates retained claims from rejected candidates', () => {
  const candidate = {
    category: 'artist-stories' as const, topic: 'origin', wording: 'The Example Band formed in Liverpool in 1980.',
    evidence: 'The Example Band formed in Liverpool in 1980.',
  };
  assert.deepEqual(researchOutcomeDebug({
    accepted: [candidate], rejected: [{ candidate, reason: 'duplicate' }],
  }), {
    status: 'complete', retained: [candidate], rejected: [{ ...candidate, reason: 'duplicate' }],
  });
});
