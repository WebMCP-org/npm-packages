# SmartDOMReader Tools for Chrome Extensions

The SmartDOMReaderTools provide AI-friendly DOM extraction capabilities within Chrome extensions. These tools allow AI assistants to intelligently read and interact with web page content.

## Setup

### 1. Install the package

```bash
npm install @mcp-b/extension-tools
```

### 2. Copy the SmartDOMReader bundle to your extension

The SmartDOMReader library needs to be bundled with your extension as a web accessible resource. Copy the file from:

```
node_modules/@mcp-b/smart-dom-reader/dist/index.js
```

To your extension's directory as `smart-dom-reader.js`.

### 3. Update your manifest.json

Add the bundle to your web_accessible_resources:

```json
{
  "manifest_version": 3,
  "web_accessible_resources": [
    {
      "resources": ["smart-dom-reader.js"],
      "matches": ["<all_urls>"]
    }
  ],
  "permissions": [
    "scripting",
    "activeTab"
  ]
}
```

For enhanced functionality without CSP restrictions, you can also use the userScripts API (Chrome 135+):

```json
{
  "permissions": [
    "scripting",
    "userScripts",
    "activeTab"
  ]
}
```

### 4. Register the tools

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { SmartDOMReaderTools } from '@mcp-b/extension-tools';

const server = new McpServer();

// Register all SmartDOMReader tools
const smartDOMReader = new SmartDOMReaderTools(server);
smartDOMReader.registerTools();

// Or register specific tools only
const smartDOMReader = new SmartDOMReaderTools(server, {
  extractInteractive: true,  // Extract buttons, links, inputs, forms
  extractFull: false,        // Extract all elements including semantic ones
  extractStructure: true,    // Get page structure overview
  extractRegion: true,       // Extract specific regions
  extractContent: true       // Read text content from elements
});
```

## Available Tools

### `extension_tool_smart_dom_extract_interactive`

Extract interactive elements from the current page.

**Parameters:**
- `tabId` (optional): Tab ID to extract from (defaults to active tab)
- `options` (optional): Extraction options
  - `maxDepth`: Maximum traversal depth (default: 5)
  - `includeHidden`: Include hidden elements (default: false)
  - `includeShadowDOM`: Include shadow DOM elements (default: true)
  - `includeIframes`: Include iframe contents (default: false)
  - `viewportOnly`: Only extract elements in viewport (default: false)
  - `mainContentOnly`: Only extract from main content area (default: false)
  - `customSelectors`: Additional CSS selectors to include

**Returns:** Structured data containing buttons, links, inputs, forms, and clickable elements.

### `extension_tool_smart_dom_extract_full`

Extract all elements from the page, including semantic elements.

**Parameters:** Same as `extract_interactive`

**Returns:** All interactive elements plus headings, images, tables, lists, and articles.

### `extension_tool_smart_dom_get_structure`

Get a high-level structural overview of the page.

**Parameters:**
- `tabId` (optional): Tab ID to extract from

**Returns:** Main regions, navigation areas, and content sections.

### `extension_tool_smart_dom_extract_region`

Extract elements from a specific region of the page.

**Parameters:**
- `tabId` (optional): Tab ID to extract from
- `selector`: CSS selector for the region to extract
- `options` (optional): Extraction options

**Returns:** Elements within the specified region.

### `extension_tool_smart_dom_read_content`

Read text content from a specific element or region.

**Parameters:**
- `tabId` (optional): Tab ID to extract from
- `selector`: CSS selector for the content to read
- `options` (optional):
  - `includeAttributes`: Include element attributes (default: false)
  - `preserveStructure`: Preserve HTML structure (default: false)

**Returns:** Text content from the specified element.

## How It Works

1. **Library Injection**: The SmartDOMReader library is injected into the target page once per tab session. The library remains available for multiple extraction calls without re-injection.

2. **Argument Passing**: Arguments are passed directly through Chrome's `executeScript` API using the `args` parameter, ensuring clean separation between code and data.

3. **Execution Methods**: 
   - If available, uses chrome.userScripts.execute (Chrome 135+) for CSP-free execution
   - Falls back to chrome.scripting.executeScript with MAIN world execution

4. **Smart Extraction**: The library intelligently traverses the DOM, identifying:
   - Interactive elements (buttons, links, forms, inputs)
   - Semantic elements (headings, articles, navigation)
   - Page structure and landmarks
   - Focused and loading states

## Example Usage

```typescript
// Extract all interactive elements from the current tab
const result = await smartDOMReader.extractInteractive();

// Extract only from the main content area
const mainContent = await smartDOMReader.extractInteractive({
  options: { mainContentOnly: true }
});

// Extract a specific form
const loginForm = await smartDOMReader.extractRegion({
  selector: '#login-form',
  options: { maxDepth: 3 }
});

// Read article content
const articleText = await smartDOMReader.readContent({
  selector: 'article.main-content',
  options: { preserveStructure: true }
});
```

## Troubleshooting

### "Failed to load SmartDOMReader bundle"

Ensure that:
1. The `smart-dom-reader.js` file is in your extension's root directory
2. It's listed in `web_accessible_resources` in manifest.json
3. The matches pattern includes the URLs you're trying to access

### CSP Restrictions

If you encounter Content Security Policy errors:
1. Enable Developer Mode in Chrome
2. For Chrome 135+: Enable the "User Scripts" toggle for your extension
3. The tools will automatically use the userScripts API when available

### Tab Navigation

The library automatically re-injects itself when a tab navigates to a new page. The injection state is tracked per tab ID.

## Best Practices

1. **Use `mainContentOnly` option** for article/blog extraction to avoid sidebars and ads
2. **Set appropriate `maxDepth`** to limit extraction scope and improve performance
3. **Use `viewportOnly` option** for initial page analysis to focus on visible content
4. **Cache extraction results** when possible to avoid re-injecting the library

## Integration with AI Assistants

These tools are designed to work seamlessly with Model Context Protocol (MCP) servers, providing structured data that AI assistants can easily understand and act upon. The extraction results include:

- CSS selectors for precise element targeting
- Text content and attributes
- Interaction capabilities (click, focus, type)
- Semantic relationships between elements
- Page state information (errors, loading, modals)