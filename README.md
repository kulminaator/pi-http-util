# HTTP Utility Extension

A PI Agent extension for fetching web content, transforming HTML into clean output, and making raw HTTP requests.
It's main functionality http_fetch is designed to save tokens on LLM converting html to md or other compact shapes 
before passing it to the LLM.

## Usage

Just tell the LLM to do something related to http, if your model has tool usage knowledge everything else is automatic.

Examples:
```
Give me an overview of the project at https://github.com/kulminaator/pi-http-util
```
or (your LLM most likely knows the addresses of news pages anyway)
```
Find me the first 5 headlines from the news today
```
or
```
Using our tools, make a http post request with json content {"question": "who is there"} against the server listening on localhost on port 9000
```

NB! llm might also invoke this on it's own when it feels the need to look something up.
If you ask it something like this:
```
What are the latest changes that were done to threejs?
```

## Installation

### Via `pi install` (recommended)

Install directly from the GitHub repository:

```bash
pi install git:github.com/kulminaator/pi-http-util
```
or from npm:
```bash
pi install npm:pi-http-util
```

This writes the package to your user settings (`~/.pi/agent/settings.json`) so it is available for all projects.
Use `-l` to install project-locally (`.pi/settings.json`) instead:

```bash
pi install -l git:github.com/kulminaator/pi-http-util
```

Pin to a specific tag or branch:

```bash
pi install git:github.com/kulminaator/pi-http-util@v2.0.0
```

### Via `settings.json`

Add the package manually to your settings:

```json
{
  "packages": [
    "git:github.com/kulminaator/pi-http-util"
  ]
}
```

### Manual installation

Clone the repository and place it in pi's extension directory:

```bash
git clone https://github.com/kulminaator/pi-http-util.git ~/.pi/agent/extensions/pi-http-util
```

Or for project-local use:

```bash
git clone https://github.com/kulminaator/pi-http-util.git .pi/extensions/pi-http-util
```

### Try it without installing

Test the extension for a single session:

```bash
pi -e git:github.com/kulminaator/pi-http-util
```

## What tools get added and What It Does


### Tools Registered

| Tool | Description |
|------|-------------|
| `http_fetch` | Fetch a URL with configurable HTTP method, headers, body, redirects, strip mode, truncation limits, and strategy |
| `in_page_search` | Search a webpage for text with configurable strip mode (`html2md`, `tags`, `attributes`, `whitespace`, `none`), return matching snippets with surrounding context |
| `raw_http_request` | Send raw HTTP requests with no content stripping, file I/O, and size limits |


## Architecture

### The design of http_fetch
We download original html and pass it through a converter, the most complex converter is html2md

The HTML-to-Markdown converter uses a **SAX-style event-driven pipeline**:

```
tokenize(html)  →  emitEvents(html)  →  processEvents(events)  →  markdown
   tokenizer       md_emitter            md_handler
```

The other methods like strip attributes and strip tags just remove tag attributes or whole tags from the content (with the aim to reduce the ingested size on llm).

#### Content-Type Safety

The `resolveStripMethod(requested, contentType)` function checks whether the response `Content-Type` contains `text/html`. If not, it returns `"none"` regardless of the requested mode (unless `"none"` was already requested). This prevents HTML-specific transformations from corrupting JSON, plain text, or other non-HTML payloads.

## File Layout

Source code in `src/`
Tests in `tests`

## Running the Tests

Requires **Node.js ≥ 22** (for `--experimental-strip-types` to run TypeScript without compilation).

```bash
# Run all tests (recommended)
node --experimental-strip-types tests/pi-http-util/run-tests.ts

# Or run a single test file standalone
node --experimental-strip-types tests/pi-http-util/tokenizer.test.ts
node --experimental-strip-types tests/pi-http-util/integration.test.ts
```

### Test writing guidelines:

Tests are split into logical files, each independently runnable:

- **Unit tests** — pure functions from the extension modules, no I/O
- **Integration tests** — spin up a local `http.Server` on a random port, exercise fetch + strip against real HTTP routes, tear down after
- **Shared harness** — `test-harness.ts` provides `describe`, `test`, counters, and `runSummary()` used by all files
- **Timeouts** — each test has a 5-second timeout to prevent hangs
