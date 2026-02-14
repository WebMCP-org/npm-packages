import type { CallToolResult, InputSchema, ToolResponse } from './common.js';
import type { JsonSchemaForInference, JsonSchemaObject } from './json-schema.js';
import type { ToolDescriptor, ToolDescriptorFromSchema, ToolListItem } from './tool.js';

// ============================================================================
// Model Context Input
// ============================================================================

/**
 * Context provided to models via provideContext().
 */
export interface ModelContextInput<TTools extends readonly ToolDescriptor[] = ToolDescriptor[]> {
  /**
   * Base tool descriptors to expose.
   */
  tools?: TTools;
}

/**
 * Public options accepted by provideContext().
 */
export type ModelContextOptions = ModelContextInput;

// ============================================================================
// Model Context Testing
// ============================================================================

/**
 * Tool info returned by ModelContextTesting.listTools().
 */
export interface ModelContextTestingToolInfo {
  name: string;
  description: string;
  inputSchema?: string;
}

/**
 * Options supported by ModelContextTesting.executeTool().
 */
export interface ModelContextTestingExecuteToolOptions {
  signal?: AbortSignal;
}

/**
 * Chromium early-preview testing API on navigator.modelContextTesting.
 */
export interface ModelContextTesting {
  listTools(): ModelContextTestingToolInfo[];
  executeTool(
    toolName: string,
    inputArgsJson: string,
    options?: ModelContextTestingExecuteToolOptions
  ): Promise<string | null>;
  registerToolsChangedCallback(callback: () => void): void;
  getCrossDocumentScriptToolResult(): Promise<string>;
}

/**
 * Polyfill-only testing extensions layered on top of ModelContextTesting.
 */
export interface ModelContextTestingPolyfillExtensions {
  getToolCalls(): Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    timestamp: number;
  }>;
  clearToolCalls(): void;
  setMockToolResponse(toolName: string, response: ToolResponse): void;
  clearMockToolResponse(toolName: string): void;
  clearAllMockToolResponses(): void;
  getRegisteredTools(): ReturnType<ModelContextExtensions['listTools']>;
  reset(): void;
}

// ============================================================================
// Type Inference Helpers
// ============================================================================

/**
 * Any supported tool descriptor.
 *
 * Uses `never` for args so descriptors with stricter argument objects remain assignable.
 */
export type AnyToolDescriptor = ToolDescriptor<never, CallToolResult, string>;

/**
 * Infers argument shape from a tool descriptor.
 */
export type InferToolArgs<TTool> = TTool extends ToolDescriptor<
  infer TArgs,
  infer _TResult,
  infer _TName
>
  ? TArgs
  : never;

/**
 * Infers result shape from a tool descriptor.
 */
export type InferToolResult<TTool> = TTool extends ToolDescriptor<
  infer _TArgs,
  infer TResult,
  infer _TName
>
  ? TResult
  : never;

/**
 * Union of tool names from a tuple/array of descriptors.
 */
export type ToolName<TTools extends readonly { name: string }[]> = TTools[number]['name'];

/**
 * Extracts a tool descriptor by name from a tuple/array.
 */
export type ToolByName<
  TTools extends readonly { name: string }[],
  TName extends ToolName<TTools>,
> = Extract<TTools[number], { name: TName }>;

/**
 * Tool argument type by tool name from a tuple/array.
 */
export type ToolArgsByName<
  TTools extends readonly { name: string }[],
  TName extends ToolName<TTools>,
> = InferToolArgs<ToolByName<TTools, TName>>;

/**
 * Tool result type by tool name from a tuple/array.
 */
export type ToolResultByName<
  TTools extends readonly { name: string }[],
  TName extends ToolName<TTools>,
> = InferToolResult<ToolByName<TTools, TName>>;

/**
 * Typed parameters for `callTool`.
 *
 * When a tool has no args (`Record<string, never>`), `arguments` becomes optional.
 */
export type ToolCallParams<
  TName extends string = string,
  TArgs extends Record<string, unknown> = Record<string, never>,
> = { name: TName } & (TArgs extends Record<string, never>
  ? { arguments?: TArgs }
  : { arguments: TArgs });

// ============================================================================
// Tool Call Event
// ============================================================================

/**
 * Event dispatched when a tool is called.
 */
export interface ToolCallEvent extends Event {
  /**
   * Tool name being invoked.
   */
  name: string;

  /**
   * Tool arguments supplied by the caller.
   */
  arguments: Record<string, unknown>;

  /**
   * Intercepts execution with a custom tool response.
   */
  respondWith: (response: ToolResponse) => void;
}

// ============================================================================
// Model Context
// ============================================================================

/**
 * Strict WebMCP core interface on navigator.modelContext.
 */
export interface ModelContextCore {
  // ==================== CONTEXT ====================

  /**
   * Replaces base context with provided tools.
   */
  provideContext(options?: ModelContextOptions): void;

  // ==================== TOOLS ====================

  /**
   * Registers a dynamic tool with JSON Schema-driven inference.
   *
   * `execute(args)` is inferred from `inputSchema`, and when a literal object
   * `outputSchema` is provided, `execute(...).structuredContent` is inferred too.
   */
  registerTool<
    TInputSchema extends JsonSchemaForInference,
    TOutputSchema extends JsonSchemaObject | undefined = undefined,
    TName extends string = string,
  >(tool: ToolDescriptorFromSchema<TInputSchema, TOutputSchema, TName>): void;

  /**
   * Registers a dynamic tool with explicitly typed args/result.
   */
  registerTool<
    TInputSchema extends InputSchema,
    TArgs extends Record<string, unknown> = Record<string, unknown>,
    TResult extends CallToolResult = CallToolResult,
    TName extends string = string,
  >(
    tool: ToolDescriptor<TArgs, TResult, TName> & {
      inputSchema: TInputSchema;
    } & (string extends TInputSchema['type'] ? unknown : never)
  ): void;

  /**
   * Registers a dynamic tool without an explicit inputSchema.
   * Runtime defaults this to an empty object schema.
   */
  registerTool<
    TArgs extends Record<string, unknown> = Record<string, unknown>,
    TResult extends CallToolResult = CallToolResult,
    TName extends string = string,
  >(
    tool: Omit<ToolDescriptor<TArgs, TResult, TName>, 'inputSchema'> & {
      inputSchema?: undefined;
    }
  ): void;

  /**
   * Unregisters a dynamic tool by name.
   */
  unregisterTool(name: string): void;

  /**
   * Clears all context (base + dynamic registrations).
   */
  clearContext(): void;
}

/**
 * MCPB extension surface layered on top of strict WebMCP core.
 * These members are intentionally non-standard.
 */
export interface ModelContextExtensions {
  /**
   * Lists currently registered tools.
   */
  listTools(): ToolListItem[];

  /**
   * Executes a registered tool.
   */
  callTool<
    TName extends string = string,
    TArgs extends Record<string, unknown> = Record<string, unknown>,
  >(params: { name: TName; arguments?: TArgs }): Promise<ToolResponse>;

  // ==================== EVENTS ====================

  /**
   * Adds a listener for tool invocation events.
   */
  addEventListener(
    type: 'toolcall',
    listener: (event: ToolCallEvent) => void | Promise<void>,
    options?: boolean | AddEventListenerOptions
  ): void;

  /**
   * Adds a listener for tool list changes.
   */
  addEventListener(
    type: 'toolschanged',
    listener: () => void,
    options?: boolean | AddEventListenerOptions
  ): void;

  /**
   * Removes a listener for tool invocation events.
   */
  removeEventListener(
    type: 'toolcall',
    listener: (event: ToolCallEvent) => void | Promise<void>,
    options?: boolean | EventListenerOptions
  ): void;

  /**
   * Removes a listener for tool list changes.
   */
  removeEventListener(
    type: 'toolschanged',
    listener: () => void,
    options?: boolean | EventListenerOptions
  ): void;

  /**
   * Dispatches an event.
   */
  dispatchEvent(event: Event): boolean;
}

/**
 * Public navigator.modelContext type (strict core only).
 */
export type ModelContext = ModelContextCore;

/**
 * Full runtime shape including MCPB extensions.
 */
export type ModelContextWithExtensions = ModelContextCore & ModelContextExtensions;

// ============================================================================
// Typed Model Context
// ============================================================================

/**
 * Strongly-typed `ModelContext` view derived from known tool descriptors.
 *
 * This is useful when your project has a static tool registry and you want
 * name-aware inference for `callTool`.
 */
export type TypedModelContext<
  TTools extends readonly { name: string }[] = readonly ToolDescriptor[],
> = ModelContextWithExtensions & {
  /**
   * Executes a known tool with name-aware argument and response inference.
   */
  callTool<TName extends ToolName<TTools>>(
    params: ToolCallParams<TName, ToolArgsByName<TTools, TName>>
  ): Promise<ToolResultByName<TTools, TName>>;

  /**
   * Fallback call signature for unknown or dynamically-discovered tools.
   */
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<ToolResponse>;

  /**
   * Lists tools with a narrowed name union.
   */
  listTools(): Array<ToolListItem<ToolName<TTools>>>;
};
