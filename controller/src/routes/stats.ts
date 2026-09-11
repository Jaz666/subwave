// Admin-gated GET /stats — rollups over four in-memory call rings (LLM, TTS,
// DJ-log, listener requests) for the Stats page. Since-boot and lossy on
// restart by design; the raw per-call lists stay on /debug.
import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { recentCalls } from '../llm/log.js';
import * as llmProvider from '../llm/provider.js';
import * as settings from '../settings.js';
import { ttsCalls, toolCalls, trackTransitions, summarizeLlm, summarizeTts, summarizeDjLog, summarizeRequests, summarizeDebug } from '../stats.js';
import { queue } from '../broadcast/queue.js';
import { recentRequests } from '../broadcast/request-log.js';
import { budgetStatus } from '../broadcast/dj-budget.js';
import { PICKER_TOOLS } from '../llm/internal/tools/picker/index.js';

export const router = express.Router();

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const llm: any = summarizeLlm(recentCalls);
    llm.provider = llmProvider.providerName();
    llm.activeModel = llmProvider.activeModelLabel();
    // Mirror of agentDeadline() in broadcast/dj-agent.ts — the dash anchors its
    // latency redline to it, so "red" means "hitting the pool-picker fallback".
    llm.agentTimeoutMs = settings.get().llm?.agentTimeoutMs ?? 45000;
    // Durable per-UTC-day tally, unlike the rings above. enabled:false with no cap.
    llm.budget = budgetStatus();

    // The skill loader imports the queue, which is itself part of controller
    // boot. Resolve it only for this admin request to avoid making /stats a
    // startup-cycle edge while still reflecting live skill rescans.
    const { loadedCapabilities } = await import('../skills/loader.js');
    res.json({
      t: new Date().toISOString(),
      llm,
      tts: summarizeTts(ttsCalls),
      djLog: summarizeDjLog(queue.djLog),
      requests: summarizeRequests(recentRequests),
      debug: summarizeDebug(toolCalls, trackTransitions, [
        ...PICKER_TOOLS.map(tool => tool.name),
        ...loadedCapabilities()
          .filter(cap => typeof cap.toolFn === 'function' && typeof cap.toolName === 'string')
          .map(cap => cap.toolName),
      ]),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
