/**
 * Utilities for working with MCP (Model Context Protocol) responses
 */

/**
 * MCP tool response format
 */
export type McpToolResponse = {
  content?: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
  isError?: boolean;
  [key: string]: unknown;
};

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
  const mcpResponse = result as McpToolResponse;
  const isError = Boolean(mcpResponse.isError);

  // Extract text content from content array
  if (mcpResponse.content && Array.isArray(mcpResponse.content)) {
    const textContent = mcpResponse.content
      .filter((item) => item.type === 'text' && item.text)
      .map((item) => item.text)
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

/**
 * Check if a result looks like an MCP tool response
 */
export function isMcpToolResponse(result: unknown): result is McpToolResponse {
  if (typeof result !== 'object' || result === null) {
    return false;
  }

  const obj = result as Record<string, unknown>;
  return 'content' in obj && Array.isArray(obj.content);
}

/**
 * Tool source types
 */
export type ToolSourceType = 'remote' | 'webmcp';

/**
 * Get the tool source type based on sourceId
 * - If sourceId is undefined or 'http': Remote MCP (HTTP server)
 * - If sourceId is a string value: WebMCP (iframe)
 *
 * @param sourceId - The sourceId from the tool metadata
 * @returns The source type ('remote' or 'webmcp')
 *
 * @example
 * ```ts
 * getToolSourceType(undefined) // 'remote'
 * getToolSourceType('http') // 'remote'
 * getToolSourceType('iframe-123') // 'webmcp'
 * ```
 */
export function getToolSourceType(sourceId?: string): ToolSourceType {
  return sourceId && sourceId !== 'http' ? 'webmcp' : 'remote';
}

/**
 * Get a human-readable label for the tool source type
 *
 * @param sourceId - The sourceId from the tool metadata
 * @returns Display label ('Remote MCP' or 'WebMCP')
 */
export function getToolSourceLabel(sourceId?: string): string {
  return getToolSourceType(sourceId) === 'remote' ? 'Remote MCP' : 'WebMCP';
}

/**
 * Count tools by source type
 *
 * @param tools - Array of tools with optional _sourceId property
 * @returns Object with counts for each source type
 *
 * @example
 * ```ts
 * const counts = countToolsBySource(tools);
 * // { remote: 5, webmcp: 3, total: 8 }
 * ```
 */
export function countToolsBySource(tools: Array<{ _sourceId?: string; [key: string]: unknown }>): {
  remote: number;
  webmcp: number;
  total: number;
} {
  const counts = tools.reduce<{ remote: number; webmcp: number; total: number }>(
    (acc, tool) => {
      const type = getToolSourceType(tool._sourceId);
      acc[type] = (acc[type] || 0) + 1;
      acc.total = (acc.total || 0) + 1;
      return acc;
    },
    { remote: 0, webmcp: 0, total: 0 }
  );

  return counts;
}
