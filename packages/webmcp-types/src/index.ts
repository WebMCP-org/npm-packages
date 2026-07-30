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
  ChromeModelContext,
  ChromeModelContextExecuteToolOptions,
  ChromeModelContextExtensions,
  ModelContext,
  ModelContextCore,
  ModelContextExtensions,
  ModelContextGetToolOptions,
  ModelContextRegisterToolOptions,
  ModelContextTesting,
  ModelContextTestingExecuteToolOptions,
  ModelContextTestingToolInfo,
  ModelContextToolInfo,
  ModelContextToolReference,
  ModelContextWithExtensions,
  RegisteredTool,
} from './model-context.js';
export type {
  MaybePromise,
  ModelContextClient,
  ModelContextTool,
  ModelContextToolFromSchema,
  ToolAnnotations,
  ToolDescriptor,
  ToolDescriptorFromSchema,
  ToolExecuteResult,
  ToolListItem,
  ToolRawResult,
  ToolResultFromOutputSchema,
  WebMcpToolAnnotations,
} from './tool.js';

// ============================================================================
// Global Augmentation
// ============================================================================

declare global {
  interface Document {
    /**
     * Web Model Context API strict core surface.
     *
     * Each Document owns its associated ModelContext. This is the canonical
     * WebMCP install location.
     *
     * @see {@link https://webmachinelearning.github.io/webmcp/#dom-document-modelcontext}
     */
    readonly modelContext: ModelContext;
  }

  interface Navigator {
    /**
     * Removed WebMCP preview alias retained for compatibility with older
     * Chromium builds and MCP-B polyfills.
     *
     * @deprecated Use `document.modelContext`. Current Chromium no longer
     * exposes this alias.
     */
    readonly modelContext?: ModelContext;

    /**
     * Removed Chromium testing API retained for older browsers and MCP-B
     * compatibility shims.
     *
     * @deprecated Use `document.modelContext.getTools()` and feature-detect the
     * optional Chrome `executeTool()` extension.
     */
    modelContextTesting?: ModelContextTesting;
  }
}
