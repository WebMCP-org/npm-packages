/**
 * @webmcp/helpers
 *
 * Lightweight helper utilities for WebMCP userscript development.
 * Tree-shakable - only what you use gets bundled.
 *
 * @example
 * ```typescript
 * import { waitForElement, textResponse, jsonResponse } from '@webmcp/helpers';
 *
 * navigator.modelContext.registerTool({
 *   name: 'get_data',
 *   handler: async () => {
 *     const el = await waitForElement('.data-container');
 *     return textResponse(el.textContent);
 *   }
 * });
 * ```
 */

// DOM helpers
export {
  clickElement,
  getAllElements,
  getFieldValue,
  getText,
  isChecked,
  isVisible,
  scrollIntoView,
  selectOption,
  setChecked,
  typeText,
  waitForElement,
  waitForElementRemoved,
} from './dom.js';
// Response types
export type { ContentItem, ToolResponse } from './response.js';
// Response helpers
export {
  errorResponse,
  imageResponse,
  jsonResponse,
  listResponse,
  messageWithData,
  multiTextResponse,
  textResponse,
} from './response.js';
// Retry types
export type { RetryOptions } from './retry.js';
// Retry/polling helpers
export {
  debounce,
  pollUntil,
  retry,
  retryUntil,
  sleep,
  throttle,
} from './retry.js';
