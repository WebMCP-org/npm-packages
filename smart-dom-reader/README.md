# Smart DOM Reader

A stateless, token-efficient TypeScript library for extracting DOM information optimized for AI-powered userscript generation. Combines wisdom from multiple DOM extraction approaches to provide intelligent, context-aware element extraction.

## Key Features

- **Two extraction approaches**: Progressive (step-by-step) and Full (single-pass)
- **Stateless architecture**: All functions accept document/element parameters
- **Multiple selector strategies**: CSS, XPath, text-based, data-testid
- **Smart content detection**: Automatically identifies main content areas
- **Context preservation**: Maintains element relationships and semantic context
- **Shadow DOM & iframe support**: Traverses complex DOM structures
- **Token-efficient**: Optimized for LLM context windows

## Installation

```bash
npm install @mcp-b/smart-dom-reader
```

## Two Extraction Approaches

### 1. Full Extraction (SmartDOMReader)

**When to use:** You need all information upfront and have sufficient token budget for processing the complete output. Best for automation, testing, and scenarios where you know exactly what you need.

```typescript
import { SmartDOMReader } from '@mcp-b/smart-dom-reader';

// Pass document explicitly - no window dependency
const doc = document; // or any Document object

// Interactive mode - extract only interactive elements
const interactiveData = SmartDOMReader.extractInteractive(doc);

// Full mode - extract interactive + semantic elements
const fullData = SmartDOMReader.extractFull(doc);

// Custom options
const customData = SmartDOMReader.extractInteractive(doc, {
  mainContentOnly: true,
  viewportOnly: true,
  includeHidden: false
});
```

### 2. Progressive Extraction (ProgressiveExtractor)

**When to use:** Working with AI/LLMs where token efficiency is critical. Allows making intelligent decisions at each step rather than extracting everything upfront.

```typescript
import { ProgressiveExtractor } from '@mcp-b/smart-dom-reader';

// Step 1: Get high-level page structure (minimal tokens)
// Structure can be extracted from the whole document or a specific container element
const structure = ProgressiveExtractor.extractStructure(document);
console.log(structure.summary); // Quick stats about the page
console.log(structure.regions); // Map of page regions
console.log(structure.suggestions); // AI-friendly hints

// Step 2: Extract details from specific region based on structure
const mainContent = ProgressiveExtractor.extractRegion(
  structure.summary.mainContentSelector,
  document,
  { mode: 'interactive' }
);

// Step 3: Extract readable content from a region
const articleText = ProgressiveExtractor.extractContent(
  'article.main-article',
  document,
  { includeHeadings: true, includeLists: true }
);

// Structure scoped to a container (e.g., navigation only)
const nav = document.querySelector('nav');
if (nav) {
  const navOutline = ProgressiveExtractor.extractStructure(nav);
  // navOutline.regions will only include elements within <nav>
}
```

## Extraction Modes

### Interactive Mode
Focuses on elements users can interact with:
- Buttons and button-like elements
- Links
- Form inputs (text, select, textarea)
- Clickable elements with handlers
- Form structures and associations

### Full Mode
Includes everything from interactive mode plus:
- Semantic HTML elements (articles, sections, nav)
- Headings hierarchy
- Images with alt text
- Tables and lists
- Content structure and relationships

## API Comparison

### Full Extraction API

```typescript
// Class-based with options
const reader = new SmartDOMReader({
  mode: 'interactive',
  mainContentOnly: true,
  viewportOnly: false
});
const result = reader.extract(document);

// Static methods for convenience
SmartDOMReader.extractInteractive(document);
SmartDOMReader.extractFull(document);
SmartDOMReader.extractFromElement(element, 'interactive');
```

### Progressive Extraction API

```typescript
// Step 1: Structure overview (Document or Element)
const overview = ProgressiveExtractor.extractStructure(document);
// Returns: regions, forms, summary, suggestions

// Step 2: Region extraction
const region = ProgressiveExtractor.extractRegion(
  selector,
  document,
  options
);
// Returns: Full SmartDOMResult for that region

// Step 3: Content extraction
const content = ProgressiveExtractor.extractContent(
  selector,
  document,
  { includeMedia: true }
);
// Returns: Text content, headings, lists, tables, media
```

## Output Structure

Both approaches return structured data optimized for AI processing:

```typescript
interface SmartDOMResult {
  mode: 'interactive' | 'full';
  timestamp: number;
  
  page: {
    url: string;
    title: string;
    hasErrors: boolean;
    isLoading: boolean;
    hasModals: boolean;
    hasFocus?: string;
  };
  
  landmarks: {
    navigation: string[];
    main: string[];
    forms: string[];
    headers: string[];
    footers: string[];
    articles: string[];
    sections: string[];
  };
  
  interactive: {
    buttons: ExtractedElement[];
    links: ExtractedElement[];
    inputs: ExtractedElement[];
    forms: FormInfo[];
    clickable: ExtractedElement[];
  };
  
  semantic?: {  // Only in full mode
    headings: ExtractedElement[];
    images: ExtractedElement[];
    tables: ExtractedElement[];
    lists: ExtractedElement[];
    articles: ExtractedElement[];
  };
  
  metadata?: {  // Only in full mode
    totalElements: number;
    extractedElements: number;
    mainContent?: string;
    language?: string;
  };
}
```

## Element Information

Each extracted element includes comprehensive selector strategies with ranking (stable-first):

```typescript
interface ExtractedElement {
  tag: string;
  text: string;

  selector: {
    css: string;         // Best CSS selector (ranked stable-first)
    xpath: string;       // XPath selector
    textBased?: string;  // Text-content based hint
    dataTestId?: string; // data-testid if available
    ariaLabel?: string;  // ARIA label if available
    candidates?: Array<{
      type: 'id' | 'data-testid' | 'role-aria' | 'name' | 'class-path' | 'css-path' | 'xpath' | 'text';
      value: string;
      score: number;     // Higher = more stable/robust
    }>;
  };

  attributes: Record<string, string>;

  context: {
    nearestForm?: string;
    nearestSection?: string;
    nearestMain?: string;
    nearestNav?: string;
    parentChain: string[];
  };

  // Compact flags: only present when true to save tokens
  interaction: {
    click?: boolean;
    change?: boolean;
    submit?: boolean;
    nav?: boolean;
    disabled?: boolean;
    hidden?: boolean;
    role?: string; // aria role when present
    form?: string; // associated form selector
  };
}
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | `'interactive' \| 'full'` | `'interactive'` | Extraction mode |
| `maxDepth` | `number` | `5` | Maximum traversal depth |
| `includeHidden` | `boolean` | `false` | Include hidden elements |
| `includeShadowDOM` | `boolean` | `true` | Traverse shadow DOM |
| `includeIframes` | `boolean` | `false` | Traverse iframes |
| `viewportOnly` | `boolean` | `false` | Only visible viewport elements |
| `mainContentOnly` | `boolean` | `false` | Focus on main content area |
| `customSelectors` | `string[]` | `[]` | Additional selectors to extract |

## Use Cases

### AI Userscript Generation (Progressive Approach)
```typescript
// First, understand the page structure
const structure = ProgressiveExtractor.extractStructure(document);

// AI decides which region to focus on based on structure
const targetRegion = structure.regions.main?.selector || 'body';

// Extract detailed information from chosen region
const details = ProgressiveExtractor.extractRegion(
  targetRegion,
  document,
  { mode: 'interactive', viewportOnly: true }
);

// Generate userscript prompt with focused context
const prompt = `
  Page: ${details.page.title}
  Main form: ${details.interactive.forms[0]?.selector}
  Submit button: ${details.interactive.buttons.find(b => b.text.includes('Submit'))?.selector.css}
  
  Write a userscript to auto-fill and submit this form.
`;
```

### Test Automation (Full Extraction)
```typescript
// Get all interactive elements at once
const testData = SmartDOMReader.extractInteractive(document, {
  customSelectors: ['[data-test]', '[data-cy]']
});

// Use multiple selector strategies for robust testing
testData.interactive.buttons.forEach(button => {
  console.log(`Button: ${button.text}`);
  console.log(`  CSS: ${button.selector.css}`);
  console.log(`  XPath: ${button.selector.xpath}`);
  console.log(`  TestID: ${button.selector.dataTestId}`);
  console.log(`  Ranked candidates:`, button.selector.candidates?.slice(0, 3));
});
```

### Content Analysis (Progressive Approach)
```typescript
// Get structure first
const structure = ProgressiveExtractor.extractStructure(document);

// Extract readable content from main area
const content = ProgressiveExtractor.extractContent(
  structure.summary.mainContentSelector || 'main',
  document,
  { includeHeadings: true, includeTables: true }
);

console.log(`Word count: ${content.metadata.wordCount}`);
console.log(`Headings: ${content.text.headings?.length}`);
console.log(`Has interactive elements: ${content.metadata.hasInteractive}`);
```

## Stateless Architecture

All methods are stateless and accept document/element parameters explicitly:

```typescript
// No window or document globals required
function extractFromIframe(iframe: HTMLIFrameElement) {
  const iframeDoc = iframe.contentDocument;
  if (iframeDoc) {
    return SmartDOMReader.extractInteractive(iframeDoc);
  }
}

// Works with any document context
function extractFromShadowRoot(shadowRoot: ShadowRoot) {
  const container = shadowRoot.querySelector('.container');
  if (container) {
    return SmartDOMReader.extractFromElement(container);
  }
}

/**
 * Stateless bundle string (for extensions / userScripts)
 *
 * The library also provides a self-contained IIFE bundle as a string
 * export that can be injected and executed without touching window scope.
 */
import { SMART_DOM_READER_BUNDLE } from '@mcp-b/smart-dom-reader/bundle-string';

function execute(method, args) {
  const code = `(() => {\n${SMART_DOM_READER_BUNDLE}\nreturn SmartDOMReaderBundle.executeExtraction(${JSON.stringify(
    'extractStructure'
  )}, ${JSON.stringify({ selector: undefined, formatOptions: { detail: 'summary' } })});\n})()`;
  // inject `code` into the page (e.g., chrome.userScripts.execute)
}

// Note: The bundle contains guarded fallbacks (e.g., typeof require === 'function')
// that are no-ops in the browser; there are no runtime imports.
```

## Design Philosophy

This library is designed to provide:

1. **Token Efficiency**: Progressive extraction minimizes token usage for AI applications
2. **Flexibility**: Choose between complete extraction or step-by-step approach
3. **Statelessness**: No global dependencies, works in any JavaScript environment
4. **Multiple Selector Strategies**: Robust element targeting with fallbacks
5. **Semantic Understanding**: Preserves meaning and relationships
6. **Interactive Focus**: Prioritizes elements users interact with
7. **Context Preservation**: Maintains element relationships
8. **Framework Agnostic**: Works with any web application

## Credits

Inspired by:
- [stacking-contexts-inspector](https://github.com/andreadev-it/stacking-contexts-inspector) - DOM traversal techniques
- [dom-to-semantic-markdown](https://github.com/romansky/dom-to-semantic-markdown) - Content scoring algorithms
- [z-context](https://github.com/gwwar/z-context) - Selector generation approaches

## License

MIT

## MCP Server (Golden Path)

For AI agents, use the bundled MCP server which returns XML-wrapped Markdown instead of JSON. This keeps responses concise and readable for LLMs while providing clear structural boundaries.

- Output format: always XML envelope with a single section tag containing Markdown in CDATA
  - Structure: `<page title="..." url="...">\n  <outline><![CDATA[ ...markdown... ]]></outline>\n</page>`
  - Region: `<page ...>\n  <section><![CDATA[ ...markdown... ]]></section>\n</page>`
  - Content: `<page ...>\n  <content><![CDATA[ ...markdown... ]]></content>\n</page>`
- Golden path sequence:
  1) `dom_extract_structure` → get page outline and pick a target
  2) `dom_extract_region` → get actionable selectors for that area
  3) Write a script; if unstable, re-run with higher detail or limits
  4) Optional: `dom_extract_content` for readable text context

### Running the server

Ensure the library is built so the formatter is available:

```
pnpm -w --filter @mcp-b/smart-dom-reader run build
```

Build and update the embedded bundle, then start the MCP server (stdio):

```
pnpm --filter @mcp-b/smart-dom-reader bundle:mcp
pnpm --filter @mcp-b/smart-dom-reader-server run start
```

Or directly with tsx:

```
tsx smart-dom-reader/mcp-server/src/index.ts
```

### Tool overview (inputs only)

- `browser_connect` → `{ headless?: boolean, executablePath?: string }`
- `browser_navigate` → `{ url: string }`
- `dom_extract_structure` → `{ selector?: string, detail?: 'summary'|'region'|'deep', maxTextLength?: number, maxElements?: number }`
- `dom_extract_region` → `{ selector: string, options?: { mode?: 'interactive'|'full', includeHidden?: boolean, maxDepth?: number, detail?: 'summary'|'region'|'deep', maxTextLength?: number, maxElements?: number } }`
- `dom_extract_content` → `{ selector: string, options?: { includeHeadings?: boolean, includeLists?: boolean, includeMedia?: boolean, maxTextLength?: number, detail?: 'summary'|'region'|'deep', maxElements?: number } }`
- `dom_extract_interactive` → `{ selector?: string, options?: { viewportOnly?: boolean, maxDepth?: number, detail?: 'summary'|'region'|'deep', maxTextLength?: number, maxElements?: number } }`
- `browser_screenshot` → `{ path?: string, fullPage?: boolean }`
- `browser_close` → `{}`

All extraction tools return XML-wrapped Markdown with a short “Next:” instruction at the bottom to guide the following step.

## Local Testing (Playwright)

Run the library in a real browser against local HTML (no network):

```
pnpm --filter @mcp-b/smart-dom-reader bundle:mcp
pnpm --filter @mcp-b/smart-dom-reader test:local
```

What it validates:
- Stable selectors (ID, data-testid, role+aria, name/id)
- Semantic extraction (headings/images/tables/lists)
- Shadow DOM detection
