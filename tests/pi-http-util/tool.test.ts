/**
 * tool.test.ts — Tests for the pi-http-util execute pipeline.
 *
 * Exercises the actual fetch+strip logic (not just pure strip functions)
 * to catch bugs in response construction, header collection, and strip fallback.
 */

import http from "node:http";
import { assert, describe, test } from "./test-harness.ts";
import { runSummary } from "./test-harness.ts";
import {
  executeFetch,
  validateUrl,
  buildHeaders,
} from "../../src/fetch.ts";
import { defaultHttpClient } from "../../src/http_client.ts";

// ── Server setup ─────────────────────────────────────────────────────

let server: http.Server;
let baseUrl: string;

async function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost`);

      if (url.pathname === "/html") {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "X-Custom-Header": "test-value",
        });
        res.end("<html><body><h1>Hello</h1></body></html>");
        return;
      }

      if (url.pathname === "/json") {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "X-Custom-Header": "json-value",
        });
        res.end(JSON.stringify({ message: "hello", status: "ok" }));
        return;
      }

      if (url.pathname === "/plain") {
        res.writeHead(200, {
          "Content-Type": "text/plain",
          "X-Custom-Header": "plain-value",
        });
        res.end("plain text content");
        return;
      }

      if (url.pathname === "/404") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }

      res.writeHead(404);
      res.end("Unknown route");
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr) {
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      } else {
        reject(new Error("Could not get server address"));
      }
    });

    server.on("error", reject);
  });
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

// ── Helper ───────────────────────────────────────────────────────────

async function doFetch(url: string, overrides?: { strip?: string }): Promise<any> {
  return executeFetch({
    url,
    method: "GET",
    headers: buildHeaders(),
    followRedirects: true,
    strip: (overrides?.strip || "html2md") as any,
    signal: AbortSignal.timeout(5000),
  });
}

// ── Tests ────────────────────────────────────────────────────────────

export async function runTests() {
  await startServer();

  await describe("http_fetch tool — response structure", async () => {

    test("response includes httpStatusCode", async () => {
      const result = await doFetch(`${baseUrl}/html`);
      assert.equal(result.httpStatusCode, 200);
    });

    test("response includes headers as key-value pairs", async () => {
      const result = await doFetch(`${baseUrl}/html`);
      const headers = result.headers;
      assert(Array.isArray(headers), "headers should be an array");
      assert(headers.length > 0, "headers should not be empty");

      const keys = headers.map((h: any) => h.key.toLowerCase());
      assert(keys.includes("content-type"), "should include Content-Type header");

      const custom = headers.find((h: any) => h.key.toLowerCase() === "x-custom-header");
      assert(custom != null, "should include custom header");
      assert.equal(custom.value, "test-value");
    });

    test("response includes requestedStripMethod and appliedStripMethod", async () => {
      const result = await doFetch(`${baseUrl}/html`);
      assert.equal(result.requestedStripMethod, "html2md");
      assert.equal(result.appliedStripMethod, "html2md");
    });

    test("html2md on HTML applies strip normally", async () => {
      const result = await doFetch(`${baseUrl}/html`);
      assert.equal(result.appliedStripMethod, "html2md");
      assert(result.strippedText.includes("# Hello"), "HTML should be converted to Markdown");
      assert(!result.strippedText.includes("<html"), "HTML tags should be removed");
    });

    test("html2md on JSON falls back to none", async () => {
      const result = await doFetch(`${baseUrl}/json`);
      assert.equal(result.requestedStripMethod, "html2md");
      assert.equal(result.appliedStripMethod, "none");
      // Content should be valid JSON (unchanged)
      const parsed = JSON.parse(result.strippedText);
      assert.equal(parsed.message, "hello");
      assert.equal(parsed.status, "ok");
    });

    test("html2md on plain text falls back to none", async () => {
      const result = await doFetch(`${baseUrl}/plain`);
      assert.equal(result.requestedStripMethod, "html2md");
      assert.equal(result.appliedStripMethod, "none");
      assert.equal(result.strippedText, "plain text content");
    });

    test("strip=none on JSON stays none", async () => {
      const result = await doFetch(`${baseUrl}/json`, { strip: "none" });
      assert.equal(result.requestedStripMethod, "none");
      assert.equal(result.appliedStripMethod, "none");
    });

    test("404 response reports correct status and isError", async () => {
      const result = await doFetch(`${baseUrl}/404`);
      assert.equal(result.httpStatusCode, 404);
      assert.equal(result.isError, true);
    });

    test("rawText preserves original response", async () => {
      const result = await doFetch(`${baseUrl}/json`);
      const parsed = JSON.parse(result.rawText);
      assert.equal(parsed.message, "hello");
    });

    test("unreachable host throws error", async () => {
      try {
        await doFetch("http://192.0.2.1:1/test");
        assert.fail("Should have thrown");
      } catch (err: any) {
        assert(err != null);
      }
    });

    test("validateUrl rejects invalid URLs", async () => {
      assert(validateUrl("not-a-url") != null);
      assert(validateUrl("") != null);
      assert.equal(validateUrl("https://example.com"), null);
    });

    test("buildHeaders includes Chrome User-Agent", async () => {
      const headers = buildHeaders();
      assert(headers["User-Agent"].includes("Chrome"));
      assert(headers["Accept"].includes("text/html"));
    });

    test("buildHeaders merges custom headers", async () => {
      const headers = buildHeaders({ "X-Custom": "value" });
      assert.equal(headers["X-Custom"], "value");
      assert(headers["User-Agent"].includes("Chrome"), "default headers preserved");
    });

    test("executeFetch does not mutate caller's headers object", async () => {
      const sharedHeaders = { "User-Agent": "test", "Accept": "*/*" };
      const originalKeys = Object.keys(sharedHeaders).sort().join(",");
      await executeFetch({
        url: `${baseUrl}/html`,
        method: "POST",
        headers: sharedHeaders,
        body: "test body",
        followRedirects: true,
        strip: "none" as any,
        signal: AbortSignal.timeout(5000),
      });
      const afterKeys = Object.keys(sharedHeaders).sort().join(",");
      assert.equal(originalKeys, afterKeys, `Headers mutated: was ${originalKeys}, now ${afterKeys}`);
      assert(!("Content-Type" in sharedHeaders), "Content-Type should not be added to caller's object");
    });
  });

  await describe("http_client", async () => {

    test("defaultHttpClient delegates to global fetch", async () => {
      const res = await defaultHttpClient.request(`${baseUrl}/html`, { method: "GET" });
      assert.equal(res.status, 200);
      const text = await res.text();
      assert(text.includes("<html>"));
    });

    test("mock client is used when injected", async () => {
      const mockClient = {
        request(_url: string, _init: RequestInit) {
          return Promise.resolve(new Response("mocked response", {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          }));
        },
      };
      const result = await executeFetch({
        url: `${baseUrl}/html`,
        method: "GET",
        headers: buildHeaders(),
        followRedirects: true,
        strip: "none" as any,
        client: mockClient,
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(result.strippedText, "mocked response");
    });

    test("default client is used when no client is provided", async () => {
      const result = await executeFetch({
        url: `${baseUrl}/json`,
        method: "GET",
        headers: buildHeaders(),
        followRedirects: true,
        strip: "none" as any,
        signal: AbortSignal.timeout(5000),
      });
      const parsed = JSON.parse(result.strippedText);
      assert.equal(parsed.message, "hello");
    });
  });

  await stopServer();
}

// Allow standalone execution: node --experimental-strip-types tool.test.ts
if (process.argv[1]?.endsWith("tool.test.ts")) {
  (async () => {
    await runTests();
    const ok = await runSummary();
    if (!ok) process.exit(1);
  })();
}
