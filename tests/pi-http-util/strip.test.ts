/**
 * strip.test.ts — Unit tests for all HTML strip modes.
 */

import { assert, describe, test } from "./test-harness.ts";
import { runSummary } from "./test-harness.ts";
import {
  stripNone,
  stripWhitespace,
  stripAttributes,
  stripTags,
  stripHtmlToMd,
  getAttr,
  getAttrDecoded,
  resolveStripMethod,
  applyStrip,
} from "../../src/core.ts";
import { collectTokens } from "./test-harness.ts";

describe("stripNone()", () => {

  test("identity — returns input unchanged", () => {
    const input = "<div class='x'>Hello &amp; World</div>";
    assert.equal(stripNone(input), input);
  });

  test("empty string", () => {
    assert.equal(stripNone(""), "");
  });
});

describe("stripWhitespace()", () => {

  test("collapses multi-whitespace in plain text", () => {
    assert.equal(stripWhitespace("hello     world"), "hello world");
  });

  test("collapses whitespace in HTML (but keeps tags)", () => {
    const input = "<div>  hello  </div>";
    const result = stripWhitespace(input);
    assert.equal(result, "<div> hello </div>");
  });

  test("collapses nbsp in text", () => {
    assert.equal(stripWhitespace("foo\u00A0\u00A0bar"), "foo bar");
  });

  test("empty string", () => {
    assert.equal(stripWhitespace(""), "");
  });
});

describe("stripAttributes()", () => {

  test("removes simple attribute", () => {
    const input = '<div class="foo">hello</div>';
    const result = stripAttributes(input);
    assert.equal(result, "<div>hello</div>");
  });

  test("removes multiple attributes", () => {
    const input = '<a href="https://example.com" target="_blank" rel="noopener">link</a>';
    const result = stripAttributes(input);
    assert.equal(result, "<a>link</a>");
  });

  test("preserves self-closing tags", () => {
    const input = '<img src="photo.jpg" alt="A photo" />';
    const result = stripAttributes(input);
    assert.equal(result, "<img/>");
  });

  test("preserves comments", () => {
    const input = '<!-- comment --><div class="x">text</div>';
    const result = stripAttributes(input);
    assert.equal(result, "<!-- comment --><div>text</div>");
  });

  test("preserves doctype", () => {
    const input = '<!DOCTYPE html><html lang="en">';
    const result = stripAttributes(input);
    assert.equal(result, "<!DOCTYPE html><html>");
  });

  test("collapses whitespace after stripping", () => {
    const input = '<div  class="foo"  id="bar">  hello  </div>';
    const result = stripAttributes(input);
    assert.equal(result, "<div> hello </div>");
  });

  test("boolean attributes removed", () => {
    const input = "<input disabled readonly>";
    const result = stripAttributes(input);
    assert.equal(result, "<input>");
  });

  test("complex HTML document", () => {
    const input = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Test</title></head>
<body class="main"><p id="intro">Hello</p></body>
</html>`;
    const result = stripAttributes(input);
    assert(result.includes("<html>"));
    assert(result.includes("<head>"));
    assert(result.includes("<title>"));
    assert(result.includes("<body>"));
    assert(result.includes("<p>"));
    assert(result.includes("Hello"));
    assert(!result.includes("="));
  });

  test("empty input", () => {
    assert.equal(stripAttributes(""), "");
  });

  test("no-attribute tags pass through", () => {
    const input = "<div><p>hello</p></div>";
    const result = stripAttributes(input);
    assert.equal(result, "<div><p>hello</p></div>");
  });
});

describe("stripTags()", () => {

  test("removes simple tags", () => {
    const input = "<div>hello</div>";
    assert.equal(stripTags(input), "hello");
  });

  test("removes nested tags", () => {
    const input = "<div><p><b>hello</b></p></div>";
    assert.equal(stripTags(input), "hello");
  });

  test("decodes entities in text", () => {
    const input = "<p>Hello &amp; World</p>";
    assert.equal(stripTags(input), "Hello & World");
  });

  test("decodes nbsp and collapses it to space", () => {
    const input = "<p>foo&nbsp;bar</p>";
    assert.equal(stripTags(input), "foo bar");
  });

  test("decodes numeric entities", () => {
    const input = "<p>&#8364;100</p>";
    assert.equal(stripTags(input), "\u20AC100");
  });

  test("removes comments", () => {
    const input = "<!-- comment --><p>hello</p>";
    assert.equal(stripTags(input), "hello");
  });

  test("removes doctype", () => {
    const input = "<!DOCTYPE html><html><body>hello</body></html>";
    assert.equal(stripTags(input), "hello");
  });

  test("collapses whitespace between tags, preserves line breaks", () => {
    const input = "<p>hello</p>\n\n<p>world</p>";
    assert.equal(stripTags(input), "hello\n\nworld");
  });

  test("collapses whitespace from attributes + tags, trims lines", () => {
    const input = '<div class="x">  hello  </div>';
    assert.equal(stripTags(input), "hello");
  });

  test("complex HTML page to text", () => {
    const input = `<!DOCTYPE html>
<html>
<head><title>My Page</title></head>
<body>
  <h1>Welcome</h1>
  <p>This is a &lt;test&gt; page.</p>
  <!-- ignore this -->
  <footer>Copyright &copy; 2024</footer>
</body>
</html>`;
    const result = stripTags(input);
    assert(result.includes("Welcome"));
    assert(result.includes("This is a <test> page."));
    assert(result.includes("Copyright"));
    assert(result.includes("\u00A9"));
    assert(!result.includes("ignore"));
    assert(!result.includes("<html"));
    assert(!result.includes("<body"));
    assert(!result.includes("<h1"));
    assert(!result.includes("<p"));
    assert(!result.includes("<footer"));
  });

  test("nbsp between words is decoded then collapsed with adjacent whitespace", () => {
    const input = "<p>hello&nbsp;world</p>";
    assert.equal(stripTags(input), "hello world");
  });

  test("empty input", () => {
    assert.equal(stripTags(""), "");
  });

  test("only tags, no text", () => {
    assert.equal(stripTags("<div><span></span></div>"), "");
  });

  test("self-closing tags removed", () => {
    const input = "before<img src='x'/><br/>after";
    assert.equal(stripTags(input), "before after");
  });

  test("preserves line structure from multi-line HTML", () => {
    const input = `<div>
  <p>First line</p>
  <p>Second line</p>
</div>`;
    const result = stripTags(input);
    assert(result.includes("First line"));
    assert(result.includes("Second line"));
    const lines = result.split("\n");
    assert(lines.length >= 2, "Should preserve multiple lines");
  });

  test("collapses multiple consecutive blank lines into one", () => {
    const input = `<p>foo</p>




<p>bar</p>`;
    const result = stripTags(input);
    // Should have exactly one blank line between foo and bar
    const lines = result.split("\n");
    assert(lines.length === 3, `Expected 3 lines (foo, blank, bar), got ${lines.length}`);
    assert.equal(lines[0], "foo");
    assert.equal(lines[1], "");
    assert.equal(lines[2], "bar");
  });

  test("removes leading and trailing blank lines", () => {
    const input = `\n\n\n<p>content</p>\n\n\n`;
    const result = stripTags(input);
    assert.equal(result, "content");
  });

  test("mixed whitespace within lines is collapsed", () => {
    const input = "<p>hello   world</p>\n<p>foo\t\tbaz</p>";
    const result = stripTags(input);
    assert(result.includes("hello world"));
    assert(result.includes("foo baz"));
    assert(!result.includes("  "), "Should not have double spaces");
  });

  test("script block content is discarded", () => {
    const input = "<p>Text</p><script>alert('xss')</script><p>More</p>";
    const result = stripTags(input);
    assert(result.includes("Text"));
    assert(result.includes("More"));
    assert(!result.includes("alert"));
    assert(!result.includes("xss"));
  });

  test("style block content is discarded", () => {
    const input = "<p>Text</p><style>.foo { color: red; }</style><p>More</p>";
    const result = stripTags(input);
    assert(result.includes("Text"));
    assert(result.includes("More"));
    assert(!result.includes("color"));
  });

  test("textarea content is preserved as text (not parsed as HTML)", () => {
    const input = '<textarea><p>user input &amp; stuff</p></textarea>';
    const result = stripTags(input);
    // The inner <p> should be stripped (tags mode), but the text should survive
    assert(result.includes("user input"));
    assert(result.includes("stuff"));
  });

  test("textarea raw content preserved as-is (not parsed as HTML)", () => {
    const input = '<textarea><b>bold</b> text</textarea>';
    const result = stripTags(input);
    // textarea content is raw text, <b> is literal text not a tag
    assert(result.includes("<b>bold</b>"));
    assert(result.includes("text"));
  });

  test("tag removal prevents word concatenation", () => {
    const input = "<p>Bob</p>Marley";
    assert.equal(stripTags(input), "Bob Marley");
  });

  test("tag removal with existing whitespace does not double-space", () => {
    const input = "<p>hello</p> world";
    assert.equal(stripTags(input), "hello world");
  });
});

describe("stripTags() — edge cases", () => {

  test("unclosed tags still stripped", () => {
    const result = stripTags("<div><p>hello");
    assert.equal(result, "hello");
  });

  test("mismatched tags handled gracefully", () => {
    const result = stripTags("<div><span>hello</div></span>");
    assert.equal(result, "hello");
  });

  test("nested script blocks", () => {
    const result = stripTags("<p>before</p><script><script>nested</script>after</script><p>end</p>");
    assert(result.includes("before"));
    assert(result.includes("end"));
    assert(!result.includes("nested"));
  });

  test("empty string", () => {
    assert.equal(stripTags(""), "");
  });

  test("only whitespace between tags", () => {
    const result = stripTags("<p>   </p><p>   </p>");
    assert.equal(result.trim(), "");
  });

  test("text with special chars preserved", () => {
    const result = stripTags("<p>hello &lt;world&gt; &amp; 'quotes'</p>");
    assert(result.includes("hello"));
    assert(result.includes("<world>"));
    assert(result.includes("&"));
    assert(result.includes("'quotes'"));
  });
});

describe("stripHtmlToMd()", () => {

  test("headings h1-h6", () => {
    assert(stripHtmlToMd("<h1>Title</h1>").includes("# Title"));
    assert(stripHtmlToMd("<h2>Section</h2>").includes("## Section"));
    assert(stripHtmlToMd("<h3>Sub</h3>").includes("### Sub"));
    assert(stripHtmlToMd("<h6>Small</h6>").includes("###### Small"));
  });

  test("bold / strong", () => {
    const result = stripHtmlToMd("<p>This is <b>bold</b> text</p>");
    assert(result.includes("**bold**"));
    const result2 = stripHtmlToMd("<p>This is <strong>strong</strong> text</p>");
    assert(result2.includes("**strong**"));
  });

  test("italic / em", () => {
    const result = stripHtmlToMd("<p>This is <i>italic</i> text</p>");
    assert(result.includes("*italic*"));
    const result2 = stripHtmlToMd("<p>This is <em>emphasized</em> text</p>");
    assert(result2.includes("*emphasized*"));
  });

  test("strikethrough (s, strike, del)", () => {
    assert(stripHtmlToMd("<s>old</s>").includes("~~old~~"));
    assert(stripHtmlToMd("<strike>old</strike>").includes("~~old~~"));
    assert(stripHtmlToMd("<del>old</del>").includes("~~old~~"));
  });

  test("inline code", () => {
    const result2 = stripHtmlToMd("Use the <code>code</code> tag");
    assert(result2.includes("`code`"));
  });

  test("links", () => {
    const result = stripHtmlToMd('<a href="https://example.com">click here</a>');
    assert(result.includes("[click here](https://example.com)"));
  });

  test("images", () => {
    const result = stripHtmlToMd('<img src="photo.jpg" alt="A photo">');
    assert(result.includes("![A photo](photo.jpg)"));
  });

  test("unordered list", () => {
    const result = stripHtmlToMd("<ul><li>One</li><li>Two</li><li>Three</li></ul>");
    assert(result.includes("- One"));
    assert(result.includes("- Two"));
    assert(result.includes("- Three"));
  });

  test("ordered list", () => {
    const result = stripHtmlToMd("<ol><li>First</li><li>Second</li></ol>");
    assert(result.includes("1. First"));
    assert(result.includes("1. Second"));
  });

  test("nested lists", () => {
    const result = stripHtmlToMd("<ul><li>Item 1<ul><li>Sub A</li><li>Sub B</li></ul></li><li>Item 2</li></ul>");
    assert(result.includes("- Item 1"));
    assert(result.includes("- Sub A"));
    assert(result.includes("- Sub B"));
    assert(result.includes("- Item 2"));
  });

  test("code block (pre)", () => {
    const result = stripHtmlToMd("<pre><code>function hello() { return 42; }</code></pre>");
    assert(result.includes("```"));
    assert(result.includes("function hello()"));
  });

  test("blockquote", () => {
    const result = stripHtmlToMd("<blockquote><p>Quote text</p></blockquote>");
    assert(result.includes("> Quote text"));
  });

  test("horizontal rule", () => {
    const result = stripHtmlToMd("<p>Before</p><hr><p>After</p>");
    assert(result.includes("---"));
  });

  test("table", () => {
    const result = stripHtmlToMd(
      '<table><tr><th>Name</th><th>Age</th></tr><tr><td>Alice</td><td>30</td></tr></table>'
    );
    assert(result.includes("| Name"));
    assert(result.includes("| Age"));
    assert(result.includes("| Alice"));
    assert(result.includes("| 30"));
    assert(result.includes("---"));
  });

  test("paragraphs separated", () => {
    const result = stripHtmlToMd("<p>First paragraph</p><p>Second paragraph</p>");
    assert(result.includes("First paragraph"));
    assert(result.includes("Second paragraph"));
  });

  test("br becomes line break", () => {
    const result = stripHtmlToMd("Line one<br>Line two");
    assert(result.includes("Line one"));
    assert(result.includes("Line two"));
  });

  test("skips script content", () => {
    const result = stripHtmlToMd("<p>Text</p><script>alert('xss')</script><p>More</p>");
    assert(result.includes("Text"));
    assert(result.includes("More"));
    assert(!result.includes("alert"));
    assert(!result.includes("xss"));
  });

  test("skips style content", () => {
    const result = stripHtmlToMd("<p>Text</p><style>.foo { color: red; }</style><p>More</p>");
    assert(result.includes("Text"));
    assert(result.includes("More"));
    assert(!result.includes("color"));
  });

  test("skips head/meta/title", () => {
    const result = stripHtmlToMd("<!DOCTYPE html><html><head><title>Test</title><meta charset='utf-8'></head><body><p>Content</p></body></html>");
    assert(result.includes("Content"));
    assert(!result.includes("Test"));
  });

  test("nested inline formatting", () => {
    const result = stripHtmlToMd("<p><b><i>bold italic</i></b></p>");
    assert(result.includes("**bold italic**"));
  });

  test("entity decoding in markdown", () => {
    const result = stripHtmlToMd("<p>1 &lt; 2 &amp;&amp; 3 &gt; 0</p>");
    assert(result.includes("1 < 2 && 3 > 0"));
  });

  test("complex document to markdown", () => {
    const input = `<!DOCTYPE html>
<html>
<head><title>My Page</title></head>
<body>
  <h1>Welcome</h1>
  <p>This is a <strong>great</strong> page with <a href="/link">a link</a>.</p>
  <h2>Features</h2>
  <ul>
    <li>Fast</li>
    <li>Reliable
      <ul>
        <li>99.9% uptime</li>
      </ul>
    </li>
  </ul>
  <blockquote><p>As they say, <em>quality</em> matters.</p></blockquote>
  <pre><code>const x = 42;</code></pre>
  <hr>
  <p>Copyright &copy; 2024</p>
</body>
</html>`;
    const result = stripHtmlToMd(input);
    assert(result.includes("# Welcome"));
    assert(result.includes("**great**"));
    assert(result.includes("[a link](/link)"));
    assert(result.includes("## Features"));
    assert(result.includes("- Fast"));
    assert(result.includes("- Reliable"));
    assert(result.includes("99.9% uptime"));
    assert(result.includes("> As they say"));
    assert(result.includes("*quality*"));
    assert(result.includes("```"));
    assert(result.includes("const x = 42"));
    assert(result.includes("---"));
    assert(result.includes("Copyright"));
    assert(result.includes("\u00A9"));
    assert(!result.includes("<html"));
    assert(!result.includes("<body"));
    assert(!result.includes("<script"));
  });

  test("empty input", () => {
    assert.equal(stripHtmlToMd(""), "");
  });

  test("plain text passthrough", () => {
    assert.equal(stripHtmlToMd("just plain text"), "just plain text");
  });

  test("img alt with brackets escaped", () => {
    const result = stripHtmlToMd('<img src="x.jpg" alt="[bracket]">');
    assert(result.includes("!["));
    assert(result.includes("](x.jpg)"));
  });

  test("multiple headings with content", () => {
    const result = stripHtmlToMd("<h1>Title</h1><p>Content under title</p><h2>Subtitle</h2><p>Content under subtitle</p>");
    assert(result.includes("# Title"));
    assert(result.includes("Content under title"));
    assert(result.includes("## Subtitle"));
    assert(result.includes("Content under subtitle"));
  });

  test("div creates block separation", () => {
    const result = stripHtmlToMd("<div>Section 1</div><div>Section 2</div>");
    assert(result.includes("Section 1"));
    assert(result.includes("Section 2"));
  });
});

describe("stripHtmlToMd() — edge cases", () => {

  test("pre without code tag", () => {
    const result = stripHtmlToMd("<pre>plain text\nline 2</pre>");
    assert(result.includes("```"));
    assert(result.includes("plain text"));
    assert(result.includes("line 2"));
  });

  test("sub tag", () => {
    const result = stripHtmlToMd("H<sub>2</sub>O");
    assert(result.includes("H~2~O"));
  });

  test("sup tag", () => {
    const result = stripHtmlToMd("x<sup>2</sup>");
    assert(result.includes("x^2^"));
  });

  test("q tag (inline quote)", () => {
    const result = stripHtmlToMd('<p>Said <q>hello</q> to me</p>');
    assert(result.includes('"hello"'));
  });

  test("abbr tag without title", () => {
    const result = stripHtmlToMd("<abbr>HTML</abbr> is great");
    assert(result.includes("HTML"));
  });

  test("abbr tag with title", () => {
    const result = stripHtmlToMd('<abbr title="HyperText Markup Language">HTML</abbr>');
    assert(result.includes("HTML"));
    assert(result.includes("HyperText Markup Language"));
  });

  test("mark tag (highlight)", () => {
    const result = stripHtmlToMd("<p>Important: <mark>read this</mark></p>");
    assert(result.includes("==read this=="));
  });

  test("empty table", () => {
    const result = stripHtmlToMd("<table></table>");
    assert(typeof result === "string");
  });

  test("table with single cell", () => {
    const result = stripHtmlToMd("<table><tr><td>one</td></tr></table>");
    assert(result.includes("| one"));
  });

  test("nested blockquotes", () => {
    const result = stripHtmlToMd("<blockquote><p>Outer <blockquote><p>Inner</p></blockquote></p></blockquote>");
    assert(result.includes("> Outer"));
    assert(result.includes("> Inner"));
  });

  test("closing void element tags ignored", () => {
    const result = stripHtmlToMd("<p>Before</p></br><p>After</p>");
    assert(result.includes("Before"));
    assert(result.includes("After"));
  });

  test("unclosed inline tags — markers flushed at end", () => {
    const result = stripHtmlToMd("<p><b>bold text");
    assert(result.includes("**bold text**"));
  });

  test("emoji in content preserved", () => {
    const result = stripHtmlToMd("<p>Hello 😀 world</p>");
    assert(result.includes("Hello 😀 world"));
  });

  test("multiple hr in a row", () => {
    const result = stripHtmlToMd("<hr><hr><hr>");
    assert(result.includes("---"));
  });

  test("list inside blockquote", () => {
    const result = stripHtmlToMd("<blockquote><ul><li>Item</li></ul></blockquote>");
    assert(result.includes(">"));
    assert(result.includes("- Item"));
  });

  test("code block preserves whitespace", () => {
    const result = stripHtmlToMd("<pre>  indented\n    more indented</pre>");
    assert(result.includes("  indented"));
    assert(result.includes("    more indented"));
  });

  test("noscript content skipped", () => {
    const result = stripHtmlToMd("<p>Visible</p><noscript>Hidden</noscript><p>Also visible</p>");
    assert(result.includes("Visible"));
    assert(result.includes("Also visible"));
    assert(!result.includes("Hidden"));
  });

  test("link without href is ignored", () => {
    const result = stripHtmlToMd("<a name='anchor'>not a link</a>");
    assert(result.includes("not a link"));
    assert(!result.includes("[not a link]"));
  });

  test("malformed HTML with text between broken tags", () => {
    const result = stripHtmlToMd("<p>hello<div>world<p>goodbye");
    assert(result.includes("hello"));
    assert(result.includes("world"));
    assert(result.includes("goodbye"));
  });
});

// ── stripAttributes() — additional edge cases ──────────────────────

describe("stripAttributes() — edge cases", () => {

  test("unquoted attribute values removed", () => {
    const result = stripAttributes("<div class=foo id=bar>");
    assert.equal(result, "<div>");
  });

  test("empty attribute values removed", () => {
    const result = stripAttributes('<div class="" id="">');
    assert.equal(result, "<div>");
  });

  test("event handler attributes removed", () => {
    const result = stripAttributes('<button onclick="alert(1)" onmouseover="track()">Click</button>');
    assert.equal(result, "<button>Click</button>");
    assert(!result.includes("onclick"));
    assert(!result.includes("onmouseover"));
    assert(!result.includes("alert"));
  });

  test("data-* attributes removed", () => {
    const result = stripAttributes('<div data-id="123" data-foo="bar">content</div>');
    assert.equal(result, "<div>content</div>");
  });

  test("attributes with special chars in values removed", () => {
    const result = stripAttributes('<div title="a &amp; b <c>">text</div>');
    assert.equal(result, "<div>text</div>");
  });

  test("mixed attribute types (boolean + quoted + unquoted)", () => {
    const result = stripAttributes('<input type=text disabled value="hello" />');
    assert.equal(result, "<input/>");
  });

  test("attributes with spaces around =", () => {
    const result = stripAttributes('<div class = "foo" id = "bar">');
    assert.equal(result, "<div>");
  });

  test("uppercase tag names handled (tokenizer lowercases)", () => {
    const result = stripAttributes('<DIV CLASS="x"><P ID="y">hello</P></DIV>');
    assert(result.includes("<div>"));
    assert(result.includes("<p>"));
    assert(result.includes("</p>"));
    assert(result.includes("</div>"));
    assert(!result.includes("CLASS"));
    assert(!result.includes("ID"));
  });

  test("attributes with newlines in values", () => {
    const result = stripAttributes('<div data-x="line1\nline2">text</div>');
    assert.equal(result, "<div>text</div>");
  });

  test("style attribute removed", () => {
    const result = stripAttributes('<div style="color: red; font-size: 12px;">styled</div>');
    assert.equal(result, "<div>styled</div>");
  });

  test("multiple tags with attributes in sequence", () => {
    const result = stripAttributes('<a href="/1">one</a><a href="/2">two</a><a href="/3">three</a>');
    // No whitespace between adjacent tags → no space inserted by collapseWhitespace
    assert.equal(result, "<a>one</a><a>two</a><a>three</a>");
  });

  test("multiple tags with whitespace between them", () => {
    const result = stripAttributes('<a href="/1">one</a> <a href="/2">two</a> <a href="/3">three</a>');
    assert.equal(result, "<a>one</a> <a>two</a> <a>three</a>");
  });

  test("closing tags with no attributes pass through", () => {
    const result = stripAttributes('<div class="x">text</div>');
    assert(result.includes("</div>"));
  });

  test("nested tags with attributes", () => {
    const result = stripAttributes('<div class="outer"><span id="inner"><b title="bold">text</b></span></div>');
    assert.equal(result, "<div><span><b>text</b></span></div>");
  });

  test("attribute values containing = sign", () => {
    const result = stripAttributes('<div data-eq="a=b+c">text</div>');
    assert.equal(result, "<div>text</div>");
  });

  test("attribute values containing quotes", () => {
    const result = stripAttributes('<div title="he said \'hi\'">text</div>');
    assert.equal(result, "<div>text</div>");
  });
});

// ── getAttr() / getAttrDecoded() ────────────────────────────────────

describe("getAttr()", () => {

  test("finds attribute by name (case-insensitive)", () => {
    const tokens = collectTokens('<a href="https://example.com" target="_blank">');
    const tag = tokens[0] as { kind: "tag"; attributes: Array<{ name: string; value: string | null }> };
    assert.equal(getAttr(tag, "href"), "https://example.com");
    assert.equal(getAttr(tag, "HREF"), "https://example.com");
    assert.equal(getAttr(tag, "target"), "_blank");
  });

  test("returns null for missing attribute", () => {
    const tokens = collectTokens('<a href="/">');
    const tag = tokens[0] as { kind: "tag"; attributes: Array<{ name: string; value: string | null }> };
    assert.equal(getAttr(tag, "class"), null);
    assert.equal(getAttr(tag, "id"), null);
  });

  test("returns null for boolean attribute value", () => {
    const tokens = collectTokens("<input disabled>");
    const tag = tokens[0] as { kind: "tag"; attributes: Array<{ name: string; value: string | null }> };
    assert.equal(getAttr(tag, "disabled"), null);
  });

  test("tag with no attributes", () => {
    const tokens = collectTokens("<div>");
    const tag = tokens[0] as { kind: "tag"; attributes: Array<{ name: string; value: string | null }> };
    assert.equal(getAttr(tag, "class"), null);
  });
});

describe("getAttrDecoded()", () => {

  test("decodes entities in attribute value", () => {
    const tokens = collectTokens('<a title="hello &amp; world">');
    const tag = tokens[0] as { kind: "tag"; attributes: Array<{ name: string; value: string | null }> };
    assert.equal(getAttrDecoded(tag, "title"), "hello & world");
  });

  test("decodes nbsp in attribute value", () => {
    const tokens = collectTokens('<a title="foo&nbsp;bar">');
    const tag = tokens[0] as { kind: "tag"; attributes: Array<{ name: string; value: string | null }> };
    assert.equal(getAttrDecoded(tag, "title"), "foo\u00A0bar");
  });

  test("returns null for missing attribute", () => {
    const tokens = collectTokens('<a href="/">');
    const tag = tokens[0] as { kind: "tag"; attributes: Array<{ name: string; value: string | null }> };
    assert.equal(getAttrDecoded(tag, "title"), null);
  });

  test("returns null for boolean attribute", () => {
    const tokens = collectTokens("<input disabled>");
    const tag = tokens[0] as { kind: "tag"; attributes: Array<{ name: string; value: string | null }> };
    assert.equal(getAttrDecoded(tag, "disabled"), null);
  });

  test("decodes numeric entities in attribute value", () => {
    const tokens = collectTokens('<a title="&#8364;100">');
    const tag = tokens[0] as { kind: "tag"; attributes: Array<{ name: string; value: string | null }> };
    assert.equal(getAttrDecoded(tag, "title"), "\u20AC100");
  });
});

// ── resolveStripMethod() ────────────────────────────────────────────

describe("resolveStripMethod()", () => {

  test("text/html applies strip normally", () => {
    assert.equal(resolveStripMethod("attributes", "text/html"), "attributes");
    assert.equal(resolveStripMethod("tags", "text/html"), "tags");
    assert.equal(resolveStripMethod("html2md", "text/html"), "html2md");
  });

  test("text/html with charset applies strip normally", () => {
    assert.equal(resolveStripMethod("attributes", "text/html; charset=utf-8"), "attributes");
  });

  test("application/xhtml+xml applies strip normally", () => {
    assert.equal(resolveStripMethod("html2md", "application/xhtml+xml"), "html2md");
  });

  test("application/xhtml+xml with charset applies strip normally", () => {
    assert.equal(resolveStripMethod("tags", "application/xhtml+xml; charset=utf-8"), "tags");
  });

  test("application/json falls back to none", () => {
    assert.equal(resolveStripMethod("attributes", "application/json"), "none");
    assert.equal(resolveStripMethod("html2md", "application/json"), "none");
  });

  test("text/plain falls back to none", () => {
    assert.equal(resolveStripMethod("tags", "text/plain"), "none");
    assert.equal(resolveStripMethod("whitespace", "text/plain"), "none");
  });

  test("requested none always returns none (even for HTML)", () => {
    assert.equal(resolveStripMethod("none", "text/html"), "none");
    assert.equal(resolveStripMethod("none", "text/html; charset=utf-8"), "none");
    assert.equal(resolveStripMethod("none", "application/json"), "none");
  });

  test("unknown content type falls back to none", () => {
    assert.equal(resolveStripMethod("attributes", "image/png"), "none");
    assert.equal(resolveStripMethod("tags", "application/octet-stream"), "none");
  });

  test("case-insensitive content type matching", () => {
    assert.equal(resolveStripMethod("attributes", "TEXT/HTML"), "attributes");
    assert.equal(resolveStripMethod("html2md", "Text/Html; Charset=UTF-8"), "html2md");
  });
});

// ── applyStrip() dispatcher ─────────────────────────────────────────

describe("applyStrip()", () => {

  test("dispatches to stripNone for 'none' mode", () => {
    const input = "<div class='x'>hello</div>";
    assert.equal(applyStrip(input, "none"), input);
  });

  test("dispatches to stripWhitespace for 'whitespace' mode", () => {
    assert.equal(applyStrip("foo   bar", "whitespace"), "foo bar");
  });

  test("dispatches to stripAttributes for 'attributes' mode", () => {
    const result = applyStrip('<div class="x">hello</div>', "attributes");
    assert.equal(result, "<div>hello</div>");
  });

  test("dispatches to stripTags for 'tags' mode", () => {
    assert.equal(applyStrip("<p>hello</p>", "tags"), "hello");
  });

  test("dispatches to stripHtmlToMd for 'html2md' mode", () => {
    const result = applyStrip("<h1>Title</h1>", "html2md");
    assert(result.includes("# Title"));
  });

  test("unknown mode falls back to stripNone", () => {
    const input = "<div>hello</div>";
    // @ts-expect-error — testing unknown mode fallback
    assert.equal(applyStrip(input, "unknown"), input);
  });
});


