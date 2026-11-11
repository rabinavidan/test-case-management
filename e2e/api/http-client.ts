import type { APIRequestContext, APIResponse } from '@playwright/test';

/** A non-2xx response from a setup/teardown call: fail loudly, with the body. */
export class ApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`${method} ${path} → ${status}: ${body.slice(0, 500)}`);
    this.name = 'ApiError';
  }
}

type Params = Record<string, string | number | boolean>;

/**
 * Thin authenticated transport over Playwright's APIRequestContext.
 *
 * Every call throws ApiError on a non-2xx status, so test *setup* can never
 * silently continue with an `undefined` id the way `(await res.json()).id`
 * did. Specs that verify an API's error responses on purpose (api.spec.ts,
 * contract.spec.ts) keep using `request` directly — that is their subject.
 */
export class HttpClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly token: string,
  ) {}

  get<T>(path: string, params?: Params): Promise<T> {
    return this.send<T>('GET', path, () => this.request.get(path, { headers: this.headers(), params }));
  }

  post<T>(path: string, data?: unknown): Promise<T> {
    return this.send<T>('POST', path, () => this.request.post(path, { headers: this.headers(), data }));
  }

  put<T>(path: string, data?: unknown): Promise<T> {
    return this.send<T>('PUT', path, () => this.request.put(path, { headers: this.headers(), data }));
  }

  delete(path: string): Promise<void> {
    return this.send<void>('DELETE', path, () => this.request.delete(path, { headers: this.headers() }));
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
  }

  private async send<T>(method: string, path: string, call: () => Promise<APIResponse>): Promise<T> {
    const res = await call();
    if (!res.ok()) throw new ApiError(method, path, res.status(), await res.text());
    if (res.status() === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}
