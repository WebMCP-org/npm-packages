import type { ModelContext } from './model-context.js';

// Re-export all public types
export type {
  AudioContent,
  BlobResourceContents,
  CallToolResult,
  ContentBlock,
  ElicitationFormParams,
  ElicitationParams,
  ElicitationResult,
  ElicitationUrlParams,
  EmbeddedResource,
  ImageContent,
  InputSchema,
  InputSchemaProperty,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  RegistrationHandle,
  ResourceContents,
  ResourceLink,
  TextContent,
  TextResourceContents,
  ToolResponse,
} from './common.js';
export type {
  AnyToolDescriptor,
  InferToolArgs,
  InferToolResult,
  ModelContext,
  ModelContextInput,
  ToolArgsByName,
  ToolByName,
  ToolCallEvent,
  ToolCallParams,
  ToolName,
  ToolResultByName,
  TypedModelContext,
} from './model-context.js';
export type {
  ToolAnnotations,
  ToolDescriptor,
  ToolExecutionContext,
  ToolListItem,
} from './tool.js';

// ============================================================================
// Global Augmentation
// ============================================================================

declare global {
  interface Navigator {
    /**
     * Web Model Context API surface.
     */
    modelContext: ModelContext;
  }
}
