/**
 * fetch.ts — Pure fetch + strip logic for http_fetch tool.
 *
 * Extracted so it can be unit-tested without depending on
 * typebox / pi-ai (which are only needed for tool registration).
 * Truncation and final text formatting are handled by the tool layer.
 */

import { resolveStripMethod, applyStrip, type StripMode } from "./strip.ts";
import type { HttpClient } from "./http_client.ts";
import { defaultHttpClient } from "./http_client.ts";

// ── Chrome User-Agent (generic, non-fingerprinting) ──────────────────
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// ── Defaults ─────────────────────────────────────────────────────────
export const DEFAULT_MAX_BYTES = 200_000;
export const DEFAULT_MAX_LINES = 5_000;

export interface FetchParams {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  followRedirects: boolean;
  strip: StripMode;
  signal?: AbortSignal;
  client?: HttpClient;
}

export interface FetchResult {
  finalUrl: string;
  httpStatusCode: number;
  headers: { key: string; value: string }[];
  contentType: string;
  requestedStripMethod: StripMode;
  appliedStripMethod: StripMode;
  rawText: string;
  strippedText: string;
  isError: boolean;
}

/**
 * Validate a URL string. Returns an error message if invalid, null if ok.
 */
export function validateUrl(url: string): string | null {
  if (!url || typeof url !== "string") {
    return "URL is required and must be a non-empty string";
  }
  try {
    new URL(url);
    return null;
  } catch {
    return `Invalid URL: "${url}". Must be a valid URL (e.g. https://example.com)`;
  }
}

/**
 * Build the default browser-like headers, merged with any custom headers.
 */
export function buildHeaders(customHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": CHROME_UA,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9," +
      "image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  };

  if (customHeaders) {
    Object.assign(headers, customHeaders);
  }

  return headers;
}

/**
 * Execute the fetch + strip pipeline. Returns raw data for the tool
 * to format, truncate, and present.
 */
export async function executeFetch(params: FetchParams): Promise<FetchResult> {
  const { url, method, headers, body, followRedirects, strip, signal } = params;

  // ── Build fetch options ─────────────────────────────────────────
  const fetchOptions: RequestInit = {
    method,
    headers,
    redirect: followRedirects ? "follow" : "manual",
    signal,
  };

  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    fetchOptions.body = body;
    // Clone headers to avoid mutating the caller's object
    if (!headers["Content-Type"]) {
      fetchOptions.headers = { ...headers, "Content-Type": "text/plain; charset=utf-8" };
    }
  }

  // ── Fetch ───────────────────────────────────────────────────────
  const client = params.client ?? defaultHttpClient;
  const res = await client.request(url, fetchOptions);

  const finalUrl = res.url;
  const status = res.status;
  const contentType = res.headers.get("Content-Type") ?? "unknown";

  // Collect response headers
  const responseHeaders: { key: string; value: string }[] = [];
  for (const [key, value] of res.headers.entries()) {
    responseHeaders.push({ key, value });
  }

  // Read as text (handles gzip/br automatically via undici)
  const rawText = await res.text();

  // ── Apply strip mode (fallback to none for non-HTML) ────────────
  const appliedStrip = resolveStripMethod(strip, contentType);
  const strippedText = applyStrip(rawText, appliedStrip);

  return {
    finalUrl,
    httpStatusCode: status,
    headers: responseHeaders,
    contentType,
    requestedStripMethod: strip,
    appliedStripMethod: appliedStrip,
    rawText,
    strippedText,
    isError: status >= 400,
  };
}
