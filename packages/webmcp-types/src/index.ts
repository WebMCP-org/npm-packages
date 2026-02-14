import type { ModelContext, ModelContextTesting } from './model-context.js';

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
  LooseContentBlock,
  RegistrationHandle,
  ResourceContents,
  ResourceLink,
  TextContent,
  TextResourceContents,
  ToolResponse,
} from './common.js';
export type {
  InferArgsFromInputSchema,
  InferJsonSchema,
  JsonSchemaArray,
  JsonSchemaBoolean,
  JsonSchemaEnumValue,
  JsonSchemaForInference,
  JsonSchemaMultiType,
  JsonSchemaNull,
  JsonSchemaNumber,
  JsonSchemaObject,
  JsonSchemaPrimitiveType,
  JsonSchemaString,
  JsonSchemaType,
  JsonSchemaTypeArray,
} from './json-schema.js';
export type {
  AnyToolDescriptor,
  InferToolArgs,
  InferToolResult,
  ModelContext,
  ModelContextCore,
  ModelContextExtensions,
  ModelContextInput,
  ModelContextOptions,
  ModelContextTesting,
  ModelContextTestingExecuteToolOptions,
  ModelContextTestingPolyfillExtensions,
  ModelContextTestingToolInfo,
  ModelContextWithExtensions,
  ToolArgsByName,
  ToolByName,
  ToolCallEvent,
  ToolCallParams,
  ToolName,
  ToolResultByName,
  TypedModelContext,
} from './model-context.js';
export type {
  MaybePromise,
  ModelContextClient,
  ToolAnnotations,
  ToolDescriptor,
  ToolDescriptorFromSchema,
  ToolExecutionContext,
  ToolListItem,
  ToolResultFromOutputSchema,
} from './tool.js';

// ============================================================================
// Global Augmentation
// ============================================================================

declare global {
  interface Navigator {
    /**
     * Web Model Context API strict core surface.
     */
    modelContext: ModelContext;

    /**
     * Web Model Context testing API surface (Chromium early preview).
     * @deprecated Prefer navigator.modelContext.callTool(...) and toolschanged events
     * for in-page consumers. Chromium still exposes this API for testing flows.
     */
    modelContextTesting?: ModelContextTesting;
  }
}
