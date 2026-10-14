// The gate shared by every future admission point. Keeping the disabled answer
// pure makes it impossible for a caller to "just try" a provider while the
// station-wide switch is off.
export function collectionPlan(input: { enabled: boolean; providerConfigured: boolean }):
  | { run: false; reason: 'disabled' | 'provider-unconfigured' }
  | { run: true } {
  if (!input.enabled) return { run: false, reason: 'disabled' };
  if (!input.providerConfigured) return { run: false, reason: 'provider-unconfigured' };
  return { run: true };
}
