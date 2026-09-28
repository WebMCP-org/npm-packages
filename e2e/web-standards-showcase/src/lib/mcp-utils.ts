/**
 * Utilities for working with MCP (Model Context Protocol) responses
 */

import { isCallToolResult } from '@modelcontextprotocol/server';
import type { CallToolResult, JSONValue as JsonValue } from '@modelcontextprotocol/server';

/**
 * Formatted result with extracted display text and error status
 */
export type FormattedMcpResult = {
  displayText: string;
  isError: boolean;
  rawResult: CallToolResult | JsonValue | undefined;
};

function isString(value: JsonValue): value is string {
  return typeof value === 'string';
}

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
export function formatMcpResult(
  result: CallToolResult | JsonValue | undefined
): FormattedMcpResult {
  // Handle null/undefined
  if (result === null || result === undefined) {
    return {
      displayText: '',
      isError: false,
      rawResult: result,
    };
  }

  if (!isCallToolResult(result)) {
    return {
      displayText: isString(result) ? result : (JSON.stringify(result, null, 2) ?? String(result)),
      isError: false,
      rawResult: result,
    };
  }

  const isError = result.isError ?? false;

  const textContent = result.content
    .flatMap((item) => (item.type === 'text' && item.text ? [item.text] : []))
    .join('\n');

  if (textContent) {
    return {
      displayText: textContent,
      isError,
      rawResult: result,
    };
  }

  // If no text content, try to show other content types
  const otherContent = result.content
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

  // Fallback: stringify the entire result
  return {
    displayText: JSON.stringify(result, null, 2),
    isError,
    rawResult: result,
  };
}
