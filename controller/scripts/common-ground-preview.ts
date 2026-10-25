// Preview only: use an isolated station/library snapshot; never save or schedule plans.
import { randomInt } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config as loadDotEnv } from 'dotenv';
import { isolateStationState } from './test-utils/isolated-state.js';
import { resolveActiveStationDir } from '../src/stations/resolve.js';

const usage = 'Usage: npm run common-ground:preview -- [--template dj-choice|deep-discovery|common-ground|outside-comfort-zone|time-capsule] [--fresh-user] [--music-lean "Musical preferences"] [--soul "Persona Soul"] [--list] [--host "Name or ID"] [--guest "Name or ID"] [--count 3] [--minutes 60]';
const options = new Map<string, string>();
for (let index = 2; index < process.argv.length; index++) {
  const flag = process.argv[index];
  if (flag === '--help' || flag === '-h') { console.log(usage); process.exit(0); }
  if (flag === '--list' || flag === '--fresh-user') { options.set(flag, 'true'); continue; }
  if (!['--template', '--host', '--guest', '--count', '--minutes', '--music-lean', '--soul'].includes(flag) || !process.argv[index + 1] || process.argv[index + 1].startsWith('--')) {
    throw new Error(usage);
  }
  options.set(flag, process.argv[++index]);
}
const template = options.get('--template') ?? 'common-ground';
if (!['dj-choice', 'deep-discovery', 'common-ground', 'outside-comfort-zone', 'time-capsule'].includes(template)) throw new Error('Unknown preview template');
const fresh = options.has('--fresh-user');
if (!fresh && (options.has('--music-lean') || options.has('--soul'))) throw new Error('Persona overrides require --fresh-user.');
if (fresh && options.has('--guest')) throw new Error('Fresh-user previews use the default guest policy; omit --guest.');
const outside = template === 'outside-comfort-zone';
const solo = outside || template === 'time-capsule';
const previewId = `${template}-preview`;
if (solo && options.has('--guest')) throw new Error('This preview uses a solo host; omit --guest.');
const count = Number(options.get('--count') ?? (fresh ? 3 : solo ? 4 : 3));
const minutes = Number(options.get('--minutes') ?? 60);
if (!Number.isInteger(count) || count < 1 || count > 20 || !Number.isInteger(minutes) || minutes < 1 || minutes > 360) {
  throw new Error('Use --count 1–20 and --minutes 1–360.');
}
loadDotEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env'), quiet: true });
const isolated = isolateStationState('subwave-show-preview-');
const source = resolveActiveStationDir(isolated.sourceRoot);
if (!existsSync(join(isolated.dir, 'settings.json'))) throw new Error('No station settings snapshot; set STATE_DIR to the station state root.');
for (const file of ['setup-config.json', 'blocklist.json']) {
  if ((!fresh || file !== 'blocklist.json') && existsSync(join(source, file))) {
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
  if (fresh) {
    const { DEFAULTS } = await import('../src/settings/defaults.js');
    writeFileSync(join(isolated.dir, 'settings.json'), JSON.stringify(DEFAULTS), { mode: 0o600 });
    writeFileSync(join(isolated.dir, 'schedule.json'), JSON.stringify(DEFAULTS.schedule), { mode: 0o600 });
  }
  await settings.load();
  const station = settings.get();
  if (fresh) for (const persona of station.personas) {
    if (options.has('--music-lean')) persona.musicLean = options.get('--music-lean')!;
    if (options.has('--soul')) persona.soul = options.get('--soul')!;
  }
  const allowed = station.subShows?.eligibleHostPersonaIds;
  if (fresh && (station.personas.length !== 3 || station.shows.length || Object.values(station.schedule).some(day => !Array.isArray(day) || day.some(Boolean)))) {
    throw new Error('Fresh-user fixture must have three default personas, no shows and an empty schedule');
  }
  const eligible = station.personas.filter(persona => allowed == null || allowed.includes(persona.id));
  const identity = (persona: typeof eligible[number]) => ({ id: persona.id, name: persona.name });
  if (options.has('--list')) {
    process.stdout.write(JSON.stringify({ eligiblePersonas: eligible.map(identity) }, null, 2) + '\n');
    return;
  }
  if (eligible.length < (solo ? 1 : 2)) throw new Error('Not enough eligible personas enabled in Random Hosts.');
  const find = (value: string | undefined) => {
    if (!value) return null;
    const matches = eligible.filter(persona => persona.id === value || persona.name.toLowerCase() === value.toLowerCase());
    if (matches.length !== 1) throw new Error(`“${value}” is not a unique eligible persona; use --list for allowed names and IDs.`);
    return matches[0];
  };
  const host = find(options.get('--host'));
  const guest = find(options.get('--guest'));
  if (host && guest && host.id === guest.id) throw new Error('Host and guest must be different personas.');
  const pairs: Array<[typeof eligible[number], typeof eligible[number] | null]> = [];
  if (solo || fresh) {
    for (const persona of eligible) if (!host || persona.id === host.id) pairs.push([persona, null]);
  }
  if (!solo && !fresh) for (const left of eligible) for (const right of eligible) {
    if (left.id === right.id || (host && left.id !== host.id) || (guest && right.id !== guest.id)) continue;
    if (!host && !guest && left.id > right.id) continue;
    pairs.push([left, right]);
  }
  for (let index = pairs.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [pairs[index], pairs[other]] = [pairs[other], pairs[index]];
  }
  const fixed = solo || fresh ? !!host : !!(host && guest);
  if (!fixed && count > pairs.length) throw new Error(`Only ${pairs.length} distinct eligible selections are available; reduce --count.`);
  const selections = fixed ? Array.from({ length: count }, () => pairs[0]) : pairs.slice(0, count);
  // SQLite's backup API includes committed WAL changes in a consistent snapshot.
  const db = new Database(join(source, 'library.db'), { readonly: true, fileMustExist: true });
  try { await db.backup(join(isolated.dir, 'library.db')); } finally { db.close(); }
  chmodSync(join(isolated.dir, 'library.db'), 0o600);
  station.llm.provider = 'openai-compatible';
  station.llm.model = process.env.SHOW_PLAN_PREVIEW_MODEL || '/models/Meta-Llama-3.1-8B-Instruct-Q5_K_M.gguf';
  station.llm.baseUrl = process.env.LLM_BASE_URL || 'http://qwen-llama-cpp:8080/v1';
  station.llm.compatibleMode = 'local';
  const { generateShowPlan, scheduledShowsForHost, resolveGeneratedShowCast } = await import('../src/broadcast/show-generation.js');
  const { generateAcceptedShowPlan } = fresh ? await import('../src/broadcast/show-preparation.js') : { generateAcceptedShowPlan: null };
  const { diagnoseShowCandidates } = await import('../src/music/show-candidates.js');
  const library = await import('../src/music/library.js');
  const { ShowPlanningError } = await import('../src/broadcast/show-planning-policy.js');
  const { recentCalls } = await import('../src/llm/log.js');
  const runs: Array<Record<string, unknown>> = [];
  const generation = { mode: 'generated', template, hostMode: 'random', guestMode: outside ? 'none' : 'random',
    guestCount: template === 'common-ground' ? { min: 1, max: 1 } : outside ? { min: 0, max: 0 } : { min: 0, max: 3 } };
  let randomCastingChecks = 0;
  if (fresh) for (let i = 0; i < 60; i++) {
    const cast = resolveGeneratedShowCast({ show: { generation }, occurrence: { id: `fresh-cast-${i}` }, personas: eligible });
    if (!cast || !eligible.some(p => p.id === cast.hostPersonaId)
      || new Set([cast.hostPersonaId, ...cast.guestPersonaIds]).size !== 1 + cast.guestPersonaIds.length
      || cast.guestPersonaIds.some(id => !eligible.some(p => p.id === id))
      || (outside && cast.guestPersonaIds.length !== 0)
      || (template === 'common-ground' && cast.guestPersonaIds.length !== 1)) throw new Error('Fresh-user random casting failed');
    randomCastingChecks++;
  }
  try {
    for (const [index, [host, guest]] of selections.entries()) {
      console.error(`${template} ${index + 1}/${selections.length}: ${host.name}${guest ? ` + ${guest.name}` : ''}`);
      const startsAt = Date.now();
      const minimumTracks = Math.ceil(minutes / 2); // twice airtime at four minutes per track
      try {
        const cast = fresh ? resolveGeneratedShowCast({ show: { personaId: host.id, generation: { ...generation, hostMode: 'fixed' } },
          occurrence: { id: `fresh-episode-${host.id}` }, personas: eligible }) : { hostPersonaId: host.id, guestPersonaIds: guest ? [guest.id] : [] };
        if (!cast) throw new Error('No eligible cast for this default persona');
        const input = {
          occurrence: { id: `${previewId}-${index}-${startsAt}`, showId: previewId, source: 'scheduled' as const, startsAt, endsAt: startsAt + minutes * 60_000 },
          template, planningPrompt: '', minimumCoverage: minimumTracks,
          cast, configuration: 'isolated-preview',
          show: { id: previewId },
        };
        const plan = generateAcceptedShowPlan ? await generateAcceptedShowPlan(input) : await generateShowPlan(input);
        let coverage: Awaited<ReturnType<typeof diagnoseShowCandidates>> | null = null;
        let softCoverage: Awaited<ReturnType<typeof diagnoseShowCandidates>> | null = null;
        let coverageError: string | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          [coverage, softCoverage] = await Promise.race([
            Promise.all([
              diagnoseShowCandidates({ ...plan, id: previewId }, { at: startsAt }),
              diagnoseShowCandidates({ ...plan, id: previewId, filtersStrict: false }, { at: startsAt }),
            ]),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Coverage lookup exceeded 30 seconds')), 30_000); }),
          ]);
        } catch (error) { coverageError = error instanceof Error ? error.message : String(error); }
        finally { clearTimeout(timer); }
        runs.push({ host: identity(host), guest: guest ? identity(guest) : null, guests: cast.guestPersonaIds.map(id => identity(eligible.find(p => p.id === id)!)),
          repertoire: (guest ? [host, guest] : [host]).map(persona => ({ ...identity(persona), shows: scheduledShowsForHost(persona.id, previewId) })),
          strictFilterComparison: coverage && softCoverage ? {
            strictEligible: coverage.library.effective,
            softEligible: softCoverage.library.effective,
            excludedByStrict: softCoverage.library.effective - coverage.library.effective,
            matchingShareOfSoftPool: softCoverage.library.effective ? coverage.library.effective / softCoverage.library.effective : null,
            note: 'Eligible library universes, not predicted airplay proportions. Recency, artist separation and journey state are not included.',
          } : null,
          conceptResponses: fresh ? recentCalls.filter(call => call.kind === 'generateShowPlan.concept').slice(0, 2).map(call => call.response) : undefined,
          plan, coverage: coverage
            ? { ...coverage, minimumTracks, meetsMinimum: coverage.warnings.some(warning => /not (?:present|counted|an active lock)|could not|failed to resolve/i.test(warning)) ? null : coverage.library.effective >= minimumTracks }
            : { error: coverageError, minimumTracks, meetsMinimum: null } });
      } catch (error) {
        const code = error instanceof ShowPlanningError ? error.code : null;
        const expectedStandDown = fresh && !options.has('--music-lean') && !options.has('--soul') && code === 'persona-readiness';
        runs.push({ host: identity(host), guest: guest ? identity(guest) : null, code, expectedStandDown, conceptResponses: fresh ? recentCalls.filter(call => call.kind === 'generateShowPlan.concept').slice(0, 2).map(call => call.response) : undefined, error: error instanceof Error ? error.message : String(error) });
        if (!expectedStandDown) process.exitCode = 1;
      }
    }
    process.stdout.write(JSON.stringify({ previewOnly: true, template, minutes, freshUser: fresh,
      fixture: fresh ? { source: 'shipped defaults', shows: station.shows.length, scheduledHours: 0, randomCastingChecks, optionalLeaningsPresent: eligible.some(p => !!p.musicLean?.trim()), acceptance: 'production coverage validation and retry' } : undefined,
      policy: template === 'time-capsule' ? 'Era-led preview; strict era and genres, twice-airtime coverage; no plans saved.' : outside
        ? 'Solo departure preview; strict genres and twice-airtime coverage; no plans are saved.'
        : 'Strict filters and twice-airtime coverage; no plans are saved.',
      model: station.llm.model, eligiblePersonas: eligible.map(identity), runs }, null, 2) + '\n');
  } finally { library.shutdown(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; })
  .finally(() => { console.log = originalLog; process.exit(process.exitCode ?? 0); });
