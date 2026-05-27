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
  ModelContextRegisterToolOptions,
  ModelContextTesting,
  ModelContextTestingExecuteToolOptions,
  ModelContextTestingPolyfillExtensions,
  ModelContextTestingToolInfo,
  ModelContextToolReference,
  ModelContextToolRegistrationHandle,
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
  ToolExecuteResult,
  ToolExecutionContext,
  ToolListItem,
  ToolRawResult,
  ToolResultFromOutputSchema,
} from './tool.js';

// ============================================================================
// Global Augmentation
// ============================================================================

declare global {
  interface Document {
    /**
     * Web Model Context API strict core surface.
     *
     * Per WebMCP spec PR webmachinelearning/webmcp#184, each Document owns its
     * associated ModelContext. This is the canonical install location as of
     * Chrome 150. Prefer `document.modelContext` for new code.
     */
    modelContext: ModelContext;
  }

  interface Navigator {
    /**
     * Web Model Context API strict core surface.
     *
     * @deprecated The modelContext getter moved from Navigator to Document in
     * Chrome 150 (see webmachinelearning/webmcp#173 / PR #184). Use
     * `document.modelContext` instead. `navigator.modelContext` is kept as a
     * backward-compatible alias and will be removed in a future Chrome release.
     */
    modelContext: ModelContext;

    /**
     * Web Model Context testing API surface (Chromium early preview).
     * @deprecated Prefer navigator.modelContext.callTool(...) and toolchange events
     * for in-page consumers. Chromium still exposes this API for testing flows.
     */
    modelContextTesting?: ModelContextTesting;
  }
}
