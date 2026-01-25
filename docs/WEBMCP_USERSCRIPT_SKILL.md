# WebMCP Development Skill

## Executive Summary

This document outlines the implementation of a **unified Claude Code skill** for WebMCP tool development. The skill teaches agents to create, test, and iterate on MCP tools for any website or web app - using chrome-devtools-mcp for the entire development loop.

### The Power Couple

```
┌─────────────────────────────────────────────────────────────────────┐
│                     UNIFIED SKILL (webmcp)                          │
│           Progressive disclosure - sections loaded as needed        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  SKILL.md (~300 lines)     references/ (loaded on-demand)          │
│  ├── Quick Start           ├── REACT_INTEGRATION.md                │
│  ├── Injection Loop        ├── USERSCRIPT_GUIDE.md                 │
│  ├── Tool Design           ├── PRODUCTION_TESTING.md               │
│  └── Self-Testing          ├── VANILLA_JS.md                       │
│                            └── TROUBLESHOOTING.md                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ uses
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   MCP SERVER (chrome-devtools-mcp)                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Core Tools:              WebMCP Tools:                             │
│  • navigate_page          • inject_webmcp_script (with esbuild)    │
│  • take_snapshot          • diff_webmcp_tools                       │
│  • read_console           • webmcp_{domain}_page{idx}_{name}        │
│  • click_element                                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### The Vision

```
User: "Add MCP tools to my Rails app"  OR  "Create tools for Notion"
      → goes to sleep

Agent (with webmcp skill):
  1. Detect context (your app vs external site)
  2. Navigate to target page
  3. Take snapshot to understand structure
  4. Create workspace with package.json (if dependencies needed)
  5. Write clean TypeScript source file
  6. inject_webmcp_script → auto-builds with esbuild → injects → test
  7. Iterate until working
  8. Final source is clean, readable, production-ready

User wakes up: working MCP tools, ready for production or distribution
```

### Why a Skill?

From the [Claude Code docs](https://code.claude.com/docs/en/skills):
- Skills are auto-discovered and applied when Claude recognizes the task
- Skills bundle supporting documentation, templates, and scripts
- Skills run in the main conversation, enabling live iteration
- Perfect for "richer workflows that Claude can auto-apply"

This workflow is ideal for a skill because:
1. **Specialized domain** - Userscript patterns, WebMCP APIs, DOM helpers
2. **Self-verification** - Agent tests its own work via chrome-devtools-mcp
3. **Repeatable process** - Same steps for any website
4. **Reference materials** - Templates, helper docs, patterns

---

## Architecture

### Two-Tier Build System

The key insight: **clean source files** for humans, **bundled IIFE** for injection.

```
SOURCE (human-readable)              BUILD                    RUNTIME
──────────────────────────────────────────────────────────────────────────

userscripts/gmail/src/index.ts       esbuild (in-memory)      Browser
├── import { wait }                  ─────────────────►
│   from '@webmcp/helpers'           IIFE bundle              inject_webmcp_script
│                                    (deps inlined)           ──────────────────►
├── registerTool({                                            Tools registered
│     name: 'get_emails',            ~10-50ms                 as first-class MCP
│     handler: async () => {                                  tools
│       await wait('.email-row');
│       ...
│     }
│   })
```

### Why Two Bundlers?

| Bundler | Use Case | Why |
|---------|----------|-----|
| **esbuild** | `inject_webmcp_script` internal | `write: false` for in-memory output, no disk I/O, ~10ms builds |
| **tsdown** | Workspace template builds | Better DX, Rollup plugin ecosystem, future-proof (Vite 8+) |

**esbuild** is perfect for injection because:
```typescript
const result = await esbuild.build({
  entryPoints: [filePath],
  bundle: true,
  format: 'iife',
  write: false,  // ← Returns code directly, no temp files
  platform: 'browser',
});
const code = result.outputFiles[0].text;
// Inject immediately
```

**tsdown** is perfect for workspaces because:
- Rust-based (Rolldown), blazing fast
- ESM-first, tree-shakable
- Rollup/Vite plugin compatible
- Better for library/userscript development

---

## Workspace Structure

Each target site gets its own mini-project with dependencies:

```
userscripts/
├── gmail/
│   ├── package.json          ← { "dependencies": { "gmail.js": "^1.1" } }
│   ├── tsconfig.json
│   ├── tsdown.config.ts      ← For standalone builds (distribution)
│   ├── node_modules/         ← pnpm install
│   └── src/
│       └── index.ts          ← Clean, readable source
│
├── notion/
│   ├── package.json
│   └── src/
│       └── index.ts
│
└── _template/                ← Agent copies for new sites
    ├── package.json
    ├── tsconfig.json
    ├── tsdown.config.ts
    └── src/
        └── index.ts
```

### Template package.json

```json
{
  "name": "webmcp-userscript",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsdown src/index.ts --format iife --out-dir dist",
    "dev": "tsdown src/index.ts --format iife --out-dir dist --watch"
  },
  "devDependencies": {
    "tsdown": "^0.19.0",
    "typescript": "^5.8.0"
  },
  "dependencies": {
    "@webmcp/helpers": "workspace:*"
  }
}
```

### Template tsdown.config.ts

```typescript
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['iife'],
  clean: true,
  // No externals - bundle everything for standalone distribution
});
```

### Template src/index.ts

```typescript
// Clean, readable source - dependencies bundled at build time
import { waitForElement, getText } from '@webmcp/helpers';

navigator.modelContext.registerTool({
  name: 'example_tool',
  description: 'An example tool',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' }
    },
    required: ['query']
  },
  handler: async ({ query }) => {
    const element = await waitForElement('.result');
    const text = getText(element);
    return {
      content: [{ type: 'text', text: `Found: ${text}` }]
    };
  },
});
```

---

## The `inject_webmcp_script` Tool (Enhanced)

### Key Enhancement: Automatic Building

When you pass a `.ts` or `.tsx` file, the tool **automatically builds** with esbuild:

```typescript
inject_webmcp_script({
  file_path: 'userscripts/gmail/src/index.ts'  // Source file, not built
})

// Tool automatically:
// 1. Detects .ts extension
// 2. Resolves imports from node_modules
// 3. Bundles with esbuild (~10ms, in-memory)
// 4. Prepends polyfill if needed
// 5. Injects the IIFE
// 6. Waits for tool registration
```

No explicit build step. Agent just edits source and injects.

### Implementation

```typescript
import * as esbuild from 'esbuild';
import { readFileSync, existsSync } from 'fs';
import { dirname, join, extname } from 'path';
import { getPolyfillCode } from '../polyfillLoader.js';

export const injectWebMCPScript = defineTool({
  name: 'inject_webmcp_script',
  description:
    'Inject a WebMCP userscript into the page for testing. ' +
    'Automatically handles @mcp-b/global polyfill injection - if the page ' +
    'does not have navigator.modelContext, the polyfill is prepended automatically. ' +
    'After injection, tools register as first-class MCP tools (webmcp_{domain}_page{idx}_{name}). ' +
    'Userscripts should NOT import the polyfill - just call navigator.modelContext.registerTool(). ' +
    'Use this for rapid prototyping and testing MCP tools on any website.',
  annotations: {
    title: 'Inject WebMCP Script',
    category: ToolCategory.WEBMCP,
    readOnlyHint: false,
  },
  schema: {
    code: zod.string().optional().describe(
      'The userscript code to inject. Just tool registration code - ' +
      'polyfill is auto-injected if needed. Either code or file_path must be provided.'
    ),
    file_path: zod.string().optional().describe(
      'Path to a JavaScript file containing the userscript to inject. ' +
      'If .ts/.tsx, automatically bundles with esbuild (resolves imports). ' +
      'Either code or file_path must be provided.'
    ),
    wait_for_tools: zod.boolean().optional().default(true).describe(
      'Wait for tools to register before returning. Default: true'
    ),
    timeout: zod.number().optional().default(5000).describe(
      'Timeout in ms to wait for tools. Default: 5000'
    ),
    page_index: zod.number().int().optional().describe(
      'Target page index. Default: currently selected page'
    ),
  },
  handler: async (request, response, context) => {
    const { code, file_path, wait_for_tools = true, timeout = 5000, page_index } = request.params;

    if (!code && !file_path) {
      throw new Error('Either code or file_path must be provided');
    }

    const page = page_index !== undefined
      ? context.getPageByIdx(page_index)
      : context.getSelectedPage();

    response.appendResponseLine(`Target: ${page.url()}`);
    response.appendResponseLine('');

    let scriptCode: string;

    // Handle file_path - with automatic TypeScript bundling
    if (file_path) {
      const ext = extname(file_path).toLowerCase();

      if (ext === '.ts' || ext === '.tsx') {
        // TypeScript file - bundle with esbuild
        response.appendResponseLine(`Bundling ${file_path} with esbuild...`);

        try {
          const result = await esbuild.build({
            entryPoints: [file_path],
            bundle: true,
            format: 'iife',
            write: false,
            platform: 'browser',
            target: 'es2020',
            // Resolve from the file's directory for node_modules
            absWorkingDir: dirname(file_path),
          });

          scriptCode = result.outputFiles[0].text;
          response.appendResponseLine(`✓ Bundled (${(scriptCode.length / 1024).toFixed(1)}KB)`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          response.appendResponseLine(`✗ Build failed: ${message}`);
          response.appendResponseLine('');
          response.appendResponseLine('Check that dependencies are installed (pnpm install)');
          return;
        }
      } else {
        // JavaScript file - read directly
        if (!existsSync(file_path)) {
          throw new Error(`File not found: ${file_path}`);
        }
        scriptCode = readFileSync(file_path, 'utf-8');
        response.appendResponseLine(`✓ Loaded ${file_path}`);
      }
    } else {
      scriptCode = code!;
    }

    try {
      // Check if polyfill already exists
      const hasPolyfill = await page.evaluate(() =>
        typeof navigator !== 'undefined' &&
        typeof navigator.modelContext !== 'undefined'
      );

      let codeToInject = scriptCode;

      if (hasPolyfill) {
        response.appendResponseLine('✓ Polyfill already present');
      } else {
        response.appendResponseLine('Injecting @mcp-b/global polyfill...');
        const polyfillCode = getPolyfillCode();
        codeToInject = polyfillCode + ';\n' + scriptCode;
        response.appendResponseLine('✓ Polyfill prepended');
      }

      // Inject the script
      response.appendResponseLine('Injecting userscript...');

      await page.evaluate((bundleCode: string) => {
        const script = document.createElement('script');
        script.textContent = bundleCode;
        script.id = '__webmcp_injected_script__';
        // Remove any previous injection
        document.getElementById('__webmcp_injected_script__')?.remove();
        document.head.appendChild(script);
      }, codeToInject);

      response.appendResponseLine('✓ Script injected');

      if (!wait_for_tools) {
        response.appendResponseLine('');
        response.appendResponseLine('Use diff_webmcp_tools to verify registration.');
        return;
      }

      // Wait for tools with proper polling (not magic sleep)
      response.appendResponseLine(`Waiting for tools (${timeout}ms)...`);

      const startTime = Date.now();
      let lastToolCount = 0;

      while (Date.now() - startTime < timeout) {
        await new Promise(r => setTimeout(r, 100)); // Fast polling

        try {
          const result = await context.getWebMCPClient(page);
          if (result.connected) {
            const { tools } = await result.client.listTools();

            if (tools.length > 0) {
              // Wait a bit more if tools are still registering
              if (tools.length > lastToolCount) {
                lastToolCount = tools.length;
                await new Promise(r => setTimeout(r, 100));
                continue;
              }

              // Sync to tool hub
              const toolHub = context.getToolHub();
              if (toolHub) {
                await toolHub.syncToolsForPage(page, result.client);
              }

              response.appendResponseLine('');
              response.appendResponseLine(`✓ ${tools.length} tool(s) registered:`);
              response.appendResponseLine('');

              const domain = extractDomain(page.url());
              const pageIdx = context.getPages().indexOf(page);

              for (const tool of tools) {
                const firstClassName = `webmcp_${domain}_page${pageIdx}_${tool.name}`;
                response.appendResponseLine(`  • ${tool.name}`);
                response.appendResponseLine(`    → ${firstClassName}`);
                if (tool.description) {
                  const desc = tool.description.substring(0, 60);
                  response.appendResponseLine(`    ${desc}${tool.description.length > 60 ? '...' : ''}`);
                }
              }
              response.appendResponseLine('');
              response.appendResponseLine('Tools are now callable as first-class MCP tools.');
              return;
            }
          }
        } catch {
          // Continue polling
        }
      }

      // Timeout - provide debugging help
      response.appendResponseLine('');
      response.appendResponseLine(`⚠ No tools registered within ${timeout}ms.`);
      response.appendResponseLine('');
      response.appendResponseLine('Debug steps:');
      response.appendResponseLine('  1. list_console_messages - check for JS errors');
      response.appendResponseLine('  2. take_snapshot - verify page state');
      response.appendResponseLine('  3. Ensure script calls navigator.modelContext.registerTool()');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Detect CSP blocking
      if (message.includes('Content Security Policy') ||
          message.includes('script-src') ||
          message.includes('Refused to execute inline script')) {
        response.appendResponseLine('');
        response.appendResponseLine('⚠ Site has Content Security Policy blocking inline scripts.');
        response.appendResponseLine('');
        response.appendResponseLine('This site cannot be automated via script injection.');
        response.appendResponseLine('Consider: browser extension approach or different site.');
        return;
      }

      response.appendResponseLine(`Error: ${message}`);
      response.appendResponseLine('');
      response.appendResponseLine('Debug: list_console_messages to see errors');
    }
  },
});
```

---

## Script Injection Wisdom (Lessons Learned)

Based on research into CDP, Tampermonkey, Puppeteer, and browser extension patterns:

### 1. Timing is Everything

| Method | When it runs | Use case |
|--------|--------------|----------|
| `evaluateOnNewDocument` | Before ANY page JS | Override globals, intercept APIs |
| `evaluate` / inline script | After page load | Most tool registration ✓ |
| `@run-at document-start` | Before DOM exists | Monkey-patching built-ins |
| `@run-at document-end` | After HTML parsed | Most userscripts (default) ✓ |

**For WebMCP tools**, `document-end` timing is fine since we're adding capabilities, not intercepting.

### 2. Avoid Magic Sleep Numbers

**Bad** (what we had):
```typescript
await new Promise(r => setTimeout(r, 500)); // ← Magic number
```

**Good** (proper polling):
```typescript
while (Date.now() - startTime < timeout) {
  await new Promise(r => setTimeout(r, 100)); // Fast poll
  const { tools } = await client.listTools();
  if (tools.length > 0) break;
}
```

From [Puppeteer antipatterns](https://serpapi.com/blog/puppeteer-antipatterns/):
> "Sleeping causes a race condition... A duration that's long enough today might be too short tomorrow."

### 3. Use MutationObserver for Element Waiting

```typescript
// Include in @webmcp/helpers
function waitForElement(selector: string, timeout = 5000): Promise<Element> {
  return new Promise((resolve, reject) => {
    // Check if already exists
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for ${selector}`));
    }, timeout);
  });
}
```

MutationObserver is **more responsive** than polling - fires on microtask queue.

### 4. MAIN_WORLD is Required

From [Chrome content scripts docs](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts):
> "Content scripts live in an isolated world... JavaScript variables are not visible to the host page."

**We NEED MAIN_WORLD** because:
- Tools must access `navigator.modelContext` (set by polyfill)
- Tools must interact with page's DOM and possibly page's JS

Inline `<script>` tags always run in MAIN_WORLD ✓

### 5. CSP Will Block Some Sites

Sites with strict Content Security Policy (no `unsafe-inline`) will block:
- **Banking/finance** apps
- **Enterprise** apps (Salesforce, Workday, etc.)
- **Security-conscious** sites

**Our approach**: Detect early and fail gracefully with clear message:
```typescript
if (message.includes('Content Security Policy')) {
  response.appendResponseLine('⚠ Site has CSP blocking inline scripts.');
  response.appendResponseLine('Consider: browser extension approach.');
}
```

No workaround via CDP alone - this is a browser security feature.

### 6. Navigation Destroys Everything

When page navigates:
- Injected scripts are lost
- `navigator.modelContext` is gone
- All registered tools disappear

**We handle this** in `WebMCPClientTransport`:
```typescript
this._page.on('framenavigated', () => {
  this.onclose?.(); // Triggers tool cleanup in WebMCPToolHub
});
```

Agent must reinject after navigation.

### 7. Consider Polyfill Versioning

Future enhancement - check polyfill version before injection:
```typescript
if (!navigator.modelContext?.version ||
    navigator.modelContext.version < REQUIRED_VERSION) {
  // Inject/upgrade polyfill
}
```

### 8. Retry Logic for Transient Failures

```typescript
async function retryUntil<T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  options: { maxAttempts?: number; delay?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 100 } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await fn();
    if (predicate(result)) return result;
    await new Promise(r => setTimeout(r, delay));
  }

  throw new Error(`Failed after ${maxAttempts} attempts`);
}
```

---

## @webmcp/helpers Package

A lightweight, tree-shakable helpers library bundled into userscripts:

### API

```typescript
// DOM Interaction
export function waitForElement(selector: string, timeout?: number): Promise<Element>;
export function waitForElementRemoved(selector: string, timeout?: number): Promise<void>;
export function clickElement(selector: string): Promise<void>;
export function typeText(selector: string, text: string, options?: { clear?: boolean }): Promise<void>;
export function selectOption(selector: string, value: string): Promise<void>;

// Utilities
export function getText(el: Element | string): string | null;
export function getAllElements(selector: string): Element[];
export function isVisible(selector: string): boolean;
export function scrollIntoView(selector: string): Promise<void>;

// Response Helpers
export function textResponse(text: string): ToolResponse;
export function jsonResponse(data: unknown): ToolResponse;
export function errorResponse(message: string): ToolResponse;

// Retry Logic
export function retryUntil<T>(fn: () => Promise<T>, predicate: (r: T) => boolean, options?: RetryOptions): Promise<T>;
```

### Implementation Highlights

```typescript
// waitForElement with MutationObserver (not polling)
export function waitForElement(selector: string, timeout = 5000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for ${selector}`));
    }, timeout);
  });
}

// typeText that triggers React/Vue events properly
export async function typeText(
  selector: string,
  text: string,
  options: { clear?: boolean } = {}
): Promise<void> {
  const el = await waitForElement(selector);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    throw new Error(`Element not typeable: ${selector}`);
  }

  if (options.clear !== false) {
    el.value = '';
  }

  el.value = text;

  // Trigger events for React/Vue state updates
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// Response helpers
export function textResponse(text: string): ToolResponse {
  return { content: [{ type: 'text', text }] };
}

export function jsonResponse(data: unknown): ToolResponse {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function errorResponse(message: string): ToolResponse {
  return { content: [{ type: 'text', text: message }], isError: true };
}
```

---

## Agent Workflow

### Quick Iteration (No Dependencies)

```
1. navigate_page({ url: "https://example.com" })
2. take_snapshot  // Understand page structure
3. inject_webmcp_script({ code: `
     navigator.modelContext.registerTool({
       name: 'get_data',
       handler: async () => { ... }
     });
   ` })
4. Test: webmcp_example_com_page0_get_data()
5. If fails: list_console_messages → fix → reinject
6. Repeat until working
```

### With Dependencies (Workspace)

```
1. Create workspace:
   mkdir -p userscripts/gmail/src
   Write package.json, tsconfig.json
   pnpm install

2. Write clean source:
   userscripts/gmail/src/index.ts
   - Import helpers, external deps
   - Register tools
   - Readable, maintainable code

3. navigate_page({ url: "https://mail.google.com" })

4. inject_webmcp_script({
     file_path: "userscripts/gmail/src/index.ts"
   })
   // esbuild bundles automatically, resolves imports
   // Polyfill prepended if needed
   // IIFE injected

5. Test: webmcp_mail_google_com_page0_get_emails()

6. Edit src/index.ts → reinject → test
   // No manual build step!

7. Final source is clean, readable, ready for:
   - Production deployment
   - Distribution as userscript
   - Version control
```

### Production Testing (Rails/Django/Laravel)

```
1. App running at localhost:3000
2. navigate_page({ url: "http://localhost:3000/admin" })
3. take_snapshot
4. inject_webmcp_script({ code: `
     navigator.modelContext.registerTool({
       name: 'list_orders',
       handler: async () => {
         const rows = document.querySelectorAll('.order-row');
         // ... scrape data
       }
     });
   ` })
5. Test until working
6. Copy working code to production layout:

   <!-- app/views/layouts/application.html.erb -->
   <script src="https://unpkg.com/@mcp-b/global"></script>
   <script>
     // Paste tested code here
     navigator.modelContext.registerTool({ ... });
   </script>
```

---

## Skill Structure

```
skills/
└── webmcp/
    ├── SKILL.md                      # Main skill (<500 lines)
    │
    └── references/
        ├── REACT_INTEGRATION.md      # React hooks, useWebMCP
        ├── USERSCRIPT_GUIDE.md       # Sites you don't control
        ├── PRODUCTION_TESTING.md     # Rails/Django/Laravel
        ├── VANILLA_JS.md             # Framework-less apps
        ├── TOOL_DESIGN.md            # Patterns, categories
        ├── SELF_TESTING.md           # Verification protocol
        ├── HELPERS_API.md            # @webmcp/helpers reference
        └── TROUBLESHOOTING.md        # Common errors
```

### Progressive Disclosure

The skill reveals sections based on context:

```
User request detected
    │
    ├── "tools for Notion/GitHub/etc"
    │   → Show: Quick Start + USERSCRIPT_GUIDE
    │
    ├── "MCP for my Rails/Django app"
    │   → Show: Quick Start + PRODUCTION_TESTING
    │
    ├── "React app with MCP"
    │   → Show: Quick Start + REACT_INTEGRATION
    │
    └── "vanilla JS/HTML app"
        → Show: Quick Start + VANILLA_JS
```

---

## Repository Structure

```
npm-packages/
├── packages/
│   ├── chrome-devtools-mcp/
│   │   ├── src/tools/webmcp.ts       # inject_webmcp_script (with esbuild)
│   │   ├── src/tools/WebMCPToolHub.ts
│   │   ├── src/polyfillLoader.ts     # Loads @mcp-b/global IIFE
│   │   └── src/transports/
│   │
│   ├── global/                       # @mcp-b/global polyfill
│   │   └── dist/index.iife.js
│   │
│   ├── webmcp-helpers/               # NEW - @webmcp/helpers
│   │   ├── package.json
│   │   └── src/
│   │       ├── dom.ts                # waitForElement, typeText, etc.
│   │       ├── response.ts           # textResponse, errorResponse
│   │       └── index.ts
│   │
│   └── react-webmcp/                 # React hooks
│
├── userscripts/                      # NEW - workspace for userscripts
│   ├── _template/                    # Starting point
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsdown.config.ts
│   │   └── src/index.ts
│   │
│   └── [site-name]/                  # Agent creates as needed
│       ├── package.json
│       └── src/index.ts
│
├── examples/                         # Reference implementations
│   ├── hackernews.js
│   ├── github.js
│   └── ...
│
└── skills/
    └── webmcp/
        ├── SKILL.md
        └── references/
```

---

## The Complete Development & Distribution Flow

When a user says "I want to automate Gmail", the agent:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. SETUP WORKSPACE                                                  │
│    └── Clone site-package template to user's project                │
│        └── gmail-mcp/                                               │
│            ├── skills/gmail/SKILL.md    (mostly empty template)     │
│            └── userscript/src/index.ts  (empty template)            │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. DEVELOP TOOLS                                                    │
│    ├── Navigate to Gmail, take snapshots                            │
│    ├── Write tools in userscript/src/index.ts:                      │
│    │   ├── get_emails                                               │
│    │   ├── search_inbox                                             │
│    │   ├── send_email                                               │
│    │   └── archive_email                                            │
│    ├── inject_webmcp_script → esbuild bundles → test                │
│    └── Iterate until all tools work ✓                               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. UPDATE SKILL (the intelligence!)                                 │
│    └── Agent writes skills/gmail/SKILL.md documenting:              │
│        ├── What tools exist and what they do                        │
│        ├── How to COMBINE tools for common tasks:                   │
│        │   ├── "To find and archive old emails:"                    │
│        │   │   1. search_inbox({ query: "older_than:1y" })          │
│        │   │   2. For each: archive_email({ id })                   │
│        │   │                                                        │
│        │   ├── "To send a reply:"                                   │
│        │   │   1. get_emails({ thread_id })                         │
│        │   │   2. send_email({ reply_to, body })                    │
│        │   │                                                        │
│        │   └── "To organize inbox:" ...                             │
│        │                                                            │
│        ├── Gmail-specific quirks and tips                           │
│        └── Real examples and scenarios                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. DISTRIBUTE                                                       │
│    ├── Userscript → Upload to WebMCP Marketplace                    │
│    │   └── Syncs to Chrome extension, injects tools on Gmail        │
│    │                                                                │
│    └── Skill → Upload to Anthropic Skills Registry                  │
│        └── Others install: /install gmail-mcp                       │
│        └── They get the INTELLIGENCE without rediscovering!         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. OTHERS USE IT                                                    │
│                                                                     │
│    User: "Clean up my Gmail inbox"                                  │
│                                                                     │
│    Agent (finds gmail-mcp skill):                                   │
│      1. Reads SKILL.md → knows exactly how to combine tools         │
│      2. Follows documented "Inbox Zero" workflow                    │
│      3. Doesn't rediscover patterns - just executes!                │
│                                                                     │
│    The skill CAPTURES the intelligence the first agent developed.   │
└─────────────────────────────────────────────────────────────────────┘
```

### Why This Is Powerful

1. **First agent learns** → Documents in SKILL.md
2. **Future agents benefit** → Read the skill, skip the learning
3. **Community grows** → Each new site package adds to ecosystem
4. **Tools + Intelligence** → Not just plumbing, but how to use it

---

## Site Package Structure (Self-Contained)

**Key insight**: The skill is **completely self-contained**. Tools are bundled INSIDE the skill package. When distributed via Anthropic Skills Registry, users get EVERYTHING - both the intelligence AND the tools.

```
gmail-mcp/
├── SKILL.md                     # THE INTELLIGENCE
│   ├── name: gmail-mcp
│   ├── description: "Gmail automation..."
│   ├── ## Setup ← CRITICAL: tells agent where to find tools
│   ├── ## Available Tools
│   ├── ## Workflows (how to combine)
│   ├── ## Gmail-Specific Tips
│   └── ## Examples
│
├── tools/                       # THE PLUMBING (bundled with skill!)
│   ├── package.json             # Dependencies (gmail.js, etc.)
│   ├── tsconfig.json
│   └── src/
│       └── gmail.ts             # Clean, readable source
│
├── reference/                   # Progressive disclosure
│   ├── api.md                   # Detailed tool documentation
│   └── workflows.md             # Complex multi-step patterns
│
└── scripts/
    └── setup.sh                 # Optional automation
```

### How the Agent Finds and Injects Tools

The SKILL.md contains a **Setup section** that tells the agent exactly where to find the tools:

```markdown
## Setup

Before using these tools, ensure they're injected:

1. Navigate to Gmail: `navigate_page({ url: "https://mail.google.com" })`
2. Inject tools: `inject_webmcp_script({ file_path: "./tools/src/gmail.ts" })`
3. Verify: `diff_webmcp_tools` should show gmail tools

The tools source is bundled at `tools/src/gmail.ts`.
```

### The Injection Flow

```
User installs gmail-mcp from Anthropic Skills Registry
                    │
                    ▼
User: "Clean up my Gmail"
                    │
                    ▼
Agent finds gmail-mcp skill, reads SKILL.md
                    │
                    ▼
Agent checks: Are Gmail tools available? (diff_webmcp_tools)
                    │
        ┌───────────┴───────────┐
        │                       │
       YES                     NO
        │                       │
        ▼                       ▼
   Use workflows          Agent reads Setup section
   from SKILL.md          Agent runs: inject_webmcp_script({
        │                   file_path: "./tools/src/gmail.ts"
        │                 })
        │                 esbuild bundles automatically
        │                       │
        │                       ▼
        │                 Tools now available!
        │                       │
        └───────────┬───────────┘
                    │
                    ▼
           Agent executes workflows from SKILL.md
```

### Why Self-Contained?

| Aspect | Benefit |
|--------|---------|
| **Single distribution** | Just Anthropic Skills Registry - one place |
| **Everything included** | Tools + Intelligence in one package |
| **Agent knows where to find tools** | Documented path in Setup section |
| **Clean source travels** | Human-readable .ts, not bundled blob |
| **esbuild at inject time** | Handles bundling automatically |
| **Dependencies work** | tools/package.json has deps, esbuild resolves |

### Marketplace Is Optional

- **With Claude Code**: Skill brings everything, agent injects tools
- **Without Claude Code**: Marketplace + Chrome extension for auto-injection

The Anthropic Skills Registry is the primary distribution. The marketplace is for non-Claude-Code users who want browser-native injection.

### SKILL.md Template (Agent Fills In)

```markdown
---
name: {{site}}-mcp
description: |
  {{Site}} automation tools. Use when user wants to [actions].
  Triggers: {{site}}, [related keywords]
---

# {{Site}} MCP

## Setup

Before using these tools, ensure they're injected:

1. Navigate to {{Site}}: `navigate_page({ url: "{{site_url}}" })`
2. Inject tools: `inject_webmcp_script({ file_path: "./tools/src/{{site}}.ts" })`
3. Verify: `diff_webmcp_tools` should show {{site}} tools

The tools source is bundled at `tools/src/{{site}}.ts`.

## Available Tools

| Tool | Description |
|------|-------------|
| `tool_name` | What it does |

## Workflows

### [Common Task 1]
1. First tool call
2. Second tool call
3. Expected result

### [Common Task 2]
...

## {{Site}}-Specific Tips

- Quirk 1
- Quirk 2

## Examples

See [reference/examples.md](reference/examples.md)
```

---

## Implementation Phases

### Phase 1: Enhance inject_webmcp_script ← CURRENT

**Goal**: Automatic TypeScript bundling with esbuild

1. Add esbuild as dependency to chrome-devtools-mcp
2. Enhance inject_webmcp_script to detect .ts/.tsx
3. Bundle with esbuild when TypeScript detected
4. Resolve imports from node_modules automatically

**Success criteria**:
- [ ] `.ts` files auto-bundled before injection
- [ ] Imports from node_modules resolved
- [ ] No manual build step required
- [ ] Fast (~10-50ms for small files)

### Phase 2: Create @webmcp/helpers Package

**Goal**: Lightweight helpers library

1. Create `packages/webmcp-helpers/`
2. Implement DOM helpers (waitForElement, typeText, etc.)
3. Implement response helpers
4. Configure for tree-shaking (ESM exports)
5. Add to workspace dependencies

**Success criteria**:
- [ ] Helpers work when bundled into userscripts
- [ ] Tree-shakable (unused helpers removed)
- [ ] Well-documented API

### Phase 3: Create Site Package Template

**Goal**: Complete self-contained template for tools + skill

1. Create `templates/site-package/` (self-contained structure)
   ```
   templates/site-package/
   ├── SKILL.md                    # Template with Setup section
   │   ├── ## Setup ← Points to tools/src/{{site}}.ts
   │   ├── ## Available Tools
   │   ├── ## Workflows
   │   └── ## Tips
   │
   ├── tools/                      # Tools bundled WITH skill
   │   ├── package.json
   │   ├── tsconfig.json
   │   └── src/
   │       └── {{site}}.ts         # Agent writes tools here
   │
   ├── reference/
   │   ├── api.md
   │   └── workflows.md
   │
   └── scripts/
       └── setup.sh                # Optional automation
   ```

2. Setup script that:
   - Clones template to user's project
   - Renames {{site}} placeholders
   - Updates SKILL.md Setup section with correct paths
   - Installs dependencies (pnpm install in tools/)

3. **Key requirement**: SKILL.md must include Setup section telling agent:
   - Where tools are located: `./tools/src/{{site}}.ts`
   - How to inject: `inject_webmcp_script({ file_path: "..." })`
   - How to verify: `diff_webmcp_tools`

**Success criteria**:
- [ ] Agent can clone and customize template
- [ ] Template is self-contained (tools inside skill package)
- [ ] SKILL.md Setup section points to bundled tools
- [ ] Distribution via Anthropic Skills Registry includes everything

### Phase 4: Update webmcp-dev Skill

**Goal**: Teach agents the complete flow

1. Update SKILL.md to include:
   - Tool development workflow
   - **Skill writing workflow** (documenting tools + workflows)
   - Distribution instructions

2. Add reference files:
   - SKILL_WRITING.md - How to document tools and workflows
   - DISTRIBUTION.md - How to upload to registries

**Success criteria**:
- [ ] Agent develops tools AND writes skill
- [ ] Skill captures how to combine tools
- [ ] Ready for distribution to both registries

### Phase 5: Validate End-to-End

**Goal**: Complete flow from request to distribution

Test scenario:
```
User: "Create automation tools for Hacker News"

Agent:
  1. Clones site-package template
  2. Develops tools (get_stories, get_comments, etc.)
  3. Writes SKILL.md with workflows:
     - "To find trending topics..."
     - "To track a discussion..."
  4. Package ready for upload

Verify:
  - [ ] Tools work via injection
  - [ ] Skill documents all tools
  - [ ] Skill includes meaningful workflows
  - [ ] Another agent can use the skill effectively
```

### Phase 6: Distribution Integration (Future)

**Goal**: Automate upload to registries

1. Add `upload_to_marketplace` for userscripts
2. Document Anthropic Skills Registry upload process
3. Consider automation for skill publishing

**Success criteria**:
- [ ] One-command distribution
- [ ] Versioning handled
- [ ] Updates work

---

## Known Limitations

### 1. Content Security Policy (CSP)
Some sites block inline scripts. Detect and fail gracefully.
**Workaround**: Browser extension approach.

### 2. Page Navigation Clears Tools
Reinject after navigation.

### 3. Authenticated Pages
User must log in manually first.

### 4. Large Dependencies
Very large dependencies (e.g., full React) increase bundle size and injection time.
**Mitigation**: Keep userscripts focused; prefer lightweight helpers.

### 5. Source Maps
Bundled code has no source maps for debugging.
**Mitigation**: Use `list_console_messages` for error details.

---

## Success Criteria

### Core Loop Works
- [x] Agent can write tool code
- [x] Agent can inject via inject_webmcp_script
- [x] Agent can verify via diff_webmcp_tools
- [x] Agent can call first-class tools directly
- [x] Agent can debug via console + snapshot
- [x] Agent can iterate (fix → reinject → retest)

### Enhanced Features
- [ ] TypeScript auto-bundled with esbuild
- [ ] Imports resolved from node_modules
- [ ] @webmcp/helpers available
- [ ] Site package template ready

### Complete Development Flow
- [ ] Agent clones site-package template
- [ ] Agent develops tools (the plumbing)
- [ ] Agent writes SKILL.md (the intelligence)
- [ ] Skill documents how to COMBINE tools
- [ ] Package ready for dual distribution

### Distribution (Self-Contained)
- [ ] Skill package includes tools (in tools/ directory)
- [ ] SKILL.md Setup section tells agent where to find tools
- [ ] Single distribution: Anthropic Skills Registry
- [ ] Users get EVERYTHING: tools + intelligence
- [ ] Agent reads Setup → injects bundled tools → uses workflows
- [ ] Marketplace optional (for non-Claude-Code users)

---

## Related Documents

- [react-webmcp hooks](../react-webmcp/)
- [WEBMCP_DYNAMIC_TOOLS_IMPLEMENTATION.md](./WEBMCP_DYNAMIC_TOOLS_IMPLEMENTATION.md)
- [Claude Code Skills](https://code.claude.com/docs/en/skills)
- [esbuild API](https://esbuild.github.io/api/)
- [tsdown docs](https://tsdown.dev/)

---

## References

### Script Injection Research
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Tampermonkey Documentation](https://www.tampermonkey.net/documentation.php)
- [Content scripts - Chrome Developers](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Puppeteer Antipatterns](https://serpapi.com/blog/puppeteer-antipatterns/)
- [Apify - Injecting Code](https://docs.apify.com/academy/puppeteer-playwright/executing-scripts/injecting-code)
- [MutationObserver Pattern](https://macarthur.me/posts/use-mutation-observer-to-handle-nodes-that-dont-exist-yet/)
- [CSP Bypasses](https://www.cobalt.io/blog/csp-and-bypasses)
