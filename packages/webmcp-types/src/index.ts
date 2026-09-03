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
  /**
   * Web IDL interface object used for branding and `instanceof`.
   *
   * Absent unless the document's realm implements WebMCP, so guard with
   * `typeof ModelContext !== 'undefined'` before referencing it. A bare
   * reference to an undeclared global throws `ReferenceError`.
   */
  var ModelContext:
    | (Function & {
        readonly prototype: ModelContext;
        [Symbol.hasInstance](value: unknown): value is ModelContext;
      })
    | undefined;

  interface Document {
    /**
     * Canonical WebMCP API for this document.
     *
     * Optional because no browser ships WebMCP unflagged: Chromium exposes it
     * only under `--enable-features=WebMCP`, and elsewhere the property is
     * genuinely absent (`'modelContext' in document === false`). Feature-detect
     * it, or install `@mcp-b/webmcp-polyfill`.
     */
    readonly modelContext?: ModelContext;
  }

  interface Navigator {
    /** @deprecated Use `document.modelContext`. */
    readonly modelContext?: ModelContext;

    /** @deprecated Compatibility surface for older Chromium previews. */
    modelContextTesting?: ModelContextTesting;
  }

  interface SubmitEvent {
    /**
     * True when a declarative WebMCP tool initiated this submission.
     *
     * Optional because declarative forms are explainer-only: this attribute is
     * in neither the WebMCP specification nor WPT's `webmcp.idl`, and no
     * browser implements it. `@mcp-b/webmcp-polyfill` installs it.
     */
    readonly agentInvoked?: boolean;

    /**
     * Associates an intercepted form submission result with the invoking agent.
     *
     * Optional for the same reason as {@link SubmitEvent.agentInvoked}.
     */
    respondWith?(agentResponse: Promise<unknown>): void;
  }
}
