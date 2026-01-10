# {{Site}} MCP

WebMCP tools for {{Site}}.

## Development Workflow

### Step 1: Inspect the Target Site

Before writing any code, understand the page structure:

1. Open {{site_url}} in Chrome
2. Right-click → Inspect to open DevTools
3. Identify key elements:
   - What CSS classes identify items you want to extract?
   - Are items in a list, table, or nested divs?
   - Where is the metadata (points, dates, authors)?
   - What's the relationship between elements (siblings, children)?

**Example Inspection:**
```javascript
// In console
document.querySelectorAll('.item')  // Find all items
document.querySelector('.item .title')  // Find title within item
```

4. Take notes on the structure you discover
5. Use this knowledge to write your parsing functions

### Step 2: Write Parsing Functions

Create helper functions that extract data from the DOM elements you identified.

```typescript
interface Item {
  id: string;
  title: string;
  // ... other fields
}

function parseItem(element: Element): Item | null {
  try {
    const titleEl = element.querySelector('.title');
    if (!titleEl) return null;

    return {
      id: element.id,
      title: getText(titleEl),
      // ... extract other fields
    };
  } catch (error) {
    console.error('Parse error:', error);
    return null;
  }
}
```

### Step 3: Register Tools

Use your parsing functions in tool handlers.

### Step 4: Test and Iterate

Inject → test → fix → reinject

## Quick Start

1. **Setup**:
   ```bash
   cd tools && npm install
   ```

2. **Use with Claude Code**:
   - Navigate to {{site_url}} in Chrome
   - Inject the tools:
     ```javascript
     inject_webmcp_script({ file_path: "./tools/src/{{site}}.ts" })
     ```
   - Call tools directly:
     ```javascript
     webmcp_{{site}}_page0_get_page_info()
     ```

## Tools

| Tool | Description |
|------|-------------|
| `get_page_info` | Get basic page information |
| `search_items` | Search for items on the page |
| `click_button` | Click a button by label |

See [SKILL.md](SKILL.md) for complete documentation.

## Development

Edit `tools/src/{{site}}.ts` to add or modify tools, then reinject to test.

## Structure

```
{{site}}-mcp/
├── SKILL.md              # Main skill documentation
├── tools/
│   ├── package.json      # Tools dependencies
│   ├── tsconfig.json
│   └── src/
│       └── {{site}}.ts   # Tool implementations
├── reference/
│   ├── api.md            # Detailed API docs
│   └── workflows.md      # Usage examples
└── scripts/
    └── setup.sh          # Setup automation
```
