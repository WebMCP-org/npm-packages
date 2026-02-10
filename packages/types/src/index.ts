import type { ModelContext } from './model-context.js';

// Re-export all public types
export type {
  AudioContent,
  BlobResourceContents,
  CallToolResult,
  ContentBlock,
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
  ElicitationFormParams,
  ElicitationParams,
  ElicitationResult,
  ElicitationUrlParams,
  InferToolArgs,
  InferToolResult,
  ModelContext,
  ModelContextInput,
  ModelPreferences,
  SamplingRequestMessage,
  SamplingRequestParams,
  SamplingResult,
  ToolArgsByName,
  ToolByName,
  ToolCallEvent,
  ToolCallParams,
  ToolName,
  ToolResultByName,
  TypedModelContext,
} from './model-context.js';
export type { ToolAnnotations, ToolDescriptor, ToolListItem } from './tool.js';

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
