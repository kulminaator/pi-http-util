/**
 * md_emitter.test.ts — Tests for SAX-style event emitter and element classification.
 */

import { assert, describe, test } from "./test-harness.ts";
import {
  emitEvents,
  SKIP_ELEMENTS,
  SKIP_VOID_ELEMENTS,
  BLOCK_ELEMENTS,
  INLINE_FORMAT_ELEMENTS,
  VOID_ELEMENTS,
  headingLevel,
  isListContainer,
  isTableRowElement,
} from "../../src/md_emitter.ts";
import {
  RAW_TEXT_ELEMENTS,
  SEARCH_SKIP_ELEMENTS,
} from "../../src/element_classification.ts";

describe("emitEvents()", () => {

  test("plain text produces a single text event", () => {
    const events = [...emitEvents("hello world")];
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "text");
    assert.equal(events[0].data, "hello world");
  });

  test("opening tag produces open event", () => {
    const events = [...emitEvents("<div class='x'>")];
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "open");
    assert.equal(events[0].name, "div");
    assert.equal(events[0].attributes.length, 1);
  });

  test("closing tag produces close event", () => {
    const events = [...emitEvents("</div>")];
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "close");
    assert.equal(events[0].name, "div");
  });

  test("mixed content produces correct event sequence", () => {
    const events = [...emitEvents("<p>Hello</p><b>World</b>")];
    assert.equal(events.length, 6);
    assert.equal(events[0].type, "open");
    assert.equal(events[0].name, "p");
    assert.equal(events[1].type, "text");
    assert.equal(events[1].data, "Hello");
    assert.equal(events[2].type, "close");
    assert.equal(events[2].name, "p");
  });

  test("comments are filtered out", () => {
    const events = [...emitEvents("<!-- comment --><p>text</p>")];
    assert.equal(events.length, 3); // open, text, close
    assert(!events.some(e => e.type === "text" && e.data.includes("comment")));
  });

  test("doctypes are filtered out", () => {
    const events = [...emitEvents("<!DOCTYPE html><html><p>hi</p></html>")];
    assert(!events.some(e => e.type === "open" && e.name === "!doctype"));
  });

  test("empty input produces no events", () => {
    const events = [...emitEvents("")];
    assert.equal(events.length, 0);
  });

  test("attributes are passed through on open events", () => {
    const events = [...emitEvents('<a href="https://example.com" target="_blank">')];
    assert.equal(events[0].type, "open");
    const attrs = events[0].attributes;
    assert.equal(attrs.length, 2);
    assert.equal(attrs[0].name, "href");
    assert.equal(attrs[0].value, "https://example.com");
  });

  test("self-closing tags produce open events (not close)", () => {
    const events = [...emitEvents("<br/>")];
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "open");
    assert.equal(events[0].name, "br");
  });
});

describe("headingLevel()", () => {

  test("returns 1-6 for h1-h6", () => {
    for (let i = 1; i <= 6; i++) {
      assert.equal(headingLevel(`h${i}`), i);
    }
  });

  test("returns 0 for non-heading elements", () => {
    assert.equal(headingLevel("div"), 0);
    assert.equal(headingLevel("h7"), 0);
    assert.equal(headingLevel("header"), 0);
    assert.equal(headingLevel("h0"), 0);
  });
});

describe("isListContainer()", () => {

  test("returns true for ul and ol", () => {
    assert.equal(isListContainer("ul"), true);
    assert.equal(isListContainer("ol"), true);
  });

  test("returns false for other elements", () => {
    assert.equal(isListContainer("li"), false);
    assert.equal(isListContainer("div"), false);
  });
});

describe("isTableRowElement()", () => {

  test("returns true for tr, td, th", () => {
    assert.equal(isTableRowElement("tr"), true);
    assert.equal(isTableRowElement("td"), true);
    assert.equal(isTableRowElement("th"), true);
  });

  test("returns false for other elements", () => {
    assert.equal(isTableRowElement("table"), false);
    assert.equal(isTableRowElement("tbody"), false);
  });
});

describe("SKIP_ELEMENTS", () => {

  test("contains known skip elements", () => {
    assert.equal(SKIP_ELEMENTS.has("script"), true);
    assert.equal(SKIP_ELEMENTS.has("style"), true);
    assert.equal(SKIP_ELEMENTS.has("head"), true);
    assert.equal(SKIP_ELEMENTS.has("meta"), true);
    assert.equal(SKIP_ELEMENTS.has("noscript"), true);
    assert.equal(SKIP_ELEMENTS.has("template"), true);
    assert.equal(SKIP_ELEMENTS.has("slot"), true);
    assert.equal(SKIP_ELEMENTS.has("link"), true);
    assert.equal(SKIP_ELEMENTS.has("title"), true);
    assert.equal(SKIP_ELEMENTS.has("base"), true);
  });

  test("does not contain source (handled by picture)", () => {
    assert.equal(SKIP_ELEMENTS.has("source"), false);
  });

  test("does not contain normal elements", () => {
    assert.equal(SKIP_ELEMENTS.has("div"), false);
    assert.equal(SKIP_ELEMENTS.has("p"), false);
    assert.equal(SKIP_ELEMENTS.has("span"), false);
  });
});

describe("BLOCK_ELEMENTS", () => {

  test("contains common block elements", () => {
    assert.equal(BLOCK_ELEMENTS.has("div"), true);
    assert.equal(BLOCK_ELEMENTS.has("p"), true);
    assert.equal(BLOCK_ELEMENTS.has("h1"), true);
    assert.equal(BLOCK_ELEMENTS.has("section"), true);
    assert.equal(BLOCK_ELEMENTS.has("blockquote"), true);
    assert.equal(BLOCK_ELEMENTS.has("table"), true);
    assert.equal(BLOCK_ELEMENTS.has("ul"), true);
    assert.equal(BLOCK_ELEMENTS.has("li"), true);
    assert.equal(BLOCK_ELEMENTS.has("pre"), true);
    assert.equal(BLOCK_ELEMENTS.has("br"), true);
    assert.equal(BLOCK_ELEMENTS.has("hr"), true);
  });
});

describe("INLINE_FORMAT_ELEMENTS", () => {

  test("contains common inline elements", () => {
    assert.equal(INLINE_FORMAT_ELEMENTS.has("a"), true);
    assert.equal(INLINE_FORMAT_ELEMENTS.has("b"), true);
    assert.equal(INLINE_FORMAT_ELEMENTS.has("strong"), true);
    assert.equal(INLINE_FORMAT_ELEMENTS.has("i"), true);
    assert.equal(INLINE_FORMAT_ELEMENTS.has("em"), true);
    assert.equal(INLINE_FORMAT_ELEMENTS.has("code"), true);
    assert.equal(INLINE_FORMAT_ELEMENTS.has("mark"), true);
  });

  test("does not contain block elements", () => {
    assert.equal(INLINE_FORMAT_ELEMENTS.has("div"), false);
    assert.equal(INLINE_FORMAT_ELEMENTS.has("p"), false);
  });
});

describe("VOID_ELEMENTS", () => {

  test("contains known void elements", () => {
    assert.equal(VOID_ELEMENTS.has("br"), true);
    assert.equal(VOID_ELEMENTS.has("img"), true);
    assert.equal(VOID_ELEMENTS.has("input"), true);
    assert.equal(VOID_ELEMENTS.has("hr"), true);
    assert.equal(VOID_ELEMENTS.has("meta"), true);
    assert.equal(VOID_ELEMENTS.has("link"), true);
  });
});

describe("SKIP_VOID_ELEMENTS", () => {

  test("contains void skip elements", () => {
    assert.equal(SKIP_VOID_ELEMENTS.has("meta"), true);
    assert.equal(SKIP_VOID_ELEMENTS.has("link"), true);
    assert.equal(SKIP_VOID_ELEMENTS.has("base"), true);
  });

  test("does not contain non-void skip elements", () => {
    assert.equal(SKIP_VOID_ELEMENTS.has("script"), false);
    assert.equal(SKIP_VOID_ELEMENTS.has("style"), false);
    assert.equal(SKIP_VOID_ELEMENTS.has("head"), false);
  });
});

describe("RAW_TEXT_ELEMENTS", () => {

  test("contains CDATA-like elements", () => {
    assert.equal(RAW_TEXT_ELEMENTS.has("script"), true);
    assert.equal(RAW_TEXT_ELEMENTS.has("style"), true);
    assert.equal(RAW_TEXT_ELEMENTS.has("textarea"), true);
  });

  test("does not contain normal elements", () => {
    assert.equal(RAW_TEXT_ELEMENTS.has("div"), false);
    assert.equal(RAW_TEXT_ELEMENTS.has("noscript"), false);
  });
});

describe("SEARCH_SKIP_ELEMENTS", () => {

  test("contains non-visible elements", () => {
    assert.equal(SEARCH_SKIP_ELEMENTS.has("script"), true);
    assert.equal(SEARCH_SKIP_ELEMENTS.has("style"), true);
  });

  test("does not contain textarea (its content is visible)", () => {
    assert.equal(SEARCH_SKIP_ELEMENTS.has("textarea"), false);
  });

  test("does not contain noscript (visible when JS disabled)", () => {
    assert.equal(SEARCH_SKIP_ELEMENTS.has("noscript"), false);
  });
});
