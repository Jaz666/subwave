import { V18_CONTROLLER_PATH_FIXTURES } from './v18-availability.js';
import { runModelScenario } from './model-runner.js';
import { scorePrediction } from './score.js';

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

const baseUrl = arg('base-url');
const model = arg('model');
const iterations = Math.max(1, Number.parseInt(arg('iterations') ?? '5', 10) || 5);
if (!baseUrl || !model) throw new Error('--base-url and --model are required');

const results = [];
for (let iteration = 1; iteration <= iterations; iteration++) {
  for (const scenario of V18_CONTROLLER_PATH_FIXTURES) {
    const prediction = await runModelScenario(scenario, { baseUrl, model, timeoutMs: 30_000 });
    const score = scorePrediction(scenario, prediction);
    results.push({ scenario: scenario.id, iteration, passed: score.passed, latencyMs: prediction.latencyMs, calls: prediction.calls, violations: Object.values(score.dimensions).flatMap(result => result?.violations ?? []) });
  }
}
const latencies = results.map(result => result.latencyMs).sort((left, right) => left - right);
const report = {
  format: 'subwave.functiongemma-v18-controller-path.v1', model, baseUrl, iterations,
  total: results.length, passed: results.filter(result => result.passed).length,
  unavailableToolSelections: results.filter(result => result.violations.some(violation => violation.includes('unoffered-tool'))).length,
  latency: { p50Ms: latencies[Math.floor(latencies.length * .5)], p95Ms: latencies[Math.max(0, Math.ceil(latencies.length * .95) - 1)], maximumMs: latencies.at(-1) },
  results,
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed === report.total ? 0 : 1;
