import { handleRequest } from '../src/app';
import type { Deps } from '../src/deps';
import { BASE } from './session';

export function createApiClient({ deps, cookie }: { deps: Deps; cookie: string }) {
  return async function call(path: string, { method = 'GET', body }: { method?: string; body?: unknown } = {}) {
    const request = new Request(`${BASE}${path}`, {
      method,
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return handleRequest({ deps, request });
  };
}
