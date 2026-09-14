import assert from 'node:assert/strict';
import test from 'node:test';
import { validateResearchCandidates, type ResearchJob } from '../src/sleeve-notes/researcher.js';
import { candidatesFromResearchResult } from '../src/sleeve-notes/llm-researcher.js';

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
    ['artist-stories', 'origin'], ['milestones', 'debut'],
  ]);
  assert.deepEqual(result.rejected.map((candidate) => candidate.reason), ['category', 'duplicate']);
});

test('an empty research result is a valid no-claim outcome', () => {
  const result = validateResearchCandidates(job, []);
  assert.deepEqual(result, { accepted: [], rejected: [] });
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
