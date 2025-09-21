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
// Step 1: Structure overview
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

Each extracted element includes comprehensive selector strategies:

```typescript
interface ExtractedElement {
  tag: string;
  text: string;
  
  selector: {
    css: string;         // Optimized CSS selector
    xpath: string;       // XPath selector
    textBased?: string;  // Text-content based selector
    dataTestId?: string; // data-testid if available
    ariaLabel?: string;  // ARIA label if available
  };
  
  attributes: Record<string, string>;
  
  context: {
    nearestForm?: string;
    nearestSection?: string;
    nearestMain?: string;
    nearestNav?: string;
    parentChain: string[];
  };
  
  interaction: {
    hasClickHandler: boolean;
    hasChangeHandler: boolean;
    hasSubmitHandler: boolean;
    triggersNavigation: boolean;
    formAssociation?: string;
    ariaRole?: string;
    isDisabled: boolean;
    isHidden: boolean;
  };
  
  bounds?: {
    top: number;
    left: number;
    width: number;
    height: number;
    isVisible: boolean;
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