import assert from 'node:assert/strict';
import test from 'node:test';
import { validateResearchCandidates, type ResearchJob } from '../src/sleeve-notes/researcher.js';
import { candidatesFromResearchResult, researchOutcomeDebug } from '../src/sleeve-notes/llm-researcher.js';

const job: ResearchJob = {
  id: 'research-1',
  document: {
    id: 'source-1', entityId: 'artist-1', provider: 'wikipedia',
    sourceUrl: 'https://en.wikipedia.org/wiki/Example', revisionId: '123',
    text: 'The Example Band formed after friends met in Liverpool in 1980. Their debut album arrived in 1982.',
  },
  categories: ['artist-stories', 'milestones'],
  maxCandidates: 3,
};

test('researcher output must be grounded in the supplied source document', () => {
  const result = validateResearchCandidates(job, [{
    category: 'artist-stories', topic: 'origin', wording: 'The Example Band formed after friends met in Liverpool in 1980.',
    evidence: 'The Example Band formed after friends met in Liverpool in 1980.',
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
    category: 'artist-stories', topic: 'origin', wording: 'The Example Band formed after friends met in Liverpool in 1980.',
    evidence: 'The Example Band formed after friends met in Liverpool in 1980.',
  }, {
    category: 'artist-stories', topic: 'ORIGIN', wording: 'They began after friends met in Liverpool in 1980.',
    evidence: 'The Example Band formed after friends met in Liverpool in 1980.',
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

test('researcher retains up to five distinct supported notes for a rich source', () => {
  const evidenceJob = { ...job, maxCandidates: 5, document: { ...job.document, text: [
    'The Example Band formed after its singer answered a newspaper advert.',
    'Its debut album was recorded with Producer Alpha after a late-night session.',
    'The band wrote Song Journey during a train journey to Glasgow.',
    'Artist Three joined after meeting the group at a festival.',
    'Their fourth album used a children\'s choir on Track Five.',
  ].join(' ') } };
  const result = validateResearchCandidates(evidenceJob, [
    { category: 'artist-stories', topic: 'advert', wording: 'The Example Band formed after its singer answered a newspaper advert.', evidence: 'The Example Band formed after its singer answered a newspaper advert.' },
    { category: 'milestones', topic: 'debut session', wording: 'Its debut album was recorded with Producer Alpha after a late-night session.', evidence: 'Its debut album was recorded with Producer Alpha after a late-night session.' },
    { category: 'artist-stories', topic: 'train song', wording: 'The band wrote Song Journey during a train journey to Glasgow.', evidence: 'The band wrote Song Journey during a train journey to Glasgow.' },
    { category: 'artist-stories', topic: 'festival member', wording: 'Artist Three joined after meeting the group at a festival.', evidence: 'Artist Three joined after meeting the group at a festival.' },
    { category: 'milestones', topic: 'choir', wording: 'Their fourth album used a children\'s choir on Track Five.', evidence: 'Their fourth album used a children\'s choir on Track Five.' },
  ]);
  assert.equal(result.accepted.length, 5);
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

test('researcher completes an unfinished verbatim wording fragment from its evidence', () => {
  const evidenceJob = { ...job, document: { ...job.document, text: [
    'In 1990, the Beautiful South released their second album, Choke.',
    'The album also provided the band\'s only Number 1 hit, a Hemingway/Corrigan duet called "A Little Time".',
    'They broke up in January 2007, saying the split was due to "musical similarities", having sold around 15 million records.',
  ].join(' ') } };
  const result = validateResearchCandidates(evidenceJob, [{
    category: 'milestones', topic: 'number one',
    wording: 'The album also provided the band\'s only Number 1 hit, a Hemingway/Corrigan duet called',
    evidence: 'The album also provided the band\'s only Number 1 hit, a Hemingway/Corrigan duet called "A Little Time".',
  }, {
    category: 'artist-stories', topic: 'split',
    wording: 'They broke up in January 2007, saying the split was due to',
    evidence: 'They broke up in January 2007, saying the split was due to "musical similarities", having sold around 15 million records.',
  }]);
  assert.deepEqual(result.accepted.map((candidate) => candidate.wording), [
    'The album also provided the band\'s only Number 1 hit, a Hemingway/Corrigan duet called "A Little Time".',
    'They broke up in January 2007, saying the split was due to "musical similarities", having sold around 15 million records.',
  ]);
});

test('researcher does not replace a complete paraphrase with its evidence', () => {
  const evidenceJob = { ...job, document: { ...job.document, text: 'The Example Band formed after friends met in Liverpool in 1980, before touring Europe.' } };
  const result = validateResearchCandidates(evidenceJob, [{
    category: 'artist-stories', topic: 'origin', wording: 'The Example Band formed after friends met in Liverpool in 1980.',
    evidence: 'The Example Band formed after friends met in Liverpool in 1980, before touring Europe.',
  }]);
  assert.equal(result.accepted[0]?.wording, 'The Example Band formed after friends met in Liverpool in 1980.');
});

test('researcher rejects generic biography metadata but keeps a specific story', () => {
  const evidenceJob = { ...job, document: { ...job.document, text: [
    'The Example Band formed in Liverpool in 1980.',
    'The American heavy metal band Saviours was formed in Oakland, California, in 2004.',
    'The Example Band have released 3 studio albums.',
    'The Example Band have had 7 top five hits in Ireland.',
    'They were inducted into the Rock and Roll Hall of Fame in 2022.',
    'The band formed after its singer answered a newspaper advert in Liverpool in 1980.',
  ].join(' ') } };
  const result = validateResearchCandidates(evidenceJob, [{
    category: 'artist-stories', topic: 'formation', wording: 'The Example Band formed in Liverpool in 1980.',
    evidence: 'The Example Band formed in Liverpool in 1980.',
  }, {
    category: 'artist-stories', topic: 'metal formation', wording: 'The American heavy metal band Saviours was formed in Oakland, California, in 2004.',
    evidence: 'The American heavy metal band Saviours was formed in Oakland, California, in 2004.',
  }, {
    category: 'milestones', topic: 'discography', wording: 'The Example Band have released 3 studio albums.',
    evidence: 'The Example Band have released 3 studio albums.',
  }, {
    category: 'milestones', topic: 'chart tally', wording: 'The Example Band have had 7 top five hits in Ireland.',
    evidence: 'The Example Band have had 7 top five hits in Ireland.',
  }, {
    category: 'milestones', topic: 'recognition', wording: 'They were inducted into the Rock and Roll Hall of Fame in 2022.',
    evidence: 'They were inducted into the Rock and Roll Hall of Fame in 2022.',
  }, {
    category: 'artist-stories', topic: 'advert', wording: 'The band formed after its singer answered a newspaper advert in Liverpool in 1980.',
    evidence: 'The band formed after its singer answered a newspaper advert in Liverpool in 1980.',
  }]);
  assert.deepEqual(result.accepted.map((candidate) => candidate.topic), ['advert']);
  assert.deepEqual(result.rejected.map((candidate) => candidate.reason), ['editorial', 'editorial', 'editorial', 'editorial', 'editorial']);
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

test('researcher blocks category bypasses and sensitive personal facts', () => {
  const evidenceJob = { ...job, document: { ...job.document, text: [
    'Their debut album, Letter to Self, was released in January 2024 to widespread critical acclaim.',
    'Idina Menzel\'s parents divorced when she was a toddler.',
    'Graeme Kelling died from pancreatic cancer in 2004.',
  ].join(' ') } };
  const result = validateResearchCandidates(evidenceJob, [{
    category: 'artist-stories', topic: 'debut',
    wording: 'Their debut album, Letter to Self, was released in January 2024 to widespread critical acclaim.',
    evidence: 'Their debut album, Letter to Self, was released in January 2024 to widespread critical acclaim.',
  }, {
    category: 'artist-stories', topic: 'family',
    wording: 'Idina Menzel\'s parents divorced when she was a toddler.',
    evidence: 'Idina Menzel\'s parents divorced when she was a toddler.',
  }, {
    category: 'artist-stories', topic: 'death',
    wording: 'Graeme Kelling died from pancreatic cancer in 2004.',
    evidence: 'Graeme Kelling died from pancreatic cancer in 2004.',
  }]);
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.rejected.map((candidate) => candidate.reason), ['bare-milestone', 'unsupported', 'editorial']);
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
