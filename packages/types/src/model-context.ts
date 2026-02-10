import type { CallToolResult, RegistrationHandle, ToolResponse } from './common.js';
import type { JsonSchemaForInference } from './json-schema.js';
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
 * ModelContext interface on navigator.modelContext.
 */
export interface ModelContext {
  // ==================== CONTEXT ====================

  /**
   * Replaces base context with provided tools.
   */
  provideContext(context: ModelContextInput): void;

  // ==================== TOOLS ====================

  /**
   * Registers a dynamic tool with args inferred from `inputSchema`.
   */
  registerTool<
    TInputSchema extends JsonSchemaForInference,
    TResult extends CallToolResult = CallToolResult,
    TName extends string = string,
  >(tool: ToolDescriptorFromSchema<TInputSchema, TResult, TName>): RegistrationHandle;

  /**
   * Registers a dynamic tool with explicitly typed args/result.
   */
  registerTool<
    TArgs extends Record<string, unknown> = Record<string, unknown>,
    TResult extends CallToolResult = CallToolResult,
    TName extends string = string,
  >(tool: ToolDescriptor<TArgs, TResult, TName>): RegistrationHandle;

  /**
   * Unregisters a dynamic tool by name.
   */
  unregisterTool(name: string): void;

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

  // ==================== GENERAL ====================

  /**
   * Clears all context (base + dynamic registrations).
   */
  clearContext(): void;

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
> = ModelContext & {
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
