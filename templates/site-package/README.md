# {{Site}} MCP Skill Template

Starter template for building a site-specific WebMCP skill.

This template helps you:

- inspect a target website,
- extract structured data from DOM elements,
- expose that data and actions through MCP tools, and
- iterate quickly with an inject → test → refine workflow.

## Documentation and Tool Design Standards

Adopt these modern defaults when creating new site skills:

- **Start with user intent**: define what an agent must accomplish before
  defining APIs.
- **Keep tool names verb-first** (`get_`, `search_`, `create_`, `update_`,
  `delete_`).
- **Prefer structured outputs**: return machine-friendly fields over long
  free-form strings.
- **Document failure modes**: include empty-state and permission-denied
  behavior in tool docs.
- **Design for idempotency where possible**: repeated calls should avoid
  accidental duplicate side effects.

## Recommended Development Workflow

### 1) Inspect the Target Site

Before writing code, confirm the real DOM structure in DevTools.

1. Open `{{site_url}}` in Chrome.
1. Open DevTools (`Right-click → Inspect`).
1. Identify stable selectors and data locations:
   - Which classes or attributes identify items you need?
   - Are items organized as cards, rows, or nested containers?
   - Where do metadata fields live (date, author, score, status)?
1. Validate assumptions in Console:

```javascript
document.querySelectorAll('.item');
document.querySelector('.item .title');
```

1. Capture notes you can reuse in parser helpers.

### 2) Write Parsing Functions

Implement focused parser utilities for each domain entity.

```typescript
interface Item {
  id: string;
  title: string;
}

function parseItem(element: Element): Item | null {
  const titleEl = element.querySelector('.title');
  if (!titleEl) return null;

  return {
    id: element.id,
    title: getText(titleEl),
  };
}
```

### 3) Register MCP Tools

Use parser helpers inside tool handlers and keep tool names action-oriented.

### 4) Test and Iterate

Use a short feedback loop:

1. Inject updated script.
1. Run tools from the MCP client.
1. Verify output shape and edge cases.
1. Repeat.

## Quick Start

1. Install dependencies:

```bash
cd tools
npm install
```

1. Open `{{site_url}}` in Chrome.
1. Inject your tools script:

```javascript
inject_webmcp_script({ file_path: './tools/src/{{site}}.ts' });
```

1. Call a tool:

```javascript
webmcp_{{site}}_page0_get_page_info();
```

## Tool Inventory (Example)

| Tool | Description |
| --- | --- |
| `get_page_info` | Return high-level page context and metadata. |
| `search_items` | Search or filter visible items. |
| `click_button` | Trigger a button action by label or selector. |

See [SKILL.md](SKILL.md) for complete usage and behavioral guidance.

## File Layout

```text
{{site}}-mcp/
├── SKILL.md
├── tools/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── {{site}}.ts
├── reference/
│   ├── api.md
│   └── workflows.md
└── scripts/
    └── setup.sh
```

## Development Notes

- Keep selectors resilient (prefer stable attributes over visual class names).
- Return consistent schemas across tools.
- Handle empty states and partially-loaded DOM content gracefully.

## Definition of Done Checklist

Before publishing a site skill, verify:

- [ ] All local links in `README.md` and `SKILL.md` resolve.
- [ ] Every tool has a clear description and JSON schema.
- [ ] Read-only and mutating tools are clearly separated.
- [ ] At least one end-to-end usage workflow is documented.
- [ ] Known limitations and troubleshooting guidance are included.
