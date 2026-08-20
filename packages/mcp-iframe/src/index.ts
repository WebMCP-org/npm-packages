/**
 * @mcp-b/mcp-iframe
 *
 * Custom element for exposing iframe MCP tools, resources, and prompts
 * to the parent page's Model Context API.
 *
 * @example
 * ```typescript
 * // Import to auto-register the <mcp-iframe> element
 * import '@mcp-b/mcp-iframe';
 *
 * // Or use the side-effect-free entry for a custom tag
 * import { registerMCPIframeElement } from '@mcp-b/mcp-iframe/element';
 * registerMCPIframeElement('custom-mcp-iframe');
 * ```
 *
 * @example
 * ```html
 * <mcp-iframe src="./child-app.html" id="my-app"></mcp-iframe>
 * ```
 *
 * @packageDocumentation
 */

import { registerMCPIframeElement } from './MCPIframeElement.js';

export {
  MCPIframeElement,
  type MCPIframeErrorEventDetail,
  type MCPIframeEventMap,
  type MCPIframeItemsEventDetail,
} from './MCPIframeElement.js';

registerMCPIframeElement();
