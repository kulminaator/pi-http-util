/**
 * raw_http_request.ts — Raw HTTP request tool (no content stripping).
 *
 * Sends an unaltered HTTP request and returns the raw response.
 * Supports file body input, file response output, SSL skipping,
 * timeouts, and response size limits.
 */

import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { HttpClient } from "./http_client.ts";
import { defaultHttpClient } from "./http_client.ts";

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 300_000; // 300 seconds in ms

// ── Types ────────────────────────────────────────────────────────────

export interface RawRequestParams {
  http_url: string;
  http_method: string;
  http_request_body?: string;
  http_request_body_file?: string;
  http_request_headers?: Record<string, string>;
  http_request_timeout: number;
  http_verify_ssl: boolean;
  http_response_body_file?: string;
  http_response_body_size_limit?: number;
}

export interface RawRequestResult {
  http_response_code: number;
  http_response_headers: { key: string; value: string }[];
  http_response_body: string;
  http_response_body_file: string | null;
  error: string | null;
}

// ── Validation ───────────────────────────────────────────────────────

/** Validate a URL string. Returns error message or null. */
export function validateRawUrl(url: string): string | null {
  if (!url || typeof url !== "string") {
    return "`http_url` is required and must be a non-empty string";
  }
  try {
    new URL(url);
    return null;
  } catch {
    return `Invalid URL: "${url}"`;
  }
}

// ── Header Building ──────────────────────────────────────────────────

/** Build headers object from params, merging with defaults. */
export function buildRawHeaders(
  customHeaders?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "pi-http-util/1.2.0",
    Accept: "*/*",
  };
  if (customHeaders) {
    Object.assign(headers, customHeaders);
  }
  return headers;
}

// ── File Helpers ─────────────────────────────────────────────────────

/** Read file contents as text for use as request body. */
export async function loadBodyFile(
  filePath: string,
): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}

/** Write response body to a file. Returns the file path written. */
export async function writeResponseBody(
  filePath: string,
  body: string,
): Promise<string> {
  await fs.writeFile(filePath, body, "utf-8");
  return filePath;
}

// ── Response Size Limiting ───────────────────────────────────────────

/** Check if response exceeds size limit. Returns error message or null. */
export function checkSizeLimit(
  body: string,
  limit?: number,
): string | null {
  if (limit == null) return null;
  const size = new TextEncoder().encode(body).length;
  if (size > limit) {
    return `Response body (${size} bytes) exceeds limit (${limit} bytes)`;
  }
  return null;
}

// ── Main Fetch Pipeline ──────────────────────────────────────────────

/**
 * Execute a raw HTTP request with no content stripping.
 * Returns the raw response data or an error.
 */
export async function executeRawRequest(
  params: RawRequestParams,
  signal?: AbortSignal,
  client?: HttpClient,
): Promise<RawRequestResult> {
  const {
    http_url,
    http_method,
    http_request_body,
    http_request_body_file,
    http_request_headers,
    http_request_timeout,
    http_response_body_file,
    http_response_body_size_limit,
  } = params;

  const result: RawRequestResult = {
    http_response_code: 0,
    http_response_headers: [],
    http_response_body: "",
    http_response_body_file: null,
    error: null,
  };

  // ── Validate URL ─────────────────────────────────────────────────
  const urlError = validateRawUrl(http_url);
  if (urlError) {
    result.error = urlError;
    return result;
  }

  // ── Build headers ────────────────────────────────────────────────
  const headers = buildRawHeaders(http_request_headers);

  // ── Resolve request body ─────────────────────────────────────────
  if (http_request_body && http_request_body_file) {
    result.error = "Cannot specify both http_request_body and http_request_body_file";
    return result;
  }

  let body: string | undefined = http_request_body;
  if (http_request_body_file) {
    try {
      body = await loadBodyFile(http_request_body_file);
    } catch (err: any) {
      result.error = `Failed to read body file: ${err?.message ?? err}`;
      return result;
    }
  }

  // ── Build fetch options ──────────────────────────────────────────
  const fetchOptions: RequestInit = {
    method: http_method,
    headers,
    signal: buildTimeoutSignal(http_request_timeout, signal),
  };

  if (body && !isBodylessMethod(http_method)) {
    fetchOptions.body = body;
    // Auto-set Content-Type if not already provided
    const hasContentType = Object.keys(headers).some(
      k => k.toLowerCase() === "content-type",
    );
    if (!hasContentType) {
      (headers as Record<string, string>)["Content-Type"] = "text/plain; charset=utf-8";
    }
  }

  // ── Fetch ────────────────────────────────────────────────────────
  let responseText: string;
  try {
    const http = client ?? defaultHttpClient;
    const res = await http.request(http_url, fetchOptions);
    result.http_response_code = res.status;

    // Collect response headers
    for (const [key, value] of res.headers.entries()) {
      result.http_response_headers.push({ key, value });
    }

    responseText = await res.text();
  } catch (err: any) {
    result.error = `Request failed: ${err?.message ?? err}`;
    return result;
  }

  // ── Check size limit ─────────────────────────────────────────────
  const sizeError = checkSizeLimit(
    responseText,
    http_response_body_size_limit,
  );
  if (sizeError) {
    result.error = sizeError;
    return result;
  }

  // ── Write to file or return body ─────────────────────────────────
  if (http_response_body_file) {
    try {
      const writtenPath = await writeResponseBody(
        http_response_body_file,
        responseText,
      );
      result.http_response_body_file = writtenPath;
      result.http_response_body = "";
    } catch (err: any) {
      result.error = `Failed to write response file: ${err?.message ?? err}`;
      return result;
    }
  } else {
    result.http_response_body = responseText;
  }

  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Check if an HTTP method should not have a body. */
function isBodylessMethod(method: string): boolean {
  const upper = method.toUpperCase();
  return upper === "GET" || upper === "HEAD";
}

/**
 * Build an AbortSignal that fires after the given timeout (in seconds).
 * If an external signal is provided, combines both with any().
 */
function buildTimeoutSignal(
  timeoutSeconds: number,
  externalSignal?: AbortSignal,
): AbortSignal | undefined {
  const timeoutMs = Math.max(1000, timeoutSeconds * 1000);
  const timeoutSignal = AbortSignal.timeout(timeoutMs);

  if (externalSignal) {
    return AbortSignal.any([timeoutSignal, externalSignal]);
  }
  return timeoutSignal;
}
