/**
 * Response helper utilities for WebMCP tool handlers.
 * Provides consistent response formatting for MCP tools.
 */

/**
 * MCP tool response content item.
 */
export interface ContentItem {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}

/**
 * MCP tool response format.
 */
export interface ToolResponse {
  content: ContentItem[];
  isError?: boolean;
}

/**
 * Create a text response.
 *
 * @param text - The text content
 * @returns A properly formatted MCP tool response
 *
 * @example
 * handler: async () => textResponse('Hello, world!')
 */
export function textResponse(text: string): ToolResponse {
  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Create a JSON response (pretty-printed).
 *
 * @param data - Any JSON-serializable data
 * @param indent - Number of spaces for indentation (default: 2)
 * @returns A properly formatted MCP tool response
 *
 * @example
 * handler: async () => jsonResponse({ items: [1, 2, 3], count: 3 })
 */
export function jsonResponse(data: unknown, indent = 2): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, indent) }],
  };
}

/**
 * Create an error response.
 *
 * @param message - The error message
 * @returns A properly formatted MCP tool error response
 *
 * @example
 * handler: async () => {
 *   if (!user) return errorResponse('User not found');
 *   return textResponse('Success');
 * }
 */
export function errorResponse(message: string): ToolResponse {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

/**
 * Create a response with multiple text items.
 *
 * @param texts - Array of text strings
 * @returns A properly formatted MCP tool response
 *
 * @example
 * handler: async () => multiTextResponse(['Item 1', 'Item 2', 'Item 3'])
 */
export function multiTextResponse(texts: string[]): ToolResponse {
  return {
    content: texts.map((text) => ({ type: 'text' as const, text })),
  };
}

/**
 * Create a response from an array of items, formatting each as JSON.
 *
 * @param items - Array of items to include
 * @param options - Options for formatting
 * @param options.header - Optional header text to prepend
 * @param options.empty - Message to show if array is empty
 * @returns A properly formatted MCP tool response
 *
 * @example
 * const stories = [{title: 'Story 1'}, {title: 'Story 2'}];
 * return listResponse(stories, { header: 'Found stories:', empty: 'No stories found' });
 */
export function listResponse(
  items: unknown[],
  options: { header?: string; empty?: string } = {}
): ToolResponse {
  const { header, empty = 'No items found' } = options;

  if (items.length === 0) {
    return textResponse(empty);
  }

  const parts: string[] = [];
  if (header) {
    parts.push(header);
  }
  parts.push(JSON.stringify(items, null, 2));

  return textResponse(parts.join('\n'));
}

/**
 * Create an image response (base64 encoded).
 *
 * @param base64Data - Base64 encoded image data
 * @param mimeType - Image MIME type (default: 'image/png')
 * @returns A properly formatted MCP tool response with image
 *
 * @example
 * const canvas = document.querySelector('canvas');
 * const dataUrl = canvas.toDataURL('image/png');
 * const base64 = dataUrl.split(',')[1];
 * return imageResponse(base64, 'image/png');
 */
export function imageResponse(base64Data: string, mimeType = 'image/png'): ToolResponse {
  return {
    content: [{ type: 'image', data: base64Data, mimeType }],
  };
}

/**
 * Create a response combining text and structured data.
 *
 * @param message - Human-readable message
 * @param data - Structured data to include
 * @returns A properly formatted MCP tool response
 *
 * @example
 * return messageWithData('Found 3 results:', { results: [...], total: 3 });
 */
export function messageWithData(message: string, data: unknown): ToolResponse {
  return {
    content: [
      { type: 'text', text: message },
      { type: 'text', text: JSON.stringify(data, null, 2) },
    ],
  };
}
