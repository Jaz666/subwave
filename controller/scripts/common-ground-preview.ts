// Preview only: use an isolated station/library snapshot; never save or schedule plans.
import { randomInt } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config as loadDotEnv } from 'dotenv';
import { isolateStationState } from './test-utils/isolated-state.js';
import { resolveActiveStationDir } from '../src/stations/resolve.js';

const usage = 'Usage: npm run common-ground:preview -- [--list] [--host "Name or ID"] [--guest "Name or ID"] [--count 3] [--minutes 60]';
const options = new Map<string, string>();
for (let index = 2; index < process.argv.length; index++) {
  const flag = process.argv[index];
  if (flag === '--help' || flag === '-h') { console.log(usage); process.exit(0); }
  if (flag === '--list') { options.set(flag, 'true'); continue; }
  if (!['--host', '--guest', '--count', '--minutes'].includes(flag) || !process.argv[index + 1] || process.argv[index + 1].startsWith('--')) {
    throw new Error(usage);
  }
  options.set(flag, process.argv[++index]);
}
const count = Number(options.get('--count') ?? 3);
const minutes = Number(options.get('--minutes') ?? 60);
if (!Number.isInteger(count) || count < 1 || count > 20 || !Number.isInteger(minutes) || minutes < 1 || minutes > 360) {
  throw new Error('Use --count 1–20 and --minutes 1–360.');
}
loadDotEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env'), quiet: true });
const isolated = isolateStationState('subwave-common-ground-');
const source = resolveActiveStationDir(isolated.sourceRoot);
if (!existsSync(join(isolated.dir, 'settings.json'))) throw new Error('No station settings snapshot; set STATE_DIR to the station state root.');
for (const file of ['setup-config.json', 'blocklist.json']) {
  if (existsSync(join(source, file))) {
    copyFileSync(join(source, file), join(isolated.dir, file));
    chmodSync(join(isolated.dir, file), 0o600);
  }
}
// All runtime imports follow isolation so logs, caches and settings writes stay temporary.
const settings = await import('../src/settings.js');
const { loadSecretsIntoEnv } = await import('../src/setup/secrets.js');
const originalLog = console.log;
console.log = (...args) => console.error(...args);

async function main() {
  await loadSecretsIntoEnv();
  const { loadNavidromeConfig } = await import('../src/setup/config.js');
  await loadNavidromeConfig();
  await settings.load();
  const station = settings.get();
  const allowed = station.subShows?.eligibleHostPersonaIds;
  const eligible = station.personas.filter(persona => allowed == null || allowed.includes(persona.id));
  const identity = (persona: typeof eligible[number]) => ({ id: persona.id, name: persona.name });
  if (options.has('--list')) {
    process.stdout.write(JSON.stringify({ eligiblePersonas: eligible.map(identity) }, null, 2) + '\n');
    return;
  }
  if (eligible.length < 2) throw new Error('Common Ground needs at least two personas enabled in Random Hosts.');
  const find = (value: string | undefined) => {
    if (!value) return null;
    const matches = eligible.filter(persona => persona.id === value || persona.name.toLowerCase() === value.toLowerCase());
    if (matches.length !== 1) throw new Error(`“${value}” is not a unique eligible persona; use --list for allowed names and IDs.`);
    return matches[0];
  };
  const host = find(options.get('--host'));
  const guest = find(options.get('--guest'));
  if (host && guest && host.id === guest.id) throw new Error('Host and guest must be different personas.');
  const pairs: Array<[typeof eligible[number], typeof eligible[number]]> = [];
  for (const left of eligible) for (const right of eligible) {
    if (left.id === right.id || (host && left.id !== host.id) || (guest && right.id !== guest.id)) continue;
    if (!host && !guest && left.id > right.id) continue;
    pairs.push([left, right]);
  }
  for (let index = pairs.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [pairs[index], pairs[other]] = [pairs[other], pairs[index]];
  }
  if (!(host && guest) && count > pairs.length) throw new Error(`Only ${pairs.length} distinct eligible pairs are available; reduce --count.`);
  const selections = host && guest ? Array.from({ length: count }, () => pairs[0]) : pairs.slice(0, count);
  // SQLite's backup API includes committed WAL changes in a consistent snapshot.
  const db = new Database(join(source, 'library.db'), { readonly: true, fileMustExist: true });
  try { await db.backup(join(isolated.dir, 'library.db')); } finally { db.close(); }
  chmodSync(join(isolated.dir, 'library.db'), 0o600);
  station.llm.provider = 'openai-compatible';
  station.llm.model = process.env.SHOW_PLAN_PREVIEW_MODEL || '/models/Meta-Llama-3.1-8B-Instruct-Q5_K_M.gguf';
  station.llm.baseUrl = process.env.LLM_BASE_URL || 'http://qwen-llama-cpp:8080/v1';
  station.llm.compatibleMode = 'local';
  const { generateShowPlan, scheduledShowsForHost } = await import('../src/broadcast/show-generation.js');
  const { diagnoseShowCandidates } = await import('../src/music/show-candidates.js');
  const library = await import('../src/music/library.js');
  const runs: Array<Record<string, unknown>> = [];
  try {
    for (const [index, [host, guest]] of selections.entries()) {
      console.error(`Common Ground ${index + 1}/${selections.length}: ${host.name} + ${guest.name}`);
      const startsAt = Date.now();
      const minimumTracks = Math.ceil(minutes / 2); // twice airtime at four minutes per track
      try {
        const plan = await generateShowPlan({
          occurrence: { id: `common-ground-preview-${index}-${startsAt}`, startsAt, endsAt: startsAt + minutes * 60_000 },
          template: 'common-ground', planningPrompt: '', minimumCoverage: minimumTracks,
          cast: { hostPersonaId: host.id, guestPersonaIds: [guest.id] },
          show: { id: 'common-ground-preview' },
        });
        const coverage = await diagnoseShowCandidates({ ...plan, id: 'common-ground-preview' }, { at: startsAt });
        runs.push({ host: identity(host), guest: identity(guest),
          repertoire: [host, guest].map(persona => ({ ...identity(persona), shows: scheduledShowsForHost(persona.id, 'common-ground-preview') })),
          plan, coverage: { ...coverage, minimumTracks, meetsMinimum: coverage.warnings.some(warning => /not (?:present|counted|an active lock)|could not|failed to resolve/i.test(warning)) ? null : coverage.library.effective >= minimumTracks } });
      } catch (error) {
        runs.push({ host: identity(host), guest: identity(guest), error: error instanceof Error ? error.message : String(error) });
        process.exitCode = 1;
      }
    }
    process.stdout.write(JSON.stringify({ previewOnly: true, template: 'common-ground', minutes,
      policy: 'Strict genres and twice-airtime coverage are provisional for this preview; no plans are saved.',
      model: station.llm.model, eligiblePersonas: eligible.map(identity), runs }, null, 2) + '\n');
  } finally { library.shutdown(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; })
  .finally(() => { console.log = originalLog; process.exit(process.exitCode ?? 0); });
