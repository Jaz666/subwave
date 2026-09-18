// Process-wide activity marker for named agent runs. Background LLM work uses
// this to yield to interactive station decisions without importing picker code.

let activeRuns = 0;

export function agentWorkActive(): boolean {
  return activeRuns > 0;
}

export async function withAgentActivity<T>(work: () => Promise<T>): Promise<T> {
  activeRuns++;
  try {
    return await work();
  } finally {
    activeRuns--;
  }
}
