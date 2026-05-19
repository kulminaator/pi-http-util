/**
 * element_classification.ts — Single source of truth for HTML element classification.
 *
 * All modules that need to know about HTML element categories (skip, block,
 * inline, void) import from here. This prevents inconsistent behavior between
 * strip modes, the markdown converter, and the in-page search module.
 */

/** Elements whose entire subtree is discarded (no text content). */
export const SKIP_ELEMENTS = new Set([
  "script", "style", "head", "meta", "link", "title",
  "noscript", "template", "slot", "base",
]);

/** Void elements that are also skip elements (no closing tag, don't affect depth). */
export const SKIP_VOID_ELEMENTS = new Set([
  "meta", "link", "base",
]);

/** Elements whose content is raw text (not parsed as HTML).
 * The tokenizer treats these as CDATA-like containers. */
export const RAW_TEXT_ELEMENTS = new Set([
  "script", "style", "textarea",
]);

/** Elements whose content is skipped when searching for visible text.
 * A subset of RAW_TEXT_ELEMENTS — <textarea> content IS visible. */
export const SEARCH_SKIP_ELEMENTS = new Set([
  "script", "style",
]);

/** Known block-level elements. */
export const BLOCK_ELEMENTS = new Set([
  "address", "article", "aside", "blockquote", "br", "caption",
  "dd", "details", "dialog", "div", "dl", "dt", "fieldset",
  "figcaption", "figure", "footer", "form", "h1", "h2", "h3",
  "h4", "h5", "h6", "header", "hgroup", "hr", "legend", "li",
  "main", "nav", "ol", "p", "pre", "section", "summary",
  "table", "tbody", "td", "tfoot", "th", "thead", "tr",
  "ul",
]);

/** Known inline formatting elements. */
export const INLINE_FORMAT_ELEMENTS = new Set([
  "a", "abbr", "b", "bdi", "bdo", "code", "cite", "data",
  "del", "dfn", "em", "i", "ins", "kbd", "mark", "q",
  "rp", "rt", "ruby", "s", "samp", "small", "span",
  "strike", "strong", "sub", "sup", "time", "u", "var",
]);

/** Void (self-closing) elements that never have children. */
export const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img",
  "input", "link", "meta", "param", "source", "track", "wbr",
]);
