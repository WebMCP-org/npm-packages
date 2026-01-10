# @webmcp/helpers API Reference

Lightweight, tree-shakable helper utilities for WebMCP userscript development.

## Installation

```bash
npm install @webmcp/helpers
```

When using with `inject_webmcp_script`, imports are automatically bundled via esbuild.

## DOM Helpers

### waitForElement

Wait for an element to appear in the DOM using MutationObserver (more efficient than polling).

```typescript
function waitForElement(selector: string, timeout?: number): Promise<Element>
```

**Parameters:**
- `selector` - CSS selector to match
- `timeout` - Maximum wait time in ms (default: 5000)

**Example:**
```typescript
const button = await waitForElement('.submit-btn');
const modal = await waitForElement('[data-testid="modal"]', 10000);
```

### waitForElementRemoved

Wait for an element to be removed from the DOM.

```typescript
function waitForElementRemoved(selector: string, timeout?: number): Promise<void>
```

**Example:**
```typescript
await waitForElementRemoved('.loading-spinner');
// Spinner is gone, proceed
```

### clickElement

Click an element by selector. Waits for element if not immediately present.

```typescript
function clickElement(selector: string, timeout?: number): Promise<void>
```

**Example:**
```typescript
await clickElement('#submit-button');
await clickElement('[aria-label="Close"]');
```

### typeText

Type text into an input or textarea. Dispatches input/change events for React/Vue.

```typescript
function typeText(
  selector: string,
  text: string,
  options?: { clear?: boolean; timeout?: number }
): Promise<void>
```

**Parameters:**
- `selector` - CSS selector for input/textarea
- `text` - Text to type
- `options.clear` - Clear existing value first (default: true)
- `options.timeout` - Max wait for element (default: 5000)

**Example:**
```typescript
await typeText('#search-input', 'hello world');
await typeText('#email', 'test@example.com', { clear: true });
```

### selectOption

Select an option from a `<select>` element by value.

```typescript
function selectOption(selector: string, value: string, timeout?: number): Promise<void>
```

**Example:**
```typescript
await selectOption('#country', 'US');
```

### getText

Get trimmed text content from an element.

```typescript
function getText(selectorOrElement: string | Element): string | null
```

**Example:**
```typescript
const title = getText('.page-title');
const text = getText(someElement);
```

### getAllElements

Get all elements matching a selector as an array.

```typescript
function getAllElements(selector: string): Element[]
```

**Example:**
```typescript
const items = getAllElements('.list-item');
items.forEach(item => console.log(getText(item)));
```

### isVisible

Check if an element is visible (has dimensions and not hidden via CSS).

```typescript
function isVisible(selectorOrElement: string | Element): boolean
```

**Example:**
```typescript
if (isVisible('.modal')) {
  // Modal is showing
}
```

### scrollIntoView

Scroll an element into view.

```typescript
function scrollIntoView(
  selector: string,
  options?: ScrollIntoViewOptions,
  timeout?: number
): Promise<void>
```

**Example:**
```typescript
await scrollIntoView('#footer');
await scrollIntoView('.item', { behavior: 'smooth', block: 'center' });
```

### getFieldValue

Get the value of a form field (input, select, or textarea).

```typescript
function getFieldValue(selector: string): string | null
```

### isChecked / setChecked

Check or set the state of checkboxes/radio buttons.

```typescript
function isChecked(selector: string): boolean
function setChecked(selector: string, checked: boolean, timeout?: number): Promise<void>
```

**Example:**
```typescript
if (!isChecked('#agree-terms')) {
  await setChecked('#agree-terms', true);
}
```

## Response Helpers

### textResponse

Create a text response for tool handlers.

```typescript
function textResponse(text: string): ToolResponse
```

**Example:**
```typescript
execute: async () => textResponse('Hello, world!')
```

### jsonResponse

Create a JSON response (pretty-printed).

```typescript
function jsonResponse(data: unknown, indent?: number): ToolResponse
```

**Example:**
```typescript
execute: async () => jsonResponse({ items: [1, 2, 3], count: 3 })
```

### errorResponse

Create an error response with `isError: true`.

```typescript
function errorResponse(message: string): ToolResponse
```

**Example:**
```typescript
execute: async () => {
  if (!user) return errorResponse('User not found');
  return textResponse('Success');
}
```

### multiTextResponse

Create a response with multiple text items.

```typescript
function multiTextResponse(texts: string[]): ToolResponse
```

### listResponse

Create a response from an array with optional header and empty message.

```typescript
function listResponse(
  items: unknown[],
  options?: { header?: string; empty?: string }
): ToolResponse
```

**Example:**
```typescript
return listResponse(results, {
  header: 'Found items:',
  empty: 'No items found'
});
```

### imageResponse

Create an image response (base64 encoded).

```typescript
function imageResponse(base64Data: string, mimeType?: string): ToolResponse
```

### messageWithData

Combine a message with structured data.

```typescript
function messageWithData(message: string, data: unknown): ToolResponse
```

**Example:**
```typescript
return messageWithData('Found 3 results:', { results, total: 3 });
```

## Retry/Polling Helpers

### retryUntil

Retry a function until a predicate is satisfied.

```typescript
function retryUntil<T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  options?: RetryOptions
): Promise<T>

interface RetryOptions {
  maxAttempts?: number;      // Default: 3
  delay?: number;            // Default: 100ms
  exponentialBackoff?: boolean;
  maxDelay?: number;         // Default: 5000ms
}
```

**Example:**
```typescript
const data = await retryUntil(
  () => fetchData(),
  (result) => result.loaded === true,
  { maxAttempts: 5, delay: 200 }
);
```

### retry

Retry a function that may throw.

```typescript
function retry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>
```

**Example:**
```typescript
const data = await retry(
  () => riskyApiCall(),
  { maxAttempts: 3, delay: 500 }
);
```

### pollUntil

Poll a condition until it becomes true.

```typescript
function pollUntil(
  condition: () => boolean | Promise<boolean>,
  timeout?: number,
  interval?: number
): Promise<void>
```

**Example:**
```typescript
await pollUntil(() => window.myApp?.initialized === true, 10000);
```

### sleep

Wait for a duration. Use sparingly - prefer waitForElement or pollUntil.

```typescript
function sleep(ms: number): Promise<void>
```

### debounce / throttle

Rate-limiting utilities.

```typescript
function debounce<T extends Function>(fn: T, delay: number): T
function throttle<T extends Function>(fn: T, interval: number): T
```

## Complete Example

```typescript
import {
  waitForElement,
  getText,
  getAllElements,
  clickElement,
  textResponse,
  jsonResponse,
  errorResponse,
} from '@webmcp/helpers';

navigator.modelContext.registerTool({
  name: 'get_items',
  description: 'Get all items from the list',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max items' }
    }
  },
  execute: async ({ limit = 10 }) => {
    try {
      // Wait for content to load
      await waitForElement('.item-list');

      // Get items
      const elements = getAllElements('.item').slice(0, limit);
      const items = elements.map(el => ({
        title: getText(el.querySelector('.title')),
        price: getText(el.querySelector('.price'))
      }));

      return jsonResponse(items);
    } catch (error) {
      return errorResponse(`Failed to get items: ${error}`);
    }
  }
});

navigator.modelContext.registerTool({
  name: 'add_to_cart',
  description: 'Add an item to cart by clicking its button',
  inputSchema: {
    type: 'object',
    properties: {
      itemId: { type: 'string', description: 'Item ID' }
    },
    required: ['itemId']
  },
  execute: async ({ itemId }) => {
    try {
      await clickElement(`[data-item-id="${itemId}"] .add-to-cart`);
      return textResponse(`Added item ${itemId} to cart`);
    } catch (error) {
      return errorResponse(`Could not add item: ${error}`);
    }
  }
});
```
