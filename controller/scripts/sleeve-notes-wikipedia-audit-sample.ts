// Deterministic, read-only manual audit packet for retained Wikipedia claims.
// Random category samples and targeted risk samples are separate so targeted
// cases cannot be mistaken for a representative quality estimate.

import Database from 'better-sqlite3';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { STATE_DIR } from '../src/config.js';
import { SLEEVE_NOTE_CATEGORIES } from '../src/sleeve-notes/researcher.js';

const RANDOM_PER_CATEGORY = 20;
const TARGETED_PER_PATTERN = 5;
const DEFAULT_SEED = 'sleeve-notes-wikipedia-audit-2026-10-01';

type ClaimRow = {
  id: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  category: string;
  topic: string;
  wording: string;
  shortWording: string;
  evidence: string;
  sourceUrl: string;
  revisionId: string | null;
};

const REVIEW_TEMPLATE = {
  sourceSupport: null as 'supported' | 'partial' | 'unsupported' | null,
  completeness: null as 'complete' | 'incomplete' | null,
  entityRelationshipClarity: null as 'clear' | 'unclear' | null,
  categoryTopicFit: null as 'fits' | 'does-not-fit' | null,
  listenerValue: null as 'high' | 'low' | null,
  decision: null as 'keep' | 'revise' | 'reject' | null,
  notes: '',
};

function option(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function stableRank(seed: string, claimId: string): string {
  return createHash('sha256').update(`${seed}\u0000${claimId}`).digest('hex');
}

function topicKey(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function targetedPatterns(claim: ClaimRow): string[] {
  const patterns: string[] = [];
  const wording = claim.wording.trim();
  const evidence = claim.evidence.trim();
  const topic = topicKey(claim.topic);
  const subject = topicKey(claim.entityName ?? '');
  if (/(?:\b(?:whose|which|who|that|when|where|with|to|of|in|for|and|but|their|his|her|its|they|he|she|it|was|were|is|are|from|by|as))\s*[.!?]?$/iu.test(evidence)
    || !/[.!?]["')\]]*$/u.test(evidence)) patterns.push('possibly truncated evidence');
  if (/^(?:their|his|her|its|they|he|she|it|this|that|these|those)\b/iu.test(wording)) patterns.push('pronoun-led wording');
  if (/\b(?:is|was)\s+(?:the\s+)?(?:debut|first|second|third|self-titled)?\s*(?:studio\s+)?(?:album|single|ep)\b/iu.test(wording)
    || /^\D{0,60}\b(?:in|released|formed)\s+(?:19|20)\d{2}[.!?]?$/iu.test(wording)) patterns.push('bare debut or date');
  if (topic === subject || /^(?:artist|biography|career|history|music|release|album|track|song)(?: story| stories)?$/iu.test(topic)) patterns.push('broad topic');
  if (/\b\d[\d,.]*(?:\s*(?:million|billion|copies|records|weeks|years|tracks|albums|singles|percent|%|thousand))?\b/iu.test(wording)
    || /\b(?:best|first|only|largest|biggest|most|least|highest|lowest|record[- ]breaking|all[- ]time)\b/iu.test(wording)) patterns.push('striking number or superlative');
  return patterns;
}

function reviewItem(claim: ClaimRow, sampleType: 'random' | 'targeted', patterns: string[] = []) {
  return {
    sampleType,
    matchedPatterns: patterns,
    ...claim,
    review: { ...REVIEW_TEMPLATE },
  };
}

function mdText(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([\\`*_{}\[\]()#+.!|~-])/g, '\\$1').replace(/\r?\n/g, '<br>');
}

function markdownClaim(claim: ReturnType<typeof reviewItem>, index: number): string[] {
  const identity = claim.entityName || claim.entityId;
  return [
    `### ${index + 1}. ${mdText(identity)} — ${mdText(claim.topic)}`,
    `**Category:** ${mdText(claim.category)}  `,
    `**Full:** ${mdText(claim.wording)}  `,
    `**Short anchors:** ${claim.shortWording ? mdText(claim.shortWording) : '_Not stored yet_'}  `,
    `**Evidence:** ${mdText(claim.evidence)}  `,
    `**Source:** <${claim.sourceUrl}> · revision `${mdText(claim.revisionId || 'unknown')}`  `,
    '**Review:** support [ ] supported [ ] partial [ ] unsupported · completeness [ ] complete [ ] incomplete · clarity [ ] clear [ ] unclear · fit [ ] fits [ ] wrong · listener value [ ] high [ ] low · decision [ ] keep [ ] revise [ ] reject',
    '**Notes:**',
    '',
  ];
}

async function main() {
  const seed = option('seed', DEFAULT_SEED);
  const outputPath = resolve(option(
    'out',
    resolve(STATE_DIR, 'sleeve-notes-research-previews', `wikipedia-audit-${seed.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`),
  ));
  const markdownPath = outputPath.endsWith('.json') ? outputPath.slice(0, -5) + '.md' : `${outputPath}.md`;
  if (existsSync(outputPath) || existsSync(markdownPath)) throw new Error(`Refusing to overwrite existing audit packet: ${outputPath}`);
  const db = new Database(resolve(STATE_DIR, 'sleeve-notes.db'), {
    readonly: true, fileMustExist: true, timeout: 10_000,
  });
  const hasShortWording = (db.pragma('table_info(sleeve_claims)') as Array<{ name: string }>)
    .some((column) => column.name === 'short_wording');
  const shortSelection = hasShortWording ? 'claim.short_wording' : "''";
  const rows = db.prepare(`SELECT claim.id, claim.entity_type AS entityType,
      claim.entity_id AS entityId,
      CASE claim.entity_type
        WHEN 'artist' THEN (SELECT artist.name FROM sleeve_artists artist WHERE artist.id = claim.entity_id)
        WHEN 'recording' THEN (SELECT recording.title FROM sleeve_recordings recording WHERE recording.id = claim.entity_id)
        WHEN 'release' THEN (SELECT release.title FROM sleeve_releases release WHERE release.id = claim.entity_id)
        WHEN 'release-group' THEN (SELECT MIN(release.title) FROM sleeve_releases release WHERE release.musicbrainz_release_group_id = claim.entity_id)
        ELSE NULL
      END AS entityName,
      claim.category, claim.topic, claim.wording, ${shortSelection} AS shortWording,
      claim.evidence, source.source_url AS sourceUrl, source.revision_id AS revisionId
    FROM sleeve_claims claim
    JOIN sleeve_source_documents source ON source.id = claim.source_document_id
    WHERE claim.enabled = 1 AND source.provider = 'wikipedia'
    ORDER BY claim.category, claim.id`).all() as ClaimRow[];

  const randomByCategory = Object.fromEntries(SLEEVE_NOTE_CATEGORIES.map((category) => {
    const pool = rows.filter((claim) => claim.category === category)
      .sort((a, b) => stableRank(seed, a.id).localeCompare(stableRank(seed, b.id)));
    return [category, pool.slice(0, RANDOM_PER_CATEGORY).map((claim) => reviewItem(claim, 'random'))];
  }));
  const targeted = [
    'possibly truncated evidence', 'pronoun-led wording', 'bare debut or date',
    'broad topic', 'striking number or superlative',
  ].map((pattern) => ({
    pattern,
    claims: rows.filter((claim) => targetedPatterns(claim).includes(pattern))
      .sort((a, b) => stableRank(`${seed}:${pattern}`, a.id).localeCompare(stableRank(`${seed}:${pattern}`, b.id)))
      .slice(0, TARGETED_PER_PATTERN)
      .map((claim) => reviewItem(claim, 'targeted', [pattern])),
  }));
  const randomCount = Object.values(randomByCategory).reduce((count, items) => count + items.length, 0);
  const targetedCount = targeted.reduce((count, group) => count + group.claims.length, 0);
  const packet = {
    format: 'subwave-sleeve-notes-wikipedia-audit-v1',
    createdAt: new Date().toISOString(),
    seed,
    currentEnabledWikipediaClaims: rows.length,
    reviewGuidance: {
      labels: ['source support', 'completeness', 'entity/relationship clarity', 'category/topic fit', 'listener value', 'keep/revise/reject'],
      randomSamplesAreRepresentativeOnlyWithinEachPopulatedCategory: true,
      targetedSamplesAreDiagnosticAndNotRepresentative: true,
      reminder: 'Judge each wording against its quoted evidence and frozen source revision. Do not use outside knowledge as support.',
    },
    randomByCategory,
    targeted,
    counts: { random: randomCount, targeted: targetedCount, totalReviewEntries: randomCount + targetedCount },
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  const markdown: string[] = [
    '# Wikipedia Sleeve Notes audit sample',
    '',
    `Enabled Wikipedia claims: **${rows.length}** · random samples: **${randomCount}** · targeted samples: **${targetedCount}**`,
    '',
    `Seed: \`${mdText(seed)}\``,
    '',
    'The random entries are separated by populated category. The targeted cases are diagnostic and do not estimate overall quality. Judge each claim against its evidence and source revision; do not use outside knowledge.',
    '',
    '## Random sample by category',
    '',
  ];
  for (const [category, items] of Object.entries(randomByCategory)) {
    markdown.push(`## ${mdText(category)} (${items.length})`, '');
    items.forEach((claim, index) => markdown.push(...markdownClaim(claim, index)));
  }
  markdown.push('## Targeted cases', '');
  for (const group of targeted) {
    markdown.push(`### ${mdText(group.pattern)} (${group.claims.length})`, '');
    group.claims.forEach((claim, index) => markdown.push(...markdownClaim(claim, index)));
  }
  await writeFile(markdownPath, `${markdown.join('\n')}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  db.close();
  console.log(`Audit packet saved: ${outputPath} and ${markdownPath}`);
  console.log(`${rows.length} enabled Wikipedia claims; ${randomCount} random category entries and ${targetedCount} targeted entries.`);
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exit(1);
});
