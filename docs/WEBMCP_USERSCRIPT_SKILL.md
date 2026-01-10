# WebMCP Development Skill

## Executive Summary

This document outlines the implementation of a **unified Claude Code skill** for WebMCP tool development. The skill teaches agents to create, test, and iterate on MCP tools for any website or web app - using chrome-devtools-mcp for the entire development loop.

### The Power Couple

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SKILL (webmcp-dev)                            │
│  Progressive disclosure - reveals sections based on context          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │ Quick Start  │  │  Userscript  │  │  Production  │               │
│  │  (always)    │  │    Dev       │  │   Testing    │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │ Framework-   │  │ Distribution │  │  Marketplace │               │
│  │    less      │  │   (build)    │  │   (upload)   │  ← Future     │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ uses
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   MCP SERVER (chrome-devtools-mcp)                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Core Tools:           WebMCP Tools:          Future:               │
│  • navigate_page       • inject_webmcp_script • upload_to_marketplace│
│  • take_snapshot       • diff_webmcp_tools                          │
│  • read_console        • call_webmcp_tool                           │
│  • click_element       • webmcp_{domain}_*                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ references
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         REPO (npm-packages)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  packages/             examples/              skills/                │
│  • global (polyfill)   • hackernews/         • webmcp-dev/          │
│  • webmcp-shared       • rails-admin/          ├── SKILL.md         │
│  • react-webmcp        • vanilla-todo/         └── references/      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### The Vision

```
User: "Add MCP tools to my Rails app"  OR  "Create tools for Notion"
      → goes to sleep

Agent (with webmcp-dev skill):
  1. Detect context (your app vs external site)
  2. Navigate to target page
  3. Take snapshot to understand structure
  4. Write tool code (just JavaScript)
  5. inject_webmcp_script → test → iterate
  6. Once working:
     - Your app? → Show code to add to layout
     - Userscript? → Build for marketplace
  7. Future: upload_to_marketplace (automated)

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

## Current Implementation Status

### Already Implemented in chrome-devtools-mcp

The following infrastructure is **already built** and working:

#### WebMCPToolHub (Dynamic Tool Registration)
- Automatically registers WebMCP tools from web pages as **first-class MCP tools**
- Tools appear in `client.listTools()` alongside native chrome-devtools-mcp tools
- **Naming convention**: `webmcp_{domain}_page{idx}_{toolName}`
  - Example: `webmcp_notion_so_page0_search_pages`
  - Example: `webmcp_localhost_3000_page0_getTodos`
- Automatic cleanup when pages navigate or close
- Subscribes to `tools/list_changed` notifications for dynamic updates

#### WebMCPClientTransport
- MCP transport connecting to WebMCP servers in browser tabs
- Bridge script auto-injected into all pages via CDP
- Handles server-ready handshake, navigation detection, connection lifecycle

#### Available Tools
| Tool | Description |
|------|-------------|
| `diff_webmcp_tools` | List WebMCP tools on current page (with diff tracking) |
| `call_webmcp_tool` | Call a specific WebMCP tool by name |

#### Auto-Detection
- Pages with WebMCP are automatically detected after navigation
- Bridge script injected via `Page.addScriptToEvaluateOnNewDocument`
- Proactive detection after 500ms post-navigation

### Still Needed

| Component | Status | Description |
|-----------|--------|-------------|
| `inject_webmcp_script` tool | **NOT IMPLEMENTED** | Inject built userscript bundles for testing |
| `userscripts/` directory | **NOT CREATED** | Workspace for userscript development |
| `@webmcp/shared` package | **NOT CREATED** | Shared DOM helpers |
| Skill files | **NOT CREATED** | SKILL.md and references |

---

## Architecture

### How WebMCP Tools Become First-Class MCP Tools

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BROWSER (via CDP)                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Page: https://notion.so                                                    │
│  ├── Userscript runs (injected or via extension)                           │
│  ├── Calls navigator.modelContext.registerTool()                           │
│  └── TabServerTransport broadcasts tool via postMessage                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ WebMCPBridgeScript (auto-injected)
                                    │ ferries messages via CDP bindings
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         chrome-devtools-mcp                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  WebMCPClientTransport                                                      │
│  ├── Connects to page's TabServerTransport                                 │
│  └── Receives tool registrations                                           │
│                                                                             │
│  WebMCPToolHub                                                              │
│  ├── Syncs tools: webmcp_{domain}_page{idx}_{toolName}                     │
│  ├── Registers as first-class MCP tools                                    │
│  └── Handles add/update/remove on list_changed                             │
│                                                                             │
│  MCP Server                                                                 │
│  └── Exposes: take_snapshot, navigate_page, ..., webmcp_notion_so_page0_*  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ MCP Protocol (stdio/SSE)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Claude Code / MCP Client                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  client.listTools() returns:                                                │
│  - take_snapshot                                                            │
│  - navigate_page                                                            │
│  - diff_webmcp_tools                                                        │
│  - call_webmcp_tool                                                         │
│  - webmcp_notion_so_page0_search_pages    ← First-class!                   │
│  - webmcp_notion_so_page0_toggle_sidebar  ← First-class!                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Insight: First-Class Tool Exposure

After injection, WebMCP tools appear as **native MCP tools**. The agent can call them directly:

```
# Old way (still works):
call_webmcp_tool({ name: "search_pages", arguments: { query: "meeting" } })

# New way (first-class):
webmcp_notion_so_page0_search_pages({ query: "meeting" })
```

Both approaches work. First-class tools have better discoverability since they appear in the main tool list.

---

## Skill Structure (Progressive Disclosure)

```
skills/
└── webmcp-dev/
    ├── SKILL.md                      # Main skill - sections revealed by context
    │
    ├── references/
    │   │
    │   │  # Core (always available)
    │   ├── QUICK_START.md            # The injection loop
    │   ├── SELF_TESTING.md           # How to verify tools work
    │   ├── TROUBLESHOOTING.md        # Common errors and fixes
    │   │
    │   │  # Userscript Development
    │   ├── USERSCRIPT_GUIDE.md       # For sites you don't control
    │   ├── DISTRIBUTION.md           # Building for marketplace
    │   │
    │   │  # Production Testing
    │   ├── PRODUCTION_TESTING.md     # Rails/Django/Laravel workflow
    │   ├── VANILLA_JS.md             # Framework-less path to production
    │   │
    │   │  # Helpers
    │   ├── HELPERS.md                # @webmcp/shared API reference
    │   └── PATTERNS.md               # Common patterns (forms, search, etc.)
    │
    └── examples/
        ├── hackernews.js             # Userscript example
        ├── rails-admin.js            # Production testing example
        └── vanilla-todo.js           # Framework-less example
```

### Progressive Disclosure Logic

The skill reveals sections based on context:

```
User request detected
    │
    ├── "tools for Notion/GitHub/etc"
    │   → Show: QUICK_START + USERSCRIPT_GUIDE + DISTRIBUTION
    │
    ├── "MCP for my Rails/Django app"
    │   → Show: QUICK_START + PRODUCTION_TESTING + VANILLA_JS
    │
    ├── "add MCP to my static site"
    │   → Show: QUICK_START + VANILLA_JS
    │
    └── unclear context
        → Show: QUICK_START (universal)
        → Ask: "Is this your app or a site you don't control?"
```

---

## SKILL.md Design

```yaml
---
name: webmcp-dev
version: 1.0.0
description: |
  WebMCP tool development for any website or web app. Use when the user wants
  to create MCP tools - whether for their own app (Rails, Django, Laravel,
  vanilla JS) or for sites they don't control (Notion, GitHub, etc.).

  This skill enables autonomous iteration: write code → inject → test → fix →
  repeat. No build step required. Includes self-testing via chrome-devtools-mcp.

  The agent detects context and reveals relevant sections:
  - Userscript development (sites you don't control)
  - Production testing (your running app)
  - Framework-less apps (vanilla JS path to production)
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - mcp__chrome-devtools__*
---

# WebMCP Development

**Core Workflow**: Create MCP tools for any website or web app.
Inject, test, iterate - all via chrome-devtools-mcp. No build step required.

---

## Quick Start (Always Shown)

The universal development loop:

1. **Navigate**: `navigate_page` to target URL
2. **Explore**: `take_snapshot` to understand page structure
3. **Write**: Tool code (just JavaScript)
4. **Inject**: `inject_webmcp_script` - polyfill auto-injected if needed
5. **Verify**: `diff_webmcp_tools` to see registered tools
6. **Test**: Call tools directly as first-class MCP tools
7. **Debug**: `read_console_messages` if failures
8. **Iterate**: Fix code, reinject, retest

```javascript
// Minimal tool - no imports needed!
navigator.modelContext.registerTool({
  name: 'get_page_title',
  description: 'Get the current page title',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => ({
    content: [{ type: 'text', text: document.title }]
  })
});
```

---

## Section: Userscript Development

*Revealed when: user wants tools for Notion, GitHub, external sites*

For sites you don't control, build userscripts that inject tools.

See: [USERSCRIPT_GUIDE.md](references/USERSCRIPT_GUIDE.md)
See: [DISTRIBUTION.md](references/DISTRIBUTION.md)

---

## Section: Production Testing

*Revealed when: user mentions Rails, Django, Laravel, their own app*

Test MCP tools on your running app without rebuilding.
Once working, copy the code to your layout template.

See: [PRODUCTION_TESTING.md](references/PRODUCTION_TESTING.md)
See: [VANILLA_JS.md](references/VANILLA_JS.md)

---

## Self-Testing Protocol

**CRITICAL**: Verify every tool works before considering done.

```
1. diff_webmcp_tools
   → Tools appear as: webmcp_{domain}_page{idx}_{toolName}

2. Call each tool directly:
   webmcp_example_com_page0_my_tool({ arg: "value" })

3. If fails:
   read_console_messages → find error
   take_snapshot → verify DOM state
   Fix → reinject → retest

4. Only done when ALL tools pass
```

---

## Tool Naming Convention

After injection, tools become first-class MCP tools:

| Your Tool Name | Becomes |
|----------------|---------|
| `search_pages` | `webmcp_notion_so_page0_search_pages` |
| `list_orders` | `webmcp_localhost_3000_page0_list_orders` |

---

## When to Use This Skill

**Use this skill when:**
✅ Creating MCP tools for any website
✅ Testing tools on your running app (Rails, Django, Laravel, PHP)
✅ Adding MCP to vanilla JS/HTML/CSS apps
✅ Prototyping before committing to an approach

**Don't use this skill when:**
❌ Site already has WebMCP (just use existing tools)
❌ Deep React/Vue integration needed (use webmcp-setup skill)
❌ Just exploring without building tools

---

## Success Criteria

✅ All tools registered (verify with diff_webmcp_tools)
✅ All tools callable as first-class MCP tools
✅ No console errors after injection
✅ Tools handle edge cases gracefully
```

---

## Repository Structure

```
npm-packages/
├── packages/
│   ├── chrome-devtools-mcp/          # ✅ Has WebMCP infrastructure
│   │   ├── src/tools/webmcp.ts       # inject_webmcp_script, diff_webmcp_tools, call_webmcp_tool
│   │   ├── src/tools/WebMCPToolHub.ts # Dynamic first-class tool registration
│   │   ├── src/transports/           # WebMCPClientTransport, BridgeScript
│   │   └── src/polyfill.ts           # 🔲 NEW - bundled @mcp-b/global for injection
│   ├── global/                        # ✅ Existing polyfill
│   ├── transports/                    # ✅ Existing
│   ├── react-webmcp/                  # ✅ Existing React hooks
│   └── webmcp-shared/                 # 🔲 MAYBE - only if helpers needed
│
├── examples/                          # 🔲 NEW - reference implementations
│   ├── hackernews.js                  # Userscript example (external site)
│   ├── rails-admin.js                 # Production testing example
│   └── vanilla-todo/                  # Complete framework-less app
│       ├── index.html
│       └── mcp-tools.js
│
├── skills/
│   ├── webmcp-setup/                  # ✅ Existing - React integration
│   └── webmcp-dev/                    # 🔲 NEW - unified dev skill
│       ├── SKILL.md                   # Progressive disclosure
│       ├── references/
│       │   ├── QUICK_START.md
│       │   ├── SELF_TESTING.md
│       │   ├── USERSCRIPT_GUIDE.md
│       │   ├── PRODUCTION_TESTING.md
│       │   ├── VANILLA_JS.md
│       │   ├── DISTRIBUTION.md
│       │   └── TROUBLESHOOTING.md
│       └── examples/                  # Symlinks to /examples or copies
│
└── pnpm-workspace.yaml
```

### Skill Relationship

```
webmcp-setup                    webmcp-dev
(React/Vue integration)         (Injection-based development)
     │                               │
     │                               ├── Userscript development
     │                               ├── Production testing
     │                               └── Framework-less apps
     │                               │
     └───────────┬───────────────────┘
                 │
                 ▼
         chrome-devtools-mcp
         (common tooling)
```

---

## The `inject_webmcp_script` Tool

### Why It's Needed

The existing infrastructure auto-detects WebMCP on pages, but for **development iteration**, the agent needs to inject and test tools dynamically. This tool serves multiple use cases:

#### Use Case 1: Userscript Development
Build MCP tools for sites you don't control (Notion, GitHub, etc.)

#### Use Case 2: Production Testing (Rails, Django, Laravel, etc.)
Test MCP tools on your production app **without rebuilding**:
```
# Your Rails app is running at localhost:3000
# You want to add MCP tools - just inject them!

inject_webmcp_script({
  code: `
    navigator.modelContext.registerTool({
      name: 'list_users',
      description: 'List users from the admin panel',
      handler: async () => {
        const rows = document.querySelectorAll('table.users tr');
        // ... scrape the data
      }
    });
  `
})
```
No need to add dependencies, rebuild, or redeploy. Test the tools, iterate, then copy the working code into your app.

#### Use Case 3: Framework-less Apps (Vanilla JS/HTML/CSS)
For apps without React/Vue/etc., MCP tools are just JavaScript:
```html
<!-- Your production code can literally be: -->
<script src="https://unpkg.com/@mcp-b/global"></script>
<script>
  navigator.modelContext.registerTool({ ... });
</script>
```
The inject tool lets you prototype and test before committing to production.

#### Use Case 4: Rapid Prototyping
Test MCP tool ideas on any page before building anything:
1. Navigate to the target page
2. Inject tool code directly
3. Test immediately
4. Iterate until it works
5. Then decide: userscript, framework integration, or vanilla JS

### Smart Polyfill Injection

The tool automatically handles the `@mcp-b/global` polyfill:

```
inject_webmcp_script called
    │
    ▼
Check: Does page have navigator.modelContext?
    │
    ├── YES → Inject just the userscript code (~7KB)
    │
    └── NO  → Prepend polyfill (~343KB), then inject
              (polyfill auto-initializes on load)
```

**Benefits:**
- **Fast iteration** - After first injection, polyfill exists, only inject tools
- **No bundling required** - Userscripts don't need to import @mcp-b/global
- **Simple authoring** - Just write tool registration code
- **Matches extension pattern** - Same approach as chrome.userScripts

### Userscript Authoring (Simplified)

With smart injection, userscripts are **tools-only**:

```typescript
// userscripts/hackernews/src/index.ts
// NO import needed - polyfill injected automatically!

navigator.modelContext.registerTool({
  name: 'get_top_stories',
  description: 'Get top stories from Hacker News',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => {
    const stories = Array.from(document.querySelectorAll('.athing'))
      .slice(0, 10)
      .map(el => ({
        title: el.querySelector('.titleline a')?.textContent,
        url: el.querySelector('.titleline a')?.getAttribute('href'),
      }));
    return {
      content: [{ type: 'text', text: JSON.stringify(stories, null, 2) }]
    };
  },
});
```

### Implementation

Add to `packages/chrome-devtools-mcp/src/tools/webmcp.ts`:

```typescript
import { getPolyfillCode } from '../polyfill.js';

/**
 * Inject a WebMCP userscript into the page for testing.
 *
 * Smart polyfill handling:
 * - Checks if @mcp-b/global polyfill already exists on page
 * - If missing, automatically prepends polyfill before injection
 * - If present, injects only the userscript (fast iteration)
 *
 * This enables the autonomous development loop:
 * 1. Agent writes tools-only code (no polyfill import needed)
 * 2. Agent calls inject_webmcp_script with the code
 * 3. Tool auto-adds polyfill if needed
 * 4. Tools register and appear as first-class MCP tools
 * 5. Agent tests directly, iterates until working
 */
export const injectWebMCPScript = defineTool({
  name: 'inject_webmcp_script',
  description:
    'Inject a WebMCP userscript into the page for testing. ' +
    'Automatically handles @mcp-b/global polyfill injection - if the page ' +
    'does not have navigator.modelContext, the polyfill is prepended automatically. ' +
    'After injection, tools register as first-class MCP tools (webmcp_{domain}_page{idx}_{name}). ' +
    'Userscripts should NOT import the polyfill - just call navigator.modelContext.registerTool().',
  annotations: {
    title: 'Inject WebMCP Script',
    category: ToolCategory.WEBMCP,
    readOnlyHint: false,
  },
  schema: {
    code: zod.string().describe(
      'The userscript code to inject. Can be raw TypeScript/JS or a built bundle. ' +
      'Does NOT need to include @mcp-b/global - polyfill is auto-injected if needed.'
    ),
    wait_for_tools: zod.boolean().optional().describe(
      'Wait for tools to register before returning. Default: true'
    ),
    timeout: zod.number().optional().describe(
      'Timeout in ms to wait for tools. Default: 5000'
    ),
    page_index: zod.number().int().optional().describe(
      'Target page index. Default: currently selected page'
    ),
  },
  handler: async (request, response, context) => {
    const { code, wait_for_tools = true, timeout = 5000, page_index } = request.params;

    const page = page_index !== undefined
      ? context.getPageByIdx(page_index)
      : context.getSelectedPage();

    response.appendResponseLine(`Target: ${page.url()}`);
    response.appendResponseLine('');

    try {
      // Check if polyfill already exists
      const hasPolyfill = await page.evaluate(() =>
        typeof navigator !== 'undefined' &&
        typeof navigator.modelContext !== 'undefined'
      );

      let codeToInject = code;

      if (hasPolyfill) {
        response.appendResponseLine('✓ Polyfill already present');
      } else {
        response.appendResponseLine('Injecting @mcp-b/global polyfill...');
        const polyfillCode = getPolyfillCode();
        codeToInject = polyfillCode + '\n;\n' + code;
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

      // Wait for tools to register
      response.appendResponseLine(`Waiting for tools (${timeout}ms)...`);

      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        await new Promise(r => setTimeout(r, 200));

        try {
          const result = await context.getWebMCPClient(page);
          if (result.connected) {
            const { tools } = await result.client.listTools();
            if (tools.length > 0) {
              // Trigger tool hub sync so tools become first-class
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
                response.appendResponseLine(`  - ${tool.name}`);
                response.appendResponseLine(`    → ${firstClassName}`);
                if (tool.description) {
                  const desc = tool.description.substring(0, 50);
                  response.appendResponseLine(`    ${desc}${tool.description.length > 50 ? '...' : ''}`);
                }
              }
              response.appendResponseLine('');
              response.appendResponseLine('Tools are now callable as first-class MCP tools.');
              return;
            }
          }
        } catch {
          // Continue waiting
        }
      }

      // Timeout
      response.appendResponseLine('');
      response.appendResponseLine(`⚠ No tools registered within ${timeout}ms.`);
      response.appendResponseLine('');
      response.appendResponseLine('Debug steps:');
      response.appendResponseLine('  1. read_console_messages - check for JS errors');
      response.appendResponseLine('  2. take_snapshot - verify page state');
      response.appendResponseLine('  3. Ensure script calls navigator.modelContext.registerTool()');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Detect CSP blocking
      if (message.includes('Content Security Policy') || message.includes('script-src')) {
        response.appendResponseLine('⚠ Site has Content Security Policy blocking inline scripts.');
        response.appendResponseLine('');
        response.appendResponseLine('This site cannot be automated via script injection.');
        response.appendResponseLine('Consider: browser extension approach or different site.');
        return;
      }

      response.appendResponseLine(`Error: ${message}`);
      response.appendResponseLine('');
      response.appendResponseLine('Debug: read_console_messages to see errors');
    }
  },
});

// Helper function (already exists in WebMCPToolHub.ts)
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    let domain = parsed.hostname;
    if (parsed.port && parsed.hostname === 'localhost') {
      domain = `${domain}_${parsed.port}`;
    }
    return domain.replace(/[^a-zA-Z0-9]/g, '_');
  } catch {
    return 'unknown';
  }
}
```

### Polyfill Source

The polyfill code needs to be available at runtime. Options:

1. **Bundle at build time** - Include minified @mcp-b/global in chrome-devtools-mcp
2. **Read from node_modules** - Load from `@mcp-b/global/dist/global.js` at runtime

Recommended: Bundle at build time for reliability. Add to `tsup.config.ts`:

```typescript
// packages/chrome-devtools-mcp/src/polyfill.ts
import polyfillCode from '@mcp-b/global/dist/global.js?raw';

export function getPolyfillCode(): string {
  return polyfillCode;
}
```

---

## @webmcp/shared Package

### API Reference

```typescript
// packages/webmcp-shared/src/dom.ts

// DOM Interaction
export function clickElement(selector: string, options?: { timeout?: number }): Promise<void>;
export function typeText(selector: string, text: string, options?: { timeout?: number; clear?: boolean }): Promise<void>;
export function selectOption(selector: string, value: string): Promise<void>;
export function pressKey(key: string): void;

// Waiting
export function waitForSelector(selector: string, options?: { timeout?: number; hidden?: boolean }): Promise<Element | null>;
export function waitForElement(predicate: () => Element | null, options?: { timeout?: number }): Promise<Element>;

// Utilities
export function isElementVisible(selector: string): boolean;
export function getElementText(selector: string): string | null;
export function getAllElements(selector: string): Element[];
export function scrollToElement(selector: string): Promise<void>;

// Server helpers
export function formatSuccess(message: string, data?: unknown): ToolResponse;
export function formatError(message: string): ToolResponse;
```

### Implementation

```typescript
// packages/webmcp-shared/src/dom.ts

/**
 * Click an element by selector.
 */
export async function clickElement(
  selector: string,
  options: { timeout?: number } = {}
): Promise<void> {
  const { timeout = 5000 } = options;
  const element = await waitForSelector(selector, { timeout });

  if (!(element instanceof HTMLElement)) {
    throw new Error(`Element not clickable: ${selector}`);
  }

  element.click();
}

/**
 * Type text into an input element.
 * Triggers proper React/Vue events for state updates.
 */
export async function typeText(
  selector: string,
  text: string,
  options: { timeout?: number; clear?: boolean } = {}
): Promise<void> {
  const { timeout = 5000, clear = true } = options;
  const element = await waitForSelector(selector, { timeout });

  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    throw new Error(`Element not typeable: ${selector}`);
  }

  if (clear) {
    element.value = '';
  }

  element.value = text;

  // Trigger events for React/Vue
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Wait for an element to appear (or disappear) in the DOM.
 */
export async function waitForSelector(
  selector: string,
  options: { timeout?: number; hidden?: boolean } = {}
): Promise<Element | null> {
  const { timeout = 5000, hidden = false } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const element = document.querySelector(selector);

    if (hidden) {
      if (!element) return null;
    } else {
      if (element) return element;
    }

    await new Promise(r => setTimeout(r, 100));
  }

  if (hidden) {
    throw new Error(`Timeout waiting for selector to disappear: ${selector}`);
  }
  throw new Error(`Timeout waiting for selector: ${selector}`);
}

/**
 * Get text content from an element.
 */
export function getElementText(selector: string): string | null {
  const element = document.querySelector(selector);
  return element?.textContent?.trim() ?? null;
}

/**
 * Get all elements matching a selector.
 */
export function getAllElements(selector: string): Element[] {
  return Array.from(document.querySelectorAll(selector));
}

/**
 * Check if an element is visible.
 */
export function isElementVisible(selector: string): boolean {
  const element = document.querySelector(selector);
  if (!element) return false;

  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

/**
 * Scroll an element into view.
 */
export async function scrollToElement(selector: string): Promise<void> {
  const element = await waitForSelector(selector);
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Select an option from a dropdown.
 */
export async function selectOption(
  selector: string,
  value: string
): Promise<void> {
  const element = await waitForSelector(selector);

  if (element instanceof HTMLSelectElement) {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    throw new Error(`Element is not a select: ${selector}`);
  }
}

/**
 * Press a keyboard key.
 */
export function pressKey(key: string): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
}
```

```typescript
// packages/webmcp-shared/src/server.ts

import type { ToolResponse } from './types.js';

/**
 * Format a successful tool response.
 */
export function formatSuccess(message: string, data?: unknown): ToolResponse {
  return {
    content: [{
      type: 'text',
      text: data ? `${message}\n${JSON.stringify(data, null, 2)}` : message,
    }],
  };
}

/**
 * Format an error tool response.
 */
export function formatError(message: string): ToolResponse {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}
```

---

## Template Structure

With smart polyfill injection, userscripts are **lightweight tools-only code**:

```
userscripts/
├── _template/
│   ├── src/
│   │   └── index.ts      # Tools-only code, no polyfill import
│   └── package.json
└── hackernews/
    ├── src/
    │   └── index.ts
    └── package.json
```

### Template index.ts

```typescript
// userscripts/_template/src/index.ts
// NO import needed - polyfill auto-injected by inject_webmcp_script!

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
    // Your tool implementation here
    return {
      content: [{ type: 'text', text: `You searched for: ${query}` }]
    };
  },
});
```

### Template package.json

```json
{
  "name": "example-mcp",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "esbuild src/index.ts --bundle --outfile=dist/example.js --format=iife"
  },
  "devDependencies": {
    "esbuild": "^0.20.0"
  }
}
```

### Development Workflow

Since `inject_webmcp_script` handles the polyfill, development is simple:

```bash
# 1. Write your tools in src/index.ts

# 2. Build (optional - can inject raw TS if simple enough)
pnpm build --filter=hackernews-mcp

# 3. Agent reads and injects
# inject_webmcp_script({ code: "<contents of dist/hackernews.js>" })
# OR for quick iteration, inject raw code directly
```

### For Distribution (Extension Marketplace)

When publishing to the extension marketplace, **do** bundle the polyfill:

```typescript
// For distribution only - vite.config.ts
import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/index.ts',
      userscript: {
        name: 'HackerNews MCP Tools',
        namespace: 'webmcp',
        match: ['https://news.ycombinator.com/*'],
        grant: 'none',
      },
      build: {
        externalGlobals: {}, // Bundle polyfill for standalone distribution
      },
    }),
  ],
});
```

---

## Production Testing → Production Code Workflow

For Rails, Django, Laravel, PHP, or vanilla JS apps, the workflow is:

### 1. Prototype with Injection

```
# Navigate to your running app
navigate_page({ url: "http://localhost:3000/admin" })

# Inject and test tools
inject_webmcp_script({
  code: `
    navigator.modelContext.registerTool({
      name: 'list_orders',
      description: 'List recent orders from the admin panel',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const orders = Array.from(document.querySelectorAll('.order-row'))
          .map(row => ({
            id: row.dataset.orderId,
            customer: row.querySelector('.customer-name')?.textContent,
            total: row.querySelector('.order-total')?.textContent,
          }));
        return {
          content: [{ type: 'text', text: JSON.stringify(orders, null, 2) }]
        };
      }
    });
  `
})

# Test it
webmcp_localhost_3000_page0_list_orders()
# → Iterate until it works perfectly
```

### 2. Copy to Production

Once the tool works, add it to your app:

**Rails (app/views/layouts/application.html.erb):**
```erb
<%= javascript_include_tag "https://unpkg.com/@mcp-b/global" %>
<script>
  // Paste your tested tool code here
  navigator.modelContext.registerTool({
    name: 'list_orders',
    // ... exact same code that worked during testing
  });
</script>
```

**Django (templates/base.html):**
```html
<script src="https://unpkg.com/@mcp-b/global"></script>
<script>
  navigator.modelContext.registerTool({ ... });
</script>
```

**Laravel (resources/views/layouts/app.blade.php):**
```php
<script src="https://unpkg.com/@mcp-b/global"></script>
<script>
  navigator.modelContext.registerTool({ ... });
</script>
```

**Vanilla HTML:**
```html
<script src="https://unpkg.com/@mcp-b/global"></script>
<script src="/js/mcp-tools.js"></script>
```

### 3. Benefits

- **No build step** - Tools are just JavaScript
- **Test in production** - Inject on staging/prod without deploying
- **Copy-paste ready** - Code that works in inject works in production
- **Framework agnostic** - Same pattern for Rails, Django, Laravel, PHP, static HTML

---

## Self-Testing Protocol

You MUST verify every tool works before considering the script complete.

### The Verification Loop

After building and injecting your script:

#### Step 1: Verify Tools Registered

```
diff_webmcp_tools
```

Expected: Your tools appear in the list with their first-class names.

If tools don't appear:
- Check `read_console_messages` for errors
- Verify script imports `@mcp-b/global`
- Verify script calls `navigator.modelContext.registerTool()`

#### Step 2: Test Each Tool

Tools are now first-class MCP tools! Call them directly:

```
# If your tool is "search_pages" on notion.so:
webmcp_notion_so_page0_search_pages({ query: "meeting notes" })
```

Or use the legacy approach:
```
call_webmcp_tool({ name: "search_pages", arguments: { query: "meeting notes" } })
```

Verify:
1. **Return value** - Does it return expected data?
2. **UI effect** - Did the page update correctly?
3. **No errors** - Is isError: false?

Use `take_snapshot` after tool calls to verify UI changes.

#### Step 3: Debug Failures

If a tool fails:

1. **Read console**:
   ```
   read_console_messages
   ```
   Look for: TypeError, ReferenceError, SyntaxError

2. **Check page state**:
   ```
   take_snapshot
   ```
   Verify: Is the element you're targeting actually there?

3. **Common fixes**:
   - Selector wrong → Update selector based on snapshot
   - Element not found → Add waitForSelector
   - React not updating → Use dispatchEvent for input/change

#### Step 4: Fix and Retest

1. Edit the source code
2. Rebuild: `pnpm build --filter=[name]-mcp`
3. Read the new bundle
4. Reinject: `inject_webmcp_script`
5. Retest the failing tool

### Checklist Before Commit

- [ ] All tools appear in diff_webmcp_tools
- [ ] All tools callable as first-class MCP tools
- [ ] All tools return expected results
- [ ] No console errors after injection
- [ ] Edge cases handled (empty input, etc.)
- [ ] UI updates verified with take_snapshot

---

## Implementation Phases

### Phase 0: Add inject_webmcp_script Tool

**Goal**: Complete the development loop.

**Status**: WebMCP infrastructure exists, just need the inject tool.

1. **Add `inject_webmcp_script` tool** to chrome-devtools-mcp
   - Smart polyfill injection (prepend if not present)
   - Integrate with existing WebMCPToolHub
   - Build and test

2. **Add `getPolyfillCode()` helper**
   - Bundle @mcp-b/global at build time
   - Expose for injection

3. **Success criteria**:
   - [ ] `inject_webmcp_script` tool works
   - [ ] Polyfill auto-injected when needed
   - [ ] Tools appear as first-class after injection
   - [ ] Agent can iterate (fix → reinject → test)

### Phase 1: Create examples/ Directory

**Goal**: Reference implementations for each use case.

1. **Create `examples/hackernews.js`**
   - Userscript example (external site)
   - Validate injection loop

2. **Create `examples/rails-admin.js`**
   - Production testing example
   - Show the test → copy to production flow

3. **Create `examples/vanilla-todo.js`**
   - Framework-less example
   - Complete working app with MCP

4. **Success criteria**:
   - [ ] All examples work via injection
   - [ ] Each demonstrates its use case clearly

### Phase 2: Create @webmcp/shared Package (Optional)

**Goal**: Extract reusable DOM helpers if patterns emerge.

1. **Create `packages/webmcp-shared/`** only if needed
   - DOM helpers (clickElement, waitForSelector, etc.)
   - Response formatters

2. **Note**: May not be needed initially
   - Start with inline helpers in examples
   - Extract if repetition emerges

3. **Success criteria**:
   - [ ] Helpers are genuinely reusable
   - [ ] Not over-engineered

### Phase 3: Create Unified Skill

**Goal**: Package everything into a single progressive-disclosure skill.

1. **Create `skills/webmcp-dev/`**
   - SKILL.md with context-aware sections
   - references/ for each use case
   - examples/ linked from references

2. **Reference documents**:
   - QUICK_START.md (universal)
   - SELF_TESTING.md
   - USERSCRIPT_GUIDE.md
   - PRODUCTION_TESTING.md
   - VANILLA_JS.md
   - DISTRIBUTION.md
   - TROUBLESHOOTING.md

3. **Success criteria**:
   - [ ] Skill activates for "add MCP tools" requests
   - [ ] Correct sections revealed by context
   - [ ] Agent follows workflow autonomously

### Phase 4: Validate Across Use Cases

**Goal**: Test skill with different contexts.

1. **Userscript test**: Create tools for GitHub issues
2. **Production test**: Add tools to a Rails/Django app
3. **Vanilla test**: Create a complete framework-less app

4. **Capture feedback** and iterate on skill

### Phase 5: Marketplace Integration (Future)

**Goal**: Automate distribution to extension marketplace.

1. **Add `upload_to_marketplace` tool** to chrome-devtools-mcp
   - Authenticate with marketplace API
   - Build userscript with polyfill bundled
   - Upload and publish

2. **Update skill** with distribution section
   - When to distribute vs keep local
   - Marketplace best practices

3. **Full autonomous loop**:
   ```
   User: "Create and publish tools for Notion"
   Agent: develop → test → build → upload → done
   ```

4. **Success criteria**:
   - [ ] Agent can upload without human intervention
   - [ ] Versioning handled
   - [ ] Updates work

---

## Prerequisites

- **chrome-devtools-mcp connected to Chrome** - The skill relies on CDP tools
- **pnpm workspace** - Scripts are built as workspace packages
- **Node 22.12+** - Required by chrome-devtools-mcp

---

## Known Limitations

### 1. Content Security Policy (CSP)
Some sites block inline `<script>` tags via CSP. The inject tool will detect this and fail with a clear message.

**Affected sites**: Banking, enterprise apps, security-conscious sites

**Workaround**: Browser extension approach instead.

### 2. Page Navigation Clears Tools
If the page navigates after injection, tools are lost. Reinject after navigation.

### 3. Authenticated Pages
Agent cannot fully test scripts on auth-required pages unless user has already authenticated.

**Solution**: User logs in manually, then agent takes over.

### 4. Single Script Per Session
Reinjecting replaces the previous script.

---

## Success Criteria

### Core Loop Works
- [ ] Agent can write userscript code
- [ ] Agent can build via Bash (pnpm build)
- [ ] Agent can inject via inject_webmcp_script
- [ ] Agent can verify via diff_webmcp_tools
- [ ] Agent can call first-class tools directly
- [ ] Agent can debug via read_console_messages + take_snapshot
- [ ] Agent can iterate (fix → rebuild → reinject → retest)

### First-Class Tool Integration
- [ ] WebMCPToolHub syncs tools after injection
- [ ] Tools appear in client.listTools()
- [ ] Tools callable by first-class name

### Skill Auto-Applies
- [ ] Skill activates when user asks for userscript
- [ ] Agent follows the workflow without manual prompting
- [ ] Reference docs are consulted when needed

---

## Related Documents

- [webmcp-setup skill](../skills/webmcp-setup/SKILL.md) - For React app integration
- [WEBMCP_DYNAMIC_TOOLS_IMPLEMENTATION.md](./WEBMCP_DYNAMIC_TOOLS_IMPLEMENTATION.md) - Dynamic tool registration
- [Claude Code Skills](https://code.claude.com/docs/en/skills) - Official docs
