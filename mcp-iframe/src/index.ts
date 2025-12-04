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
 * // Or import the class for manual registration
 * import { MCPIframeElement, registerMCPIframeElement } from '@mcp-b/mcp-iframe';
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

export {
  MCPIframeElement,
  type MCPIframeErrorEventDetail,
  type MCPIframeReadyEventDetail,
  type MCPIframeToolsChangedEventDetail,
  registerMCPIframeElement,
} from './MCPIframeElement.js';
