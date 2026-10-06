import { AsyncLocalStorage } from 'node:async_hooks';

export interface CompatibleRequestOptions {
  cache_prompt?: boolean;
  repeat_penalty?: number;
}

const requestOptions = new AsyncLocalStorage<CompatibleRequestOptions>();

export function withCompatibleRequestOptions<T>(options: CompatibleRequestOptions,
  fn: () => Promise<T>): Promise<T> {
  return requestOptions.run(options, fn);
}

export function compatibleRequestOptions(): CompatibleRequestOptions {
  return requestOptions.getStore() ?? {};
}
