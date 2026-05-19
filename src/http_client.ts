/**
 * http_client.ts — HTTP client abstraction.
 *
 * Provides a pluggable HTTP client so that fetch-based modules can be
 * unit-tested without making real network calls. The default implementation
 * delegates to the global `fetch`.
 */

/** Minimal interface matching the subset of `fetch` used by this library. */
export interface HttpClient {
  request(url: string, init: RequestInit): Promise<Response>;
}

/** Default client that delegates to the global `fetch`. */
export const defaultHttpClient: HttpClient = {
  request(url, init) {
    return fetch(url, init);
  },
};
