import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegularStemStatusView } from './RegularStemStatusPanel';
import type { RegularStemStatus } from '../../lib/schemas.generated';

const data: RegularStemStatus = { audition: true, workingCache: false, trackLimit: 9, windows: [
  { trackId: 'private-id', side: 'tail', state: 'ready' },
  { trackId: 'incoming-id', side: 'head', state: 'running' },
] };
const render = (props: Parameters<typeof RegularStemStatusView>[0]) =>
  renderToStaticMarkup(createElement(RegularStemStatusView, props));

test('preparation distinguishes prepared windows from an armed seam without exposing track IDs', () => {
  const html = render({ data });
  assert.match(html, /Prepared stems do not mean a transition is armed/);
  assert.match(html, /Processing/);
  assert.match(html, /Prepared/);
  assert.doesNotMatch(html, /private-id|incoming-id/);
});

test('unknown, stale and empty preparation reads do not imply readiness', () => {
  assert.match(render({}), /Loading preparation status/);
  const failed = render({ data, error: true });
  assert.match(failed, /readiness is unknown/);
  assert.doesNotMatch(failed, /Prepared stems/);
  assert.match(render({ data: { ...data, windows: [] } }), /No current queue preparation requests/);
  assert.match(render({ data: { ...data, audition: false } }), /Existing stem settings still apply/);
});


test('working rollout explains that persistent caching is held while Sub/Beats remains separate', () => {
  const html=render({data:{...data,workingCache:true}});
  assert.match(html,/Regular Stem Blends use CPU preparation/);
  assert.match(html,/Saved values and existing files are retained/);
  assert.doesNotMatch(html,/Other tracks still use the existing stem settings/);
});
