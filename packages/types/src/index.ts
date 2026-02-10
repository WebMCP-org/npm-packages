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
  Resource,
  ResourceContents,
  ResourceLink,
  TextContent,
  TextResourceContents,
  ToolResponse,
} from './common.js';
export type {
  AnyPromptDescriptor,
  AnyToolDescriptor,
  ElicitationFormParams,
  ElicitationParams,
  ElicitationResult,
  ElicitationUrlParams,
  InferPromptArgs,
  InferToolArgs,
  InferToolResult,
  ModelContext,
  ModelContextInput,
  ModelPreferences,
  PromptArgsByName,
  PromptByName,
  PromptName,
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
export type { Prompt, PromptArgument, PromptDescriptor, PromptMessage } from './prompt.js';
export type { ResourceDescriptor, ResourceTemplateInfo } from './resource.js';
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
