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
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  read: (uri: URL, params?: Record<string, string>) => Promise<{ contents: ResourceContents[] }>;
}

// ============================================================================
// Resource Template Info
// ============================================================================

/**
 * Resource template information returned by listResourceTemplates().
 */
export interface ResourceTemplateInfo {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}
