// ============================================================================
// Common Types for the Web Model Context API
// ============================================================================

import type {
  BlobResourceContents,
  CallToolResult,
  TextResourceContents,
  Tool as McpTool,
} from '@modelcontextprotocol/server';

type McpInputSchema = McpTool['inputSchema'];

export type {
  AudioContent,
  BlobResourceContents,
  CallToolResult,
  ContentBlock,
  EmbeddedResource,
  ElicitRequestFormParams as ElicitationFormParams,
  ElicitRequestParams as ElicitationParams,
  ElicitRequestURLParams as ElicitationUrlParams,
  ElicitResult as ElicitationResult,
  ImageContent,
  JSONObject as JsonObject,
  JSONValue as JsonValue,
  ResourceLink,
  TextContent,
  TextResourceContents,
} from '@modelcontextprotocol/server';

/**
 * Primitive JSON value.
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * JSON value accepted for a property entry by MCP v2 tool schemas.
 */
export type InputSchemaProperty = NonNullable<McpInputSchema['properties']>[string];

/**
 * JSON Schema definition for tool input parameters.
 *
 * @see {@link https://json-schema.org/}
 */
export interface InputSchema {
  /**
   * JSON Schema type for the root value (usually `'object'` for tool args).
   */
  type?: string | readonly string[] | undefined;

  /**
   * Property definitions for object schemas.
   */
  properties?: McpInputSchema['properties'];

  /**
   * List of required property names.
   */
  required?: readonly string[] | undefined;

  /**
   * Additional JSON Schema keywords.
   */
  [key: string]: unknown;
}

// MCP protocol types come from the v2 SDK, the protocol owner.
export type ResourceContents = TextResourceContents | BlobResourceContents;

// ============================================================================
// Result Types
// ============================================================================

/**
 * The result returned from tool execution.
 *
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/tools/}
 */
export type ToolResponse = CallToolResult;

/**
 * Registration handle returned by registration methods.
 */
export interface RegistrationHandle {
  /**
   * Unregisters the associated item.
   */
  unregister: () => void;
}
