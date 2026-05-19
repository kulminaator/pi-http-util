/**
 * tokenizer.ts — HTML tokenizer.
 *
 * Tokenizes an HTML string into a sequence of tokens (text, tag, comment, doctype).
 * Pure, side-effect-free, fully unit-testable.
 *
 * Content inside <script> and <style> tags is emitted as raw text (not parsed as
 * HTML), matching how real HTML parsers treat these elements as CDATA-like containers.
 */

// ── Token Types ──────────────────────────────────────────────────────

/** Attribute parsed from a tag. */
export interface Attribute {
  name: string;
  value: string | null;
}

/** Token types produced by the tokenizer. */
export type Token =
  | { kind: "text"; data: string; start: number; end: number }
  | { kind: "tag"; name: string; isClosing: boolean; selfClosing: boolean; attributes: Attribute[]; start: number; end: number }
  | { kind: "comment"; data: string; start: number; end: number }
  | { kind: "doctype"; data: string; start: number; end: number };

/** Check if a character is basic ASCII whitespace (for tokenizer attribute parsing). */
function isBasicWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

// ── Tokenizer ────────────────────────────────────────────────────────

/**
 * Tokenize an HTML string into a sequence of tokens.
 *
 * Handles:
 * - Text nodes
 * - Opening, closing, and self-closing tags with attributes
 * - HTML comments (<!-- ... -->)
 * - DOCTYPE declarations
 *
 * Malformed constructs (unclosed tags, broken comments) degrade gracefully
 * by emitting partial text tokens.
 */
export function* tokenize(html: string): Generator<Token> {
  let i = 0;
  const len = html.length;

  while (i < len) {
    // ── Comment: <!-- ... -->
    if (html[i] === "<" && html.slice(i, i + 4) === "<!--") {
      const end = html.indexOf("-->", i + 4);
      if (end !== -1) {
        yield { kind: "comment", data: html.slice(i + 4, end), start: i, end: end + 3 };
        i = end + 3;
      } else {
        // Malformed comment — treat as text
        yield { kind: "text", data: html[i], start: i, end: i + 1 };
        i++;
      }
      continue;
    }

    // ── DOCTYPE: <!DOCTYPE ...>
    if (html[i] === "<" && html.slice(i, i + 9).toUpperCase() === "<!DOCTYPE") {
      const end = html.indexOf(">", i + 9);
      if (end !== -1) {
        yield { kind: "doctype", data: html.slice(i + 9, end), start: i, end: end + 1 };
        i = end + 1;
      } else {
        yield { kind: "text", data: html[i], start: i, end: i + 1 };
        i++;
      }
      continue;
    }

    // ── Tag: <name ...> or </name>
    if (html[i] === "<") {
      const isClosing = html[i + 1] === "/";
      let start = i + 1 + (isClosing ? 1 : 0);

      // Read tag name
      let name = "";
      while (start < len && !isBasicWhitespace(html[start]) && html[start] !== ">" && html[start] !== "/") {
        name += html[start];
        start++;
      }

      if (!name) {
        // Not a valid tag start (e.g. "< 5")
        yield { kind: "text", data: html[i], start: i, end: i + 1 };
        i++;
        continue;
      }

      // Read attributes
      const attributes: Attribute[] = [];
      let selfClosing = false;

      while (start < len && html[start] !== ">") {
        // Skip whitespace
        while (start < len && isBasicWhitespace(html[start])) start++;
        if (start >= len || html[start] === ">") break;

        if (html[start] === "/") {
          selfClosing = true;
          start++;
          continue;
        }

        // Read attribute name
        let attrName = "";
        while (start < len && !isBasicWhitespace(html[start]) && html[start] !== "=" && html[start] !== ">") {
          attrName += html[start];
          start++;
        }

        if (!attrName) {
          start++;
          continue;
        }

        // Skip whitespace before =
        while (start < len && isBasicWhitespace(html[start])) start++;

        let attrValue: string | null = null;
        if (start < len && html[start] === "=") {
          start++; // skip =
          // Skip whitespace after =
          while (start < len && isBasicWhitespace(html[start])) start++;

          if (start < len && (html[start] === '"' || html[start] === "'")) {
            // Quoted attribute value
            const quote = html[start];
            start++;
            let value = "";
            while (start < len && html[start] !== quote) {
              value += html[start];
              start++;
            }
            if (start < len) start++; // skip closing quote
            attrValue = value;
          } else {
            // Unquoted attribute value
            let value = "";
            while (start < len && !isBasicWhitespace(html[start]) && html[start] !== ">") {
              value += html[start];
              start++;
            }
            attrValue = value;
          }
        }

        attributes.push({ name: attrName, value: attrValue });
      }

      if (start < len) start++; // skip >
      const tagName = name.toLowerCase();

      // ── Script / style / textarea: emit tag, then scan for closing tag ──
      // Content inside <script>, <style>, and <textarea> is NOT parsed as HTML.
      // This prevents template scripts (e.g. <script type="text/ng-template">
      // containing full HTML markup) from confusing depth-based skip logic.
      // <textarea> content is raw text, not HTML markup.
      if (!isClosing && (tagName === "script" || tagName === "style" || tagName === "textarea")) {
        yield { kind: "tag", name: tagName, isClosing: false, selfClosing, attributes, start: i, end: start };
        const closeTag = `</${tagName}>`;
        const closeIdx = html.toLowerCase().indexOf(closeTag, i);
        if (closeIdx !== -1) {
          // Emit raw content as a single text token
          const rawContent = html.slice(i, closeIdx);
          if (rawContent.length > 0) {
            yield { kind: "text", data: rawContent, start: i, end: closeIdx };
          }
          // Emit the closing tag
          yield { kind: "tag", name: tagName, isClosing: true, selfClosing: false, attributes: [], start: closeIdx, end: closeIdx + closeTag.length };
          i = closeIdx + closeTag.length;
        } else {
          // Malformed: no closing tag — emit rest as text
          const rawContent = html.slice(i);
          if (rawContent.length > 0) {
            yield { kind: "text", data: rawContent, start: i, end: len };
          }
          i = len;
        }
        continue;
      }

      yield { kind: "tag", name: tagName, isClosing, selfClosing, attributes, start: i, end: start };
      i = start;
      continue;
    }

    // ── Text (everything else, up to next <)
    let textEnd = html.indexOf("<", i);
    if (textEnd === -1) textEnd = len;
    if (textEnd > i) {
      yield { kind: "text", data: html.slice(i, textEnd), start: i, end: textEnd };
    }
    i = textEnd;
  }
}
