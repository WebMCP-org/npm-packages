import type { InputSchema } from './common.js';
import type { JsonSchemaForInference } from './json-schema.js';
import type {
  ModelContextTool,
  ModelContextToolFromSchema,
  ToolDescriptor,
  ToolDescriptorFromSchema,
  ToolListItem,
  ToolRawResult,
  WebMcpToolAnnotations,
} from './tool.js';

// ============================================================================
// Standard discovery
// ============================================================================

/**
 * Options used to select tools exposed by descendant documents.
 *
 * @see {@link https://webmachinelearning.github.io/webmcp/#dictdef-modelcontextgettooloptions}
 */
export interface ModelContextGetToolOptions {
  /**
   * Origins whose exposed tools should be included alongside same-origin tools.
   */
  fromOrigins?: string[];
}

/**
 * Tool metadata returned by `document.modelContext.getTools()`.
 *
 * `inputSchema` is the serialized form of the JSON Schema object supplied at
 * registration time.
 *
 * @see {@link https://webmachinelearning.github.io/webmcp/#dictdef-registeredtool}
 */
export interface RegisteredTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: string;
  window: Window;
  origin: string;
  annotations?: WebMcpToolAnnotations;
}

/**
 * @deprecated Use {@link RegisteredTool}.
 */
export type ModelContextToolInfo = RegisteredTool;

/**
 * Options supported by Chromium's experimental `executeTool()` extension.
 */
export interface ChromeModelContextExecuteToolOptions {
  signal?: AbortSignal;
}

/**
 * Experimental Chromium additions to the WebMCP standard surface.
 *
 * `executeTool` is implemented by current Chromium previews but is not part of
 * the WebMCP Community Group specification. Feature-detect it before use.
 */
export interface ChromeModelContextExtensions {
  executeTool?(
    tool: RegisteredTool,
    inputArguments: string,
    options?: ChromeModelContextExecuteToolOptions
  ): Promise<string | null>;
}

// ============================================================================
// Deprecated Chromium testing compatibility
// ============================================================================

/**
 * Tool info returned by the removed `navigator.modelContextTesting.listTools()`
 * preview API.
 *
 * @deprecated Use {@link RegisteredTool} values from
 * `document.modelContext.getTools()`.
 */
export interface ModelContextTestingToolInfo {
  name: string;
  description: string;
  inputSchema?: string;
}

/**
 * @deprecated Use {@link ChromeModelContextExecuteToolOptions}.
 */
export type ModelContextTestingExecuteToolOptions = ChromeModelContextExecuteToolOptions;

/**
 * Removed Chromium testing API retained only for older browsers and MCP-B
 * compatibility shims.
 *
 * @deprecated Use `document.modelContext.getTools()` and feature-detect
 * {@link ChromeModelContextExtensions.executeTool}.
 */
export interface ModelContextTesting extends EventTarget {
  listTools(): ModelContextTestingToolInfo[];
  executeTool(
    toolName: string,
    inputArgsJson: string,
    options?: ModelContextTestingExecuteToolOptions
  ): Promise<string | null>;
  getCrossDocumentScriptToolResult?(): Promise<string>;
  ontoolchange: ((this: ModelContextTesting, ev: Event) => unknown) | null;
  /**
   * @deprecated Use `addEventListener('toolchange', ...)` instead.
   */
  registerToolsChangedCallback?(callback: () => void): void;
}

// ============================================================================
// Type Inference Helpers
// ============================================================================

/**
 * Tool identity accepted by compatibility unregister flows.
 *
 * MCP-B compatibility runtimes accept a name or the originally registered
 * tool object. Current WebMCP and Chromium do not expose `unregisterTool()`.
 */
export interface ModelContextToolReference {
  name: string;
}

/**
 * @see {@link https://webmachinelearning.github.io/webmcp/#dictdef-modelcontextregistertooloptions}
 */
export interface ModelContextRegisterToolOptions {
  /**
   * An `AbortSignal` whose abortion unregisters the tool. A pre-aborted signal short-circuits registration.
   */
  signal?: AbortSignal;

  /**
   * Origins that can observe this tool from other documents in the same tree.
   */
  exposedTo?: string[];
}

// ============================================================================
// Model Context
// ============================================================================

/**
 * Strict WebMCP core interface on document.modelContext.
 */
export interface ModelContextCore extends EventTarget {
  // ==================== TOOLS ====================

  /**
   * Registers a dynamic tool with JSON Schema-driven inference.
   *
   * The standard callback is `execute(input)`. Output schemas and the MCP-B
   * per-call client are available only on {@link ModelContextWithExtensions}.
   */
  registerTool<
    TInputSchema extends JsonSchemaForInference,
    TResult = unknown,
    TName extends string = string,
  >(
    tool: ModelContextToolFromSchema<TInputSchema, TResult, TName>,
    options?: ModelContextRegisterToolOptions
  ): Promise<void>;

  /**
   * Registers a dynamic tool with explicitly typed args/result.
   */
  registerTool<
    TInputSchema extends InputSchema,
    TArgs extends Record<string, unknown> | unknown[] = Record<string, unknown>,
    TResult = unknown,
    TName extends string = string,
  >(
    tool: ModelContextTool<TArgs, TResult, TName> & {
      inputSchema: TInputSchema;
    } & (TInputSchema extends InputSchema
        ? string extends TInputSchema['type']
          ? unknown
          : never
        : unknown),
    options?: ModelContextRegisterToolOptions
  ): Promise<void>;

  /**
   * Registers a dynamic tool without an explicit inputSchema.
   * Runtime defaults this to an empty object schema.
   */
  registerTool<
    TArgs extends Record<string, unknown> | unknown[] = Record<string, unknown>,
    TResult = unknown,
    TName extends string = string,
  >(
    tool: Omit<ModelContextTool<TArgs, TResult, TName>, 'inputSchema'> & {
      inputSchema?: undefined;
    },
    options?: ModelContextRegisterToolOptions
  ): Promise<void>;

  /**
   * Lists same-origin tools and tools exposed by requested descendant origins.
   */
  getTools(options?: ModelContextGetToolOptions): Promise<RegisteredTool[]>;

  /**
   * Handler invoked when the producer tool list changes.
   */
  ontoolchange: ((this: ModelContextCore, ev: Event) => unknown) | null;
}

/**
 * MCPB extension surface layered on top of strict WebMCP core.
 * These members are intentionally non-standard.
 */
export interface ModelContextExtensions {
  /**
   * Registers a tool with MCP-B output metadata and per-call client support.
   *
   * This overload replaces the strict browser callback on the composed
   * {@link ModelContextWithExtensions} surface.
   */
  registerTool<
    TInputSchema extends JsonSchemaForInference,
    TOutputSchema extends JsonSchemaForInference | undefined = undefined,
    TName extends string = string,
  >(
    tool: ToolDescriptorFromSchema<TInputSchema, TOutputSchema, TName>,
    options?: ModelContextRegisterToolOptions
  ): Promise<void>;

  registerTool<
    TInputSchema extends InputSchema,
    TArgs extends Record<string, unknown> = Record<string, unknown>,
    TName extends string = string,
  >(
    tool: ToolDescriptor<TArgs, ToolRawResult, TName> & {
      inputSchema: TInputSchema;
    } & (TInputSchema extends InputSchema
        ? string extends TInputSchema['type']
          ? unknown
          : never
        : unknown),
    options?: ModelContextRegisterToolOptions
  ): Promise<void>;

  registerTool<
    TArgs extends Record<string, unknown> = Record<string, unknown>,
    TName extends string = string,
  >(
    tool: Omit<ToolDescriptor<TArgs, ToolRawResult, TName>, 'inputSchema'> & {
      inputSchema?: undefined;
    },
    options?: ModelContextRegisterToolOptions
  ): Promise<void>;

  /**
   * Unregisters a dynamic tool by name or tool reference.
   *
   * @deprecated Removed from the WebMCP spec on April 23, 2026. Use `registerTool(tool, { signal })`. Will be removed in the next major.
   */
  unregisterTool(nameOrTool: string | ModelContextToolReference): void;

  /**
   * Lists currently registered tools.
   */
  listTools(): ToolListItem[];

  // ==================== EVENTS ====================

  /**
   * Adds a listener for tool list changes.
   */
  addEventListener(
    type: 'toolchange',
    listener: () => void,
    options?: boolean | AddEventListenerOptions
  ): void;

  /**
   * Removes a listener for tool list changes.
   */
  removeEventListener(
    type: 'toolchange',
    listener: () => void,
    options?: boolean | EventListenerOptions
  ): void;

  /**
   * Dispatches an event.
   */
  dispatchEvent(event: Event): boolean;
}

/**
 * Public document.modelContext type (strict core only).
 */
export type ModelContext = ModelContextCore;

/**
 * Strict WebMCP core with feature-detectable Chromium preview additions.
 */
export type ChromeModelContext = ModelContextCore & ChromeModelContextExtensions;

/**
 * Full runtime shape including MCPB extensions.
 */
export type ModelContextWithExtensions = Omit<ModelContextCore, 'registerTool'> &
  ModelContextExtensions;
