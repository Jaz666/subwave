import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StemWaveformRow } from './StemWaveformRow';
import { waveformKeys, type StemTransition } from './stem-preview';

const transition: StemTransition = { kind: 'stem-blend', outgoingId: 'out', incomingId: 'in',
  durationSec: 12, incomingAtSec: 8, outgoingUntilSec: 8.3 };
const styles = { outgoingWave: 'outgoing', incomingWave: 'incoming' };

test('a failed incoming waveform leaves the loaded outgoing side visible with a targeted retry', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  try {
    client.setQueryData([...waveformKeys.stems(transition), 'drums', 'outgoing'], [.3, .7, .2]);
    const failed = client.getQueryCache().build(client, {
      queryKey: [...waveformKeys.stems(transition), 'drums', 'incoming'],
    });
    failed.setState({ status: 'error', error: new Error('temporary network failure'), fetchStatus: 'idle' });
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
      createElement(StemWaveformRow, { stem: 'drums', transition, styles, markers: [],
        adminFetch: async () => { throw new Error('Server render must not fetch'); } })));
    assert.match(html, /class="outgoing"/);
    assert.doesNotMatch(html, /class="incoming"/);
    assert.match(html, /Could not load incoming drums waveform/);
    assert.match(html, />Retry</);
    assert.doesNotMatch(html, /Loading drums/);
  } finally { client.clear(); }
});

test('a pending source does not hide a successfully loaded lane', () => {
  const client = new QueryClient();
  try {
    client.setQueryData([...waveformKeys.stems(transition), 'drums', 'outgoing'], [.5, .25]);
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
      createElement(StemWaveformRow, { stem: 'drums', transition, styles, markers: [],
        adminFetch: async () => { throw new Error('Server render must not fetch'); } })));
    assert.match(html, /class="outgoing"/);
    assert.match(html, /Loading drums waveforms/);
    assert.doesNotMatch(html, />Retry</);
  } finally { client.clear(); }
});
