// ============================================================================
// Common Types for the W3C Web Model Context API
// ============================================================================

/**
 * JSON Schema definition for tool/prompt input parameters.
 *
 * @see {@link https://json-schema.org/}
 */
export interface InputSchema {
  type: string;
  properties?: Record<
    string,
    {
      type: string;
      description?: string;
      [key: string]: unknown;
    }
  >;
  required?: string[];
  [key: string]: unknown;
}

// ============================================================================
// Content Types (MCP spec shapes, defined inline)
// ============================================================================

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

export interface AudioContent {
  type: 'audio';
  data: string;
  mimeType: string;
}

export interface EmbeddedResource {
  type: 'resource';
  resource: ResourceContents & { text?: string; blob?: string };
}

export interface ResourceLink {
  type: 'resource_link';
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export type ContentBlock =
  | TextContent
  | ImageContent
  | AudioContent
  | ResourceLink
  | EmbeddedResource;

// ============================================================================
// Result Types
// ============================================================================

/**
 * The result returned from tool execution.
 *
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/tools/}
 */
export interface CallToolResult {
  content: ContentBlock[];
  structuredContent?: { [key: string]: unknown };
  isError?: boolean;
}

/**
 * Alias for CallToolResult for API consistency.
 */
export type ToolResponse = CallToolResult;

// ============================================================================
// Resource Types (MCP spec shapes)
// ============================================================================

/**
 * Represents a resource that can be read by AI models.
 *
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/resources/}
 */
export interface Resource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  size?: number;
}

/**
 * Represents the contents returned when reading a resource.
 */
export interface ResourceContents {
  uri: string;
  mimeType?: string;
}

// ============================================================================
// Registration Handle
// ============================================================================

/**
 * Registration handle returned by registerTool, registerResource, registerPrompt.
 */
export interface RegistrationHandle {
  unregister: () => void;
}
