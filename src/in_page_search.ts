/**
 * in_page_search.ts — Search a webpage for a substring and return context.
 *
 * Fetches a URL, decodes all text content (handling HTML entities),
 * searches for the target substring, extracts surrounding context with
 * proper HTML tag boundary awareness, strips via the chosen mode, and
 * returns a trimmed result.
 *
 * Most common usage: find a link on a page by its visible text.
 */

import { tokenize } from "./tokenizer.ts";
import { decodeTextEntities } from "./entities.ts";
import { isHtmlWhitespace } from "./whitespace.ts";
import {
  stripNone,
  stripWhitespace,
  stripAttributes,
  stripTags,
  stripHtmlToMd,
  resolveStripMethod,
} from "./strip.ts";
import { buildHeaders } from "./fetch.ts";
import { SEARCH_SKIP_ELEMENTS } from "./element_classification.ts";
import type { HttpClient } from "./http_client.ts";
import { defaultHttpClient } from "./http_client.ts";

// ── Defaults ─────────────────────────────────────────────────────────
const DEFAULT_CONTEXT_LIMIT = 100;
const CONTEXT_MULTIPLIER = 5; // grab 5x context before stripping

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Build a "decoded" version of the HTML text content along with a position
 * map that maps each character index in the decoded string back to its
 * original HTML offset.
 *
 * Uses the shared tokenizer for correct handling of comments, doctypes,
 * malformed tags, and CDATA elements (script/style/textarea).
 * Skips content inside <script> / <style> blocks.
 * Decodes all HTML entities so "Click&nbsp;here" becomes "Click here"
 * and can be found by searching for "Click here".
 * Normalizes HTML whitespace (nbsp, emsp, etc.) to regular spaces
 * so searches with regular spaces match entity-encoded whitespace.
 */
function buildDecodedMap(html: string): { decoded: string; positions: number[] } {
  const decodedParts: string[] = [];
  const positions: number[] = [];
  let inSkipElement = false;

  for (const token of tokenize(html)) {
    if (token.kind === "tag") {
      // Track skip elements (script, style)
      if (!token.isClosing && SEARCH_SKIP_ELEMENTS.has(token.name)) {
        inSkipElement = true;
      } else if (token.isClosing && inSkipElement) {
        inSkipElement = false;
      }
      continue; // tags themselves are not part of the decoded text
    }

    if (token.kind === "text" && !inSkipElement) {
      const decoded = decodeTextEntities(token.data);
      // Normalize HTML whitespace to regular spaces
      const normalized = decoded.split("").map(ch => isHtmlWhitespace(ch) ? " " : ch).join("");
      for (let j = 0; j < normalized.length; j++) {
        positions.push(token.start + j);
      }
      decodedParts.push(normalized);
    }
    // comments and doctypes are silently dropped
  }

  return { decoded: decodedParts.join(""), positions };
}

/**
 * Find all occurrences of `search` in `decoded` and return the original HTML
 * offsets of each match. Search is case-insensitive.
 */
function findMatches(
  decoded: string,
  positions: number[],
  search: string,
): { decodedStart: number; decodedEnd: number; htmlStart: number; htmlEnd: number }[] {
  const results: { decodedStart: number; decodedEnd: number; htmlStart: number; htmlEnd: number }[] = [];
  const lowerDecoded = decoded.toLowerCase();
  const lowerSearch = search.toLowerCase();
  let idx = 0;

  while (idx < lowerDecoded.length) {
    const found = lowerDecoded.indexOf(lowerSearch, idx);
    if (found === -1) break;

    results.push({
      decodedStart: found,
      decodedEnd: found + search.length,
      htmlStart: positions[found],
      htmlEnd: positions[found + search.length - 1] + 1,
    });
    idx = found + 1;
  }

  return results;
}

/**
 * Given a position inside an HTML string, find the start of the enclosing
 * tag if the position is inside one. Returns null if not inside a tag.
 *
 * Example: "<a href='foo'>text" at position 5 → returns 0 (start of <a>)
 */
function findEnclosingTagStart(html: string, pos: number): number | null {
  for (let i = pos - 1; i >= 0; i--) {
    if (html[i] === ">") return null; // past a closing >, not inside a tag
    if (html[i] === "<") return i;   // found the opening <
  }
  return null;
}

/**
 * Given a position inside an HTML string, find the end of the enclosing
 * tag if the position is inside one. Returns null if not inside a tag.
 */
function findEnclosingTagEnd(html: string, pos: number): number | null {
  for (let i = pos; i < html.length; i++) {
    if (html[i] === ">") return i + 1; // past the closing >
    if (html[i] === "<") return null;  // hit a new < before >, malformed — stop
  }
  return null;
}

/**
 * Extract a snippet from `html` around `[htmlStart, htmlEnd]` with
 * `expandChars` of context on each side, adjusted to avoid cutting
 * inside HTML tags.
 *
 * If the expanded start lands inside a tag, it backs up to include
 * the full tag. If the expanded end lands inside a tag, it extends
 * to include the full tag. After extraction, any unclosed tags at
 * the end are also completed by extending to their closing `>`.
 */
function extractWithBoundaries(
  html: string,
  htmlStart: number,
  htmlEnd: number,
  expandChars: number,
): string {
  // Expand outward
  let rawStart = Math.max(0, htmlStart - expandChars);
  let rawEnd = Math.min(html.length, htmlEnd + expandChars);

  // Adjust start: if inside a tag, back up to include the full tag
  const enclosingStart = findEnclosingTagStart(html, rawStart);
  if (enclosingStart !== null) {
    rawStart = enclosingStart;
  }

  // Adjust end: if inside a tag, extend to include the full tag
  const enclosingEnd = findEnclosingTagEnd(html, rawEnd);
  if (enclosingEnd !== null) {
    rawEnd = enclosingEnd;
  }

  let snippet = html.slice(rawStart, rawEnd);

  // Post-process: ensure no tag is cut off at the end.
  // Scan for any < in the snippet that lacks a matching > after it,
  // and extend rawEnd to include the closing >.
  while (snippet.includes("<")) {
    // Find the last < in the snippet
    const lastLt = snippet.lastIndexOf("<");
    const gtAfter = snippet.indexOf(">", lastLt);
    if (gtAfter !== -1) break; // last < has a matching >, we're good

    // The last < is unclosed — find its closing > in the original HTML
    const absLastLt = rawStart + lastLt;
    const closingGt = html.indexOf(">", absLastLt + 1);
    if (closingGt === -1) break; // no closing > found, give up

    // Extend to include the full tag
    rawEnd = closingGt + 1;
    snippet = html.slice(rawStart, rawEnd);
  }

  return snippet;
}

// ── Strip function lookup ────────────────────────────────────────────
const STRIP_FNS: Record<string, (s: string) => string> = {
  none: stripNone,
  whitespace: stripWhitespace,
  attributes: stripAttributes,
  tags: stripTags,
  html2md: stripHtmlToMd,
};

// ── Public API ───────────────────────────────────────────────────────

export interface InPageSearchParams {
  url: string;
  search: string;
  context_limit: number;
  strip: string;
}

export interface SearchResult {
  snippet: string;
  matchIndex: number;
  totalMatches: number;
}

/**
 * Fetch a page, search for a substring, and return stripped context snippets.
 */
export async function inPageSearch(
  params: InPageSearchParams,
  signal: AbortSignal | undefined,
  onUpdate?: (update: { content: { type: "text"; text: string }[] }) => void,
  client?: HttpClient,
): Promise<{
  results: SearchResult[];
  status: number;
  finalUrl: string;
  contentType: string;
  rawBytes: number;
  isError: boolean;
}> {
  const { url, search, context_limit, strip } = params;
  const expandChars = context_limit * CONTEXT_MULTIPLIER;

  // ── Build headers ────────────────────────────────────────────────
  const headers = buildHeaders();

  // ── Fetch ────────────────────────────────────────────────────────
  let responseText: string;
  let finalUrl: string;
  let status: number;
  let contentType: string;

  try {
    onUpdate?.({
      content: [{ type: "text", text: `Fetching ${url} ...` }],
    });

    const http = client ?? defaultHttpClient;
    const res = await http.request(url, {
      method: "GET",
      headers,
      redirect: "follow",
      signal,
    });

    finalUrl = res.url;
    status = res.status;
    contentType = res.headers.get("Content-Type") ?? "unknown";
    responseText = await res.text();
  } catch (err: any) {
    throw new Error(`Error fetching ${url}: ${err?.message ?? String(err)}`);
  }

  const rawBytes = new TextEncoder().encode(responseText).length;

  // ── Resolve strip mode based on Content-Type ─────────────────────
  const resolvedStrip = resolveStripMethod(strip as any, contentType);
  const stripFn = STRIP_FNS[resolvedStrip] ?? stripNone;

  // ── Build decoded text map ───────────────────────────────────────
  const { decoded, positions } = buildDecodedMap(responseText);

  // ── Find matches ─────────────────────────────────────────────────
  const matches = findMatches(decoded, positions, search);

  if (matches.length === 0) {
    return {
      results: [],
      status,
      finalUrl,
      contentType,
      rawBytes,
      isError: status >= 400,
    };
  }

  // ── Extract and strip each match ─────────────────────────────────
  const results: SearchResult[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];

    // Extract HTML snippet with tag-safe boundaries
    const snippetHtml = extractWithBoundaries(
      responseText,
      match.htmlStart,
      match.htmlEnd,
      expandChars,
    );

    // Apply strip mode
    const stripped = stripFn(snippetHtml);

    // Trim to actual requested context limit around the search term
    const strippedIdx = stripped.toLowerCase().indexOf(search.toLowerCase());
    if (strippedIdx !== -1) {
      let beforeStart = Math.max(0, strippedIdx - context_limit);
      let afterEnd = Math.min(
        stripped.length,
        strippedIdx + search.length + context_limit,
      );

      // If strip=none, ensure we don't cut inside HTML tags
      if (resolvedStrip === "none") {
        // Adjust beforeStart: if inside a tag, back up to tag start
        for (let p = beforeStart - 1; p >= 0; p--) {
          if (stripped[p] === ">") break;
          if (stripped[p] === "<") beforeStart = p;
        }
        // Adjust afterEnd: if inside a tag, extend to tag end
        for (let p = afterEnd; p < stripped.length; p++) {
          if (stripped[p] === ">") { afterEnd = p + 1; break; }
          if (stripped[p] === "<") { afterEnd = stripped.length; break; }
        }
      }

      results.push({
        snippet: stripped.slice(beforeStart, afterEnd),
        matchIndex: i + 1,
        totalMatches: matches.length,
      });
    } else {
      // Fallback: search term may have been transformed by strip mode
      // (e.g., html2md restructured the text). Return the stripped snippet as-is.
      results.push({
        snippet: stripped.length > context_limit * 2 + search.length
          ? stripped.slice(0, context_limit * 2 + search.length)
          : stripped,
        matchIndex: i + 1,
        totalMatches: matches.length,
      });
    }
  }

  return {
    results,
    status,
    finalUrl,
    contentType,
    rawBytes,
    isError: status >= 400,
  };
}
