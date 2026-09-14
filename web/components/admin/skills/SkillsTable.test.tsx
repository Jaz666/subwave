import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SkillReviewWarning } from './SkillReviewWarning';
import { SkillsTable } from './SkillsTable';

test('the list view exposes a legacy-input review warning', () => {
  const html = renderToStaticMarkup(createElement(SkillsTable, {
    skills: [{
      name: 'legacy-search',
      label: 'Legacy search',
      enabled: true,
      warning: 'Legacy tool.mjs inputs (query) now use the provider default input.',
    }],
    busy: null,
    assignmentLabel: () => 'All DJs',
    isPinned: () => false,
    sort: 'az',
    onSort: () => {},
    onEdit: () => {},
    onToggle: () => {},
    onRunNow: () => {},
  }));

  assert.match(html, />review needed</i);
});

test('the edit sheet exposes the full legacy-input review warning', () => {
  const warning = 'Legacy tool.mjs inputs (query) now use the provider default input.';
  const html = renderToStaticMarkup(createElement(SkillReviewWarning, { warning }));

  assert.match(html, /Skill review needed/);
  assert.match(html, new RegExp(warning.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
