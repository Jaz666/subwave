import { LLM_PROVIDER_CATALOG, type LlmProviderEntry } from '../../../lib/schemas.generated';

// Every table here derives from the provider catalogue
// (controller/src/schemas/providers.ts, mirrored by gen:schemas).

export type ProviderKind = LlmProviderEntry['kind'];

export interface ProviderMeta {
  id: string;
  // Short card name; LLM_PROVIDER_LABELS holds the longer dropdown descriptor.
  label: string;
  // One-line descriptor under the name — what the operator is choosing.
  blurb: string;
  // local: runs on a box you own, no key. self-hosted: your own
  // OpenAI-compatible server, key optional. cloud: hosted vendor, needs a key.
  kind: ProviderKind;
  // Controller env var the key is read from — cloud providers only.
  envVar?: string;
}

// Onboarding's order: on-box servers, then your own server, then vendors, then
// gateways. It is NOT the controller's settings.LLM_PROVIDERS (catalogue) order.
// Settings renders data.llm.providers (server-authoritative, server order) and
// looks each id up here, so a provider the server adds first still renders as a
// bare card; only onboarding renders in this order, through PROVIDER_IDS.
const onboardingRank = (p: LlmProviderEntry) =>
  p.kind === 'local' ? 0 : p.kind === 'self-hosted' ? 1 : p.group === 'vendor' ? 2 : 3;

export const PROVIDERS: ProviderMeta[] = [...LLM_PROVIDER_CATALOG]
  .sort((a, b) => onboardingRank(a) - onboardingRank(b))
  .map(({ id, label, blurb, kind, envVar }) => ({ id, label, blurb, kind, ...(envVar ? { envVar } : {}) }));

export const PROVIDER_META: Record<string, ProviderMeta> = Object.fromEntries(
  PROVIDERS.map(p => [p.id, p]),
);

// Default render order (local first). Settings passes the server's list instead.
export const PROVIDER_IDS: string[] = PROVIDERS.map(p => p.id);

// Derived from PROVIDERS so the two never drift.
export const LLM_ENV_VARS: Record<string, string> = Object.fromEntries(
  PROVIDERS.filter(p => p.envVar).map(p => [p.id, p.envVar as string]),
);

// Longer descriptors for the dropdown and the "Routing now" banner.
export const LLM_PROVIDER_LABELS: Record<string, string> = Object.fromEntries(
  LLM_PROVIDER_CATALOG.map(p => [p.id, p.longLabel]),
);

// Embedding model suggestions per provider, for the Library model picker. dim
// is shown so an already-tagged library can be matched.
export const EMBED_MODEL_SUGGESTIONS: Record<string, { id: string; dim: number }[]> = Object.fromEntries(
  LLM_PROVIDER_CATALOG.flatMap(p => (p.embedding?.suggestions ? [[p.id, [...p.embedding.suggestions]]] : [])),
);

export const llmProviderLabel = (id: string | undefined): string =>
  (id && LLM_PROVIDER_LABELS[id]) || id || '—';

export type ProviderStatusTone = 'ok' | 'warn';
export interface ProviderStatus {
  label: string;
  tone: ProviderStatusTone;
}

// Local providers are always "ready" (no key to miss) and a self-hosted
// OpenAI-compatible server's bearer is optional. The one `warn` case is a cloud
// provider whose key var isn't set. keyAware=false is the onboarding case:
// first-run has no live controller env, so cloud providers read as a neutral
// "needs key" rather than a red "no key".
export function providerStatus(
  id: string,
  env: Record<string, unknown> | undefined,
  keyAware = true,
): ProviderStatus {
  const meta = PROVIDER_META[id];
  if (!meta) return { label: '', tone: 'ok' };
  switch (meta.kind) {
    case 'local':
      return { label: 'local', tone: 'ok' };
    case 'self-hosted':
      return { label: 'self-host', tone: 'ok' };
    case 'cloud':
      if (!keyAware) return { label: 'needs key', tone: 'ok' };
      return meta.envVar && (env || {})[meta.envVar]
        ? { label: 'key set', tone: 'ok' }
        : { label: 'no key', tone: 'warn' };
    default:
      return { label: '', tone: 'ok' };
  }
}
