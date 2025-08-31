# Smart DOM Reader

A token-efficient TypeScript library for extracting DOM information optimized for AI-powered userscript generation. Combines wisdom from multiple DOM extraction approaches to provide intelligent, context-aware element extraction.

## Features

- **Two extraction modes**: Interactive-only and Full
- **Multiple selector strategies**: CSS, XPath, text-based, data-testid
- **Smart content detection**: Automatically identifies main content areas
- **Context preservation**: Maintains element relationships and semantic context
- **Shadow DOM & iframe support**: Traverses complex DOM structures
- **Token-efficient**: Optimized for LLM context windows

## Installation

```bash
npm install smart-dom-reader
```

## Usage

### Quick Start

```typescript
import { SmartDOMReader } from 'smart-dom-reader';

// Interactive mode - extract only interactive elements
const interactiveData = SmartDOMReader.extractInteractive();

// Full mode - extract interactive + semantic elements
const fullData = SmartDOMReader.extractFull();
```

### Advanced Usage

```typescript
import { SmartDOMReader, ExtractionOptions } from 'smart-dom-reader';

const options: Partial<ExtractionOptions> = {
  mode: 'interactive',
  maxDepth: 3,
  includeHidden: false,
  includeShadowDOM: true,
  includeIframes: false,
  viewportOnly: true,
  mainContentOnly: true,
  customSelectors: ['[data-action]', '.custom-interactive']
};

const reader = new SmartDOMReader(options);
const result = reader.extract();

// Access extracted data
console.log(result.interactive.buttons);
console.log(result.interactive.forms);
console.log(result.landmarks);
```

### Extract from Specific Element

```typescript
import { SmartDOMReader } from 'smart-dom-reader';

const element = document.querySelector('#my-form');
const extracted = SmartDOMReader.extractFromElement(element!, 'interactive');
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

## Output Structure

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

Each extracted element includes:

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
  
  attributes: Record<string, string>;  // Relevant attributes
  
  context: {
    nearestForm?: string;
    nearestSection?: string;
    nearestMain?: string;
    nearestNav?: string;
    parentChain: string[];  // Path from element to root
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

### AI Userscript Generation
```typescript
const data = SmartDOMReader.extractInteractive({
  mainContentOnly: true,
  viewportOnly: true
});

// Send to AI with context about interactive elements
const prompt = `
  Page: ${data.page.title}
  Available buttons: ${data.interactive.buttons.map(b => b.text)}
  Forms: ${data.interactive.forms.map(f => f.selector)}
  
  Write a userscript to auto-fill the form and submit it.
`;
```

### Page Analysis
```typescript
const analysis = SmartDOMReader.extractFull({
  includeHidden: true,
  includeShadowDOM: true
});

console.log('Page structure:', analysis.landmarks);
console.log('Content sections:', analysis.semantic?.articles);
console.log('Interactive elements:', analysis.interactive);
```

### Testing Automation
```typescript
const testData = SmartDOMReader.extractInteractive({
  customSelectors: ['[data-test]', '[data-cy]']
});

// Use selectors for test automation
testData.interactive.buttons.forEach(button => {
  console.log(`Button: ${button.text}`);
  console.log(`  CSS: ${button.selector.css}`);
  console.log(`  XPath: ${button.selector.xpath}`);
  console.log(`  TestID: ${button.selector.dataTestId}`);
});
```

## Design Philosophy

This library is designed to provide:

1. **Token Efficiency**: Extract only what's needed for AI context
2. **Multiple Selector Strategies**: Robust element targeting
3. **Semantic Understanding**: Preserve meaning and relationships
4. **Interactive Focus**: Prioritize elements users interact with
5. **Context Preservation**: Maintain element relationships
6. **Framework Agnostic**: Works with any web application

## Credits

Inspired by:
- [stacking-contexts-inspector](https://github.com/andreadev-it/stacking-contexts-inspector) - DOM traversal techniques
- [dom-to-semantic-markdown](https://github.com/romansky/dom-to-semantic-markdown) - Content scoring algorithms
- [z-context](https://github.com/gwwar/z-context) - Selector generation approaches

## License

MIT