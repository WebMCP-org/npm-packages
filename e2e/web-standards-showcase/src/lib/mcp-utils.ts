/**
 * Utilities for working with MCP (Model Context Protocol) responses
 */

import type { CallToolResult } from '@mcp-b/webmcp-types';

/**
 * Formatted result with extracted display text and error status
 */
export type FormattedMcpResult = {
  displayText: string;
  isError: boolean;
  rawResult: unknown;
};

/**
 * Parse an MCP tool response and extract displayable text content
 *
 * @param result - The raw result from a tool execution
 * @returns Formatted result with display text, error status, and raw data
 *
 * @example
 * ```ts
 * const result = {
 *   content: [{ type: "text", text: "Hello world" }],
 *   isError: false
 * };
 * const formatted = formatMcpResult(result);
 * // formatted.displayText === "Hello world"
 * // formatted.isError === false
 * ```
 */
export function formatMcpResult(result: unknown): FormattedMcpResult {
  // Handle null/undefined
  if (result === null || result === undefined) {
    return {
      displayText: '',
      isError: false,
      rawResult: result,
    };
  }

  // Handle non-object results (strings, numbers, etc.)
  if (typeof result !== 'object') {
    return {
      displayText: String(result),
      isError: false,
      rawResult: result,
    };
  }

  // Type guard for MCP response
  const mcpResponse = result as CallToolResult;
  const isError = Boolean(mcpResponse.isError);

  // Extract text content from content array
  if (mcpResponse.content && Array.isArray(mcpResponse.content)) {
    const textContent = mcpResponse.content
      .filter((item) => item.type === 'text' && 'text' in item && item.text)
      .map((item) => ('text' in item ? item.text : ''))
      .join('\n');

    if (textContent) {
      return {
        displayText: textContent,
        isError,
        rawResult: result,
      };
    }

    // If no text content, try to show other content types
    const otherContent = mcpResponse.content
      .filter((item) => item.type !== 'text')
      .map((item) => `[${item.type}]`)
      .join(', ');

    if (otherContent) {
      return {
        displayText: otherContent,
        isError,
        rawResult: result,
      };
    }
  }

  // Fallback: stringify the entire result
  return {
    displayText: JSON.stringify(result, null, 2),
    isError,
    rawResult: result,
  };
}
