import type { ModelContext, ModelContextTesting } from './model-context.js';

export type {
  CallToolResult,
  ContentBlock,
  InputSchema,
  JsonObject,
  JsonValue,
  RegistrationHandle,
  TextContent,
  WebMcpToolInput,
} from './common.js';
export type {
  InferArgsFromInputSchema,
  InferJsonSchema,
  JsonSchemaForInference,
} from './json-schema.js';
export type {
  ChromeModelContext,
  ChromeModelContextExecuteToolOptions,
  ChromeModelContextExtensions,
  ModelContext,
  ModelContextExtensions,
  ModelContextGetToolOptions,
  ModelContextRegisterToolOptions,
  ModelContextTesting,
  ModelContextTestingToolInfo,
  ModelContextWithExtensions,
  RegisteredTool,
} from './model-context.js';
export type {
  MaybePromise,
  ModelContextTool,
  ToolAnnotations,
  ToolDescriptor,
  ToolDescriptorFromSchema,
  ToolListItem,
  ToolResultFromOutputSchema,
  WebMcpToolAnnotations,
} from './tool.js';

declare global {
  /** Web IDL interface object used for branding and `instanceof`. */
  var ModelContext: Function & {
    readonly prototype: ModelContext;
    [Symbol.hasInstance](value: unknown): value is ModelContext;
  };

  interface Document {
    /** Canonical WebMCP API for this document. */
    readonly modelContext: ModelContext;
  }

  interface Navigator {
    /** @deprecated Use `document.modelContext`. */
    readonly modelContext?: ModelContext;

    /** @deprecated Compatibility surface for older Chromium previews. */
    modelContextTesting?: ModelContextTesting;
  }
}
