# DOM Extraction Tools

AI-optimized DOM extraction tools for Chrome Extensions using the Model Context Protocol (MCP).

## Overview

The `DomExtractionTools` class provides progressive DOM extraction tools optimized for AI browser agents. These tools inject the `@mcp-b/smart-dom-reader` library into web pages and execute extraction functions via `chrome.scripting.executeScript`.

## Setup

### 1. Include the Smart DOM Reader Bundle

Copy the smart-dom-reader bundle to your extension:

```bash
cp node_modules/@mcp-b/smart-dom-reader/dist/index.js extension/smart-dom-reader.js
```

### 2. Update manifest.json

Add necessary permissions and declare the bundle as a web accessible resource:

```json
{
  "permissions": ["scripting", "activeTab", "userScripts"],
  "host_permissions": ["<all_urls>"],
  "web_accessible_resources": [
    {
      "resources": ["smart-dom-reader.js"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

### 3. Enable User Scripts

Chrome requires a user-facing toggle so the `chrome.userScripts` API can run in the USER_SCRIPT world (bypassing CSP restrictions).

1. Open `chrome://extensions`
2. Chrome 138+: open your extension’s **Details** page and enable **Allow User Scripts**
3. Chrome 120–137: enable **Developer mode** on the extensions page

> **Minimum Versions:** `chrome.userScripts.execute` is available starting in Chrome 135 with Manifest V3.

### 4. Register the Tools

```typescript
import { DomExtractionTools } from '@mcp-b/extension-tools';

const domTools = new DomExtractionTools(mcpServer, {
  extractStructure: true,    // Progressive: Step 1
  extractRegion: true,       // Progressive: Step 2  
  extractContent: true       // Progressive: Step 3
});

domTools.registerTools();
```

## Progressive Extraction Workflow (AI-Optimized)

### Step 1: Extract Structure

Get a high-level overview with minimal tokens:

```typescript
const structure = await client.callTool('dom_extract_structure', {
  tabId: 123  // Optional, defaults to active tab
});

// Returns:
{
  summary: { title, url, description },
  regions: [{ selector, type, label }],
  forms: [{ selector, fields, action }],
  suggestions: ["Main content is in article.content", ...]
}
```

### Step 2: Extract Region

Extract details from a specific region identified in Step 1:

```typescript
const region = await client.callTool('dom_extract_region', {
  selector: 'article.content',
  mode: 'interactive',  // or 'full'
  options: {
    includeHidden: false,
    maxDepth: 3
  }
});

// Returns interactive elements in that region
```

### Step 3: Extract Content

Get readable text from a specific area:

```typescript
const content = await client.callTool('dom_extract_content', {
  selector: 'article.content',
  options: {
    includeHeadings: true,
    includeLists: true,
    maxTextLength: 1000
  }
});

// Returns structured text content
```

> **Note:** Single-pass extractors (`dom_extract_interactive`, `dom_extract_full`) are
> temporarily unavailable while we finalize the stateless injection workflow.

## Working with iframes

All tools support extracting from iframes:

```typescript
const iframeContent = await client.callTool('dom_extract_region', {
  frameSelector: 'iframe#content-frame',
  selector: '.main-content'
});
```

## Filter Options

Control what gets extracted:

```typescript
const filtered = await client.callTool('dom_extract_region', {
  selector: 'body',
  options: {
    filter: {
      includeSelectors: ['.important'],
      excludeSelectors: ['.ad', '.popup'],
      tags: ['button', 'a', 'input'],
      textContains: ['Submit', 'Click'],
      interactionTypes: ['click', 'submit']
    }
  }
});
```

## Token Efficiency Tips

1. **Use Progressive Extraction**: Start with structure, then drill down
2. **Set `viewportOnly: true`**: Only extract visible elements
3. **Use `textTruncateLength`**: Limit text per element
4. **Filter aggressively**: Only extract what you need
5. **Limit `maxDepth`**: Control traversal depth

## Error Handling

The tools handle common errors:
- Tab not found
- Permission denied
- iframe access blocked
- Library injection failures

All errors are returned in a consistent format:

```typescript
{
  error: true,
  message: "Error description"
}
```

## Performance Notes

- The Smart DOM Reader module is dynamically imported per call and cached by the browser
- No globals are mutated on the page; each execution runs in an isolated scope
- Use `frameSelector` only when necessary to avoid extra iframe traversals
- Keep `maxDepth`, `viewportOnly`, and filter options constrained to minimize DOM walks

## Use Cases

### AI Browser Agents
Use progressive extraction for token-efficient exploration:
1. Get structure → understand layout
2. Extract regions → focus on relevant areas
3. Extract content → analyze text

### Web Automation
Combine `dom_extract_structure` with focused `dom_extract_region` calls to catalog
interactive elements you care about before pulling text with `dom_extract_content`.

### Testing & QA
- Verify interactive elements presence
- Check content structure
- Validate form fields
