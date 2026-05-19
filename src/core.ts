/**
 * core.ts — Barrel re-export of all pi-http-util pure functions.
 *
 * Actual implementations live in dedicated modules:
 * - tokenizer.ts  : HTML tokenizer (Token type, tokenize)
 * - entities.ts   : HTML entity decoding
 * - whitespace.ts : Whitespace detection and collapsing
 * - strip.ts      : Strip modes (none, whitespace, attributes, tags, html2md)
 * - fetch.ts      : Fetch pipeline (executeFetch, validateUrl, buildHeaders)
 */

// Tokenizer
export { tokenize } from "./tokenizer.ts";
export type { Token, Attribute } from "./tokenizer.ts";

// Element classification
export {
  SKIP_ELEMENTS,
  SKIP_VOID_ELEMENTS,
  RAW_TEXT_ELEMENTS,
  SEARCH_SKIP_ELEMENTS,
  BLOCK_ELEMENTS,
  INLINE_FORMAT_ELEMENTS,
  VOID_ELEMENTS,
} from "./element_classification.ts";

// Entities
export { decodeHtmlEntity, decodeEntity, decodeTextEntities } from "./entities.ts";

// Whitespace
export { isHtmlWhitespace, collapseWhitespace, collapseWhitespacePreserveLines } from "./whitespace.ts";

// Strip modes
export {
  stripNone,
  stripWhitespace,
  stripAttributes,
  stripTags,
  stripHtmlToMd,
  getAttr,
  getAttrDecoded,
  resolveStripMethod,
  applyStrip,
} from "./strip.ts";
export type { StripMode } from "./strip.ts";

// HTTP client abstraction
export type { HttpClient } from "./http_client.ts";
export { defaultHttpClient } from "./http_client.ts";

// Fetch pipeline
export {
  executeFetch,
  validateUrl,
  buildHeaders,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
} from "./fetch.ts";
export type { FetchParams, FetchResult } from "./fetch.ts";

// In-page search
export { inPageSearch } from "./in_page_search.ts";

// Raw HTTP request
export {
  executeRawRequest,
  validateRawUrl,
  buildRawHeaders,
  loadBodyFile,
  writeResponseBody,
  checkSizeLimit,
} from "./raw_http_request.ts";
export type { RawRequestParams, RawRequestResult } from "./raw_http_request.ts";
