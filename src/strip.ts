/**
 * strip.ts — HTML content strip modes.
 *
 * Pure functions for transforming HTML content:
 * - stripNone: identity (no transformation)
 * - stripWhitespace: collapse multi-whitespace to single space
 * - stripAttributes: remove HTML attributes, collapse whitespace
 * - stripTags: remove all HTML tags, decode entities, collapse whitespace
 * - stripHtmlToMd: convert HTML to Markdown (SAX-style event-driven)
 *
 * All functions are side-effect-free and fully unit-testable.
 */

import { tokenize, type Token } from "./tokenizer.ts";
import { decodeTextEntities } from "./entities.ts";
import { isHtmlWhitespace, collapseWhitespace, collapseWhitespacePreserveLines } from "./whitespace.ts";
import { emitEvents } from "./md_emitter.ts";
import { processEvents } from "./md_handler.ts";
import { SEARCH_SKIP_ELEMENTS } from "./element_classification.ts";

export type StripMode = "none" | "whitespace" | "attributes" | "tags" | "html2md";

/**
 * Determine whether a strip mode should be applied based on the response Content-Type.
 * Non-HTML content is never stripped (falls back to "none"), except when
 * the caller explicitly requested "none".
 */
export function resolveStripMethod(
  requested: StripMode,
  contentType: string,
): StripMode {
  if (requested === "none") return "none";
  const lower = contentType.toLowerCase();
  const isHtml = lower.includes("text/html") || lower.includes("application/xhtml+xml");
  return isHtml ? requested : "none";
}

/**
 * Apply the resolved strip mode to the response text.
 */
export function applyStrip(text: string, mode: StripMode): string {
  const stripFns: Record<StripMode, (s: string) => string> = {
    none: stripNone,
    whitespace: stripWhitespace,
    attributes: stripAttributes,
    tags: stripTags,
    html2md: stripHtmlToMd,
  };
  return (stripFns[mode] ?? stripNone)(text);
}

// ── Utility ──────────────────────────────────────────────────────────

/** Get an attribute value from a tag token by name (case-insensitive). */
export function getAttr(token: Extract<Token, { kind: "tag" }>, name: string): string | null {
  const attr = token.attributes.find(a => a.name.toLowerCase() === name.toLowerCase());
  return attr?.value ?? null;
}

/** Get an attribute value with HTML entities decoded. */
export function getAttrDecoded(token: Extract<Token, { kind: "tag" }>, name: string): string | null {
  const val = getAttr(token, name);
  return val !== null ? decodeTextEntities(val) : null;
}

// ── Strip Modes ──────────────────────────────────────────────────────

/** Strip mode: "none" — no transformation. */
export function stripNone(text: string): string {
  return text;
}

/** Strip mode: "whitespace" — collapse multi-whitespace to single space. */
export function stripWhitespace(text: string): string {
  return collapseWhitespace(text);
}

/** Strip mode: "attributes" — remove HTML attributes, then collapse whitespace. */
export function stripAttributes(html: string): string {
  let output = "";
  for (const token of tokenize(html)) {
    if (token.kind === "text") {
      output += token.data;
    } else if (token.kind === "comment") {
      output += `<!--${token.data}-->`;
    } else if (token.kind === "doctype") {
      output += `<!DOCTYPE${token.data}>`;
    } else if (token.kind === "tag") {
      if (token.isClosing) {
        output += `</${token.name}>`;
      } else {
        output += `<${token.name}`;
        if (token.selfClosing) {
          output += "/";
        }
        output += ">";
      }
    }
  }
  return collapseWhitespace(output);
}

/** Strip mode: "tags" — remove all HTML tags, then collapse whitespace. */
export function stripTags(html: string): string {
  let output = "";
  let skipContent = false;
  let prevWasTag = false;

  for (const token of tokenize(html)) {
    if (token.kind === "tag" && !token.isClosing &&
        SEARCH_SKIP_ELEMENTS.has(token.name)) {
      skipContent = true;
      continue;
    }
    if (token.kind === "tag" && token.isClosing &&
        SEARCH_SKIP_ELEMENTS.has(token.name)) {
      skipContent = false;
      continue;
    }
    if (skipContent) continue;

    if (token.kind === "text") {
      if (prevWasTag && output.length > 0 &&
          !isHtmlWhitespace(output.at(-1)!)) {
        output += " ";
      }
      output += decodeTextEntities(token.data);
      prevWasTag = false;
    } else if (token.kind === "tag") {
      prevWasTag = true;
    }
  }
  return collapseWhitespacePreserveLines(output);
}

/**
 * Strip mode: "html2md" — convert HTML to Markdown.
 *
 * Uses a SAX-style event-driven parser (md_emitter + md_handler) that:
 * - Maintains an element stack to track nesting context
 * - Dispatches events to dedicated handler functions per element type
 * - Treats unknown elements as block-level paragraphs
 * - Discards content in script, style, head, meta, noscript, template, etc.
 */
export function stripHtmlToMd(html: string): string {
  // normalizeOutput (inside processEvents) already handles blank-line collapsing
  return processEvents(emitEvents(html));
}
