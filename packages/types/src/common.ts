// ============================================================================
// Common Types for the Web Model Context API
// ============================================================================

/**
 * Primitive JSON value.
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * Object-shaped JSON value.
 */
export interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * Any valid JSON value.
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

/**
 * JSON Schema property definition.
 *
 * @see {@link https://json-schema.org/}
 */
export interface InputSchemaProperty {
  /**
   * JSON Schema type for this property.
   */
  type: string;

  /**
   * Human-readable description of the property.
   */
  description?: string;

  /**
   * Additional JSON Schema keywords.
   */
  [key: string]: unknown;
}

/**
 * JSON Schema definition for tool input parameters.
 *
 * @see {@link https://json-schema.org/}
 */
export interface InputSchema {
  /**
   * JSON Schema type for the root value (usually `'object'` for tool args).
   */
  type: string;

  /**
   * Property definitions for object schemas.
   */
  properties?: Record<string, InputSchemaProperty>;

  /**
   * List of required property names.
   */
  required?: string[];

  /**
   * Additional JSON Schema keywords.
   */
  [key: string]: unknown;
}

// ============================================================================
// Content Types (MCP spec shapes, defined inline)
// ============================================================================

/**
 * Plain text content.
 */
export interface TextContent {
  /**
   * Discriminator for text content.
   */
  type: 'text';

  /**
   * UTF-8 text value.
   */
  text: string;
}

/**
 * Base64-encoded image content.
 */
export interface ImageContent {
  /**
   * Discriminator for image content.
   */
  type: 'image';

  /**
   * Base64 payload.
   */
  data: string;

  /**
   * MIME type for the encoded image.
   */
  mimeType: string;
}

/**
 * Base64-encoded audio content.
 */
export interface AudioContent {
  /**
   * Discriminator for audio content.
   */
  type: 'audio';

  /**
   * Base64 payload.
   */
  data: string;

  /**
   * MIME type for the encoded audio.
   */
  mimeType: string;
}

/**
 * Text resource contents.
 */
export interface TextResourceContents {
  /**
   * Canonical resource URI.
   */
  uri: string;

  /**
   * Optional MIME type.
   */
  mimeType?: string;

  /**
   * UTF-8 resource payload.
   */
  text: string;
}

/**
 * Binary resource contents encoded as base64.
 */
export interface BlobResourceContents {
  /**
   * Canonical resource URI.
   */
  uri: string;

  /**
   * Optional MIME type.
   */
  mimeType?: string;

  /**
   * Base64-encoded binary payload.
   */
  blob: string;
}

/**
 * Resource contents returned by resource reads.
 */
export type ResourceContents = TextResourceContents | BlobResourceContents;

/**
 * Embedded resource content block.
 */
export interface EmbeddedResource {
  /**
   * Discriminator for embedded resources.
   */
  type: 'resource';

  /**
   * Inlined resource contents.
   */
  resource: ResourceContents;
}

/**
 * Link to an externally retrievable resource.
 */
export interface ResourceLink {
  /**
   * Discriminator for resource links.
   */
  type: 'resource_link';

  /**
   * Resource URI.
   */
  uri: string;

  /**
   * Optional display name.
   */
  name?: string;

  /**
   * Optional human-readable description.
   */
  description?: string;

  /**
   * Optional MIME type hint.
   */
  mimeType?: string;
}

/**
 * Any content block allowed in tool responses.
 */
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
  /**
   * Ordered content blocks to return to the model.
   */
  content: ContentBlock[];

  /**
   * Optional machine-readable payload.
   */
  structuredContent?: JsonObject;

  /**
   * Marks the result as an error response.
   */
  isError?: boolean;
}

/**
 * Alias for {@link CallToolResult} for API consistency.
 */
export type ToolResponse = CallToolResult;

// ============================================================================
// Elicitation Types
// ============================================================================

/**
 * Form-based elicitation request parameters.
 */
export interface ElicitationFormParams {
  /**
   * Elicitation mode. Omit or set to `'form'` for form input.
   */
  mode?: 'form';

  /**
   * User-facing message.
   */
  message: string;

  /**
   * Requested form schema.
   */
  requestedSchema: {
    /**
     * Root schema type.
     */
    type: 'object';

    /**
     * Field definitions.
     */
    properties: Record<string, InputSchema>;

    /**
     * Required field names.
     */
    required?: string[];

    /**
     * Additional schema keywords.
     */
    [key: string]: unknown;
  };
}

/**
 * URL-based elicitation request parameters.
 */
export interface ElicitationUrlParams {
  /**
   * Elicitation mode.
   */
  mode: 'url';

  /**
   * User-facing message.
   */
  message: string;

  /**
   * Unique elicitation identifier.
   */
  elicitationId: string;

  /**
   * URL to open.
   */
  url: string;
}

/**
 * Elicitation request parameters.
 */
export type ElicitationParams = ElicitationFormParams | ElicitationUrlParams;

/**
 * Result returned by an elicitation request.
 */
export interface ElicitationResult {
  /**
   * User decision.
   */
  action: 'accept' | 'decline' | 'cancel';

  /**
   * Submitted values when `action` is `'accept'`.
   */
  content?: Record<string, string | number | boolean | string[]>;
}

/**
 * Registration handle returned by registration methods.
 */
export interface RegistrationHandle {
  /**
   * Unregisters the associated item.
   */
  unregister: () => void;
}
