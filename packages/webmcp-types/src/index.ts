import type { ModelContext, ModelContextTesting } from './model-context.js';

/**
 * Loads upstream browser globals, including optional `document.modelContext`.
 * Availability is per-runtime: Chromium exposes it under WebMCP flags,
 * ChatGPT's built-in browser ships it for Codex site tools, and elsewhere
 * the property is absent. Feature-detect it or install the polyfill.
 */
export type { WebMCP } from 'webmcp-types';

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
  ToolExecuteCallbackOptions,
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
