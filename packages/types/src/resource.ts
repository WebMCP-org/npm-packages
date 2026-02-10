import type { ResourceContents } from './common.js';

// ============================================================================
// Resource Descriptor
// ============================================================================

/**
 * Resource descriptor for the Web Model Context API.
 *
 * Defines a resource that can be read by AI models.
 *
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/resources/}
 */
export interface ResourceDescriptor {
  /**
   * Resource URI or URI template (for example, `file://{path}`).
   */
  uri: string;

  /**
   * Human-readable resource name.
   */
  name: string;

  /**
   * Optional human-readable summary.
   */
  description?: string;

  /**
   * Optional MIME type hint.
   */
  mimeType?: string;

  /**
   * Reads resource contents for a resolved URI.
   */
  read: (uri: URL, params?: Record<string, string>) => Promise<{ contents: ResourceContents[] }>;
}

// ============================================================================
// Resource Template Info
// ============================================================================

/**
 * Resource template information returned by listResourceTemplates().
 */
export interface ResourceTemplateInfo {
  /**
   * URI template (for example, `file://{path}`).
   */
  uriTemplate: string;

  /**
   * Human-readable template name.
   */
  name: string;

  /**
   * Optional human-readable summary.
   */
  description?: string;

  /**
   * Optional MIME type hint.
   */
  mimeType?: string;
}
