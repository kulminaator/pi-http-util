/**
 * md_emitter.ts — SAX-style event emitter for HTML-to-Markdown conversion.
 *
 * Wraps the HTML tokenizer to produce a clean stream of events:
 *   - { type: "text", data: string }
 *   - { type: "open", name: string, attributes: Attribute[] }
 *   - { type: "close", name: string }
 *
 * Comments and doctypes are filtered out.
 */

import { tokenize, type Token, type Attribute } from "./tokenizer.ts";
import {
  SKIP_ELEMENTS,
  SKIP_VOID_ELEMENTS,
  BLOCK_ELEMENTS,
  INLINE_FORMAT_ELEMENTS,
  VOID_ELEMENTS,
} from "./element_classification.ts";

// ── Event Types ──────────────────────────────────────────────────────

export type MdEvent =
  | { type: "text"; data: string }
  | { type: "open"; name: string; attributes: Attribute[] }
  | { type: "close"; name: string };

// Re-export classification constants for backward compatibility
export {
  SKIP_ELEMENTS,
  SKIP_VOID_ELEMENTS,
  BLOCK_ELEMENTS,
  INLINE_FORMAT_ELEMENTS,
  VOID_ELEMENTS,
};

/** Check if an element name is a heading. Returns 1-6 or 0. */
export function headingLevel(name: string): number {
  if (/^h([1-6])$/.test(name)) return parseInt(name[1], 10);
  return 0;
}

/** Check if an element is a list container (ul/ol). */
export function isListContainer(name: string): boolean {
  return name === "ul" || name === "ol";
}

/** Check if an element is a table row-related element. */
export function isTableRowElement(name: string): boolean {
  return name === "tr" || name === "td" || name === "th";
}

// ── Event Generator ──────────────────────────────────────────────────

/**
 * Yield SAX-style events from an HTML string.
 * Filters out comments and doctypes.
 */
export function* emitEvents(html: string): Generator<MdEvent> {
  for (const token of tokenize(html)) {
    if (token.kind === "text") {
      yield { type: "text", data: token.data };
    } else if (token.kind === "tag") {
      if (token.isClosing) {
        yield { type: "close", name: token.name };
      } else {
        yield { type: "open", name: token.name, attributes: token.attributes };
      }
    }
    // comments and doctypes are silently dropped
  }
}
