import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = mkdtempSync(join(tmpdir(), 'subwave-research-broadcast-gate-'));
process.env.STATE_DIR = root;
const { queue } = await import('../src/broadcast/queue.js');
const { researchRunAllowed } = await import('../src/sleeve-notes/research-policy.js');
after(() => rmSync(root, { recursive: true, force: true }));

test('rendered speech waiting for a boundary leaves research available while active broadcast work still blocks it', t => {
  // Exercise the real queue methods without starting a watcher, mixer or TTS.
  const waiting = Object.create(Object.getPrototypeOf(queue));
  waiting.senderBusy = false;
  waiting.pickerBusy = false;
  waiting._introRenders = { busy: () => false };
  waiting._pendingVoice = { kind: 'station-id', t: 1234 };
  const allowed = () => researchRunAllowed({ playbackCriticalBusy: waiting.playbackCriticalBusy(),
    agentWorkActive: false, djCallsAllowed: true, pauseWhenEmpty: true,
    maintenanceWhenEmpty: false, listenerCount: 1 });
  assert.equal(allowed(), true, 'a deferred ident must not starve Genius or LLM research');
  assert.deepEqual(waiting.pendingVoiceTalk(), { kind: 'station-id', queuedAt: 1234 }, 'speech remains pending for normal delivery');
  waiting.senderBusy = true; assert.equal(allowed(), false);
  waiting.senderBusy = false; waiting.pickerBusy = true; assert.equal(allowed(), false);
  waiting.pickerBusy = false;
  t.mock.method(waiting._introRenders, 'busy', () => true);
  assert.equal(allowed(), false, 'active TTS rendering retains priority');
});
