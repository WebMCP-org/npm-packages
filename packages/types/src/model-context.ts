import type {
  CallToolResult,
  ImageContent,
  InputSchema,
  JsonObject,
  RegistrationHandle,
  TextContent,
  ToolResponse,
} from './common.js';
import type { ToolDescriptor, ToolListItem } from './tool.js';

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
// Sampling and Elicitation
// ============================================================================

/**
 * Model preference hints for `createMessage`.
 */
export interface ModelPreferences {
  /**
   * Optional model hints.
   */
  hints?: Array<{ name?: string }>;

  /**
   * Relative cost weighting.
   */
  costPriority?: number;

  /**
   * Relative speed weighting.
   */
  speedPriority?: number;

  /**
   * Relative quality weighting.
   */
  intelligencePriority?: number;
}

/**
 * Single message for sampling requests.
 */
export interface SamplingRequestMessage {
  /**
   * Message author role.
   */
  role: 'user' | 'assistant';

  /**
   * Message payload.
   */
  content: TextContent | ImageContent | Array<TextContent | ImageContent>;
}

/**
 * Parameters for `modelContext.createMessage`.
 */
export interface SamplingRequestParams {
  /**
   * Conversation history for the model.
   */
  messages: SamplingRequestMessage[];

  /**
   * Optional system instructions.
   */
  systemPrompt?: string;

  /**
   * Maximum tokens to generate.
   */
  maxTokens: number;

  /**
   * Optional temperature.
   */
  temperature?: number;

  /**
   * Optional stop sequences.
   */
  stopSequences?: string[];

  /**
   * Optional model preference hints.
   */
  modelPreferences?: ModelPreferences;

  /**
   * Optional context inclusion strategy.
   */
  includeContext?: 'none' | 'thisServer' | 'allServers';

  /**
   * Optional metadata.
   */
  metadata?: JsonObject;
}

/**
 * Result returned by `modelContext.createMessage`.
 */
export interface SamplingResult {
  /**
   * Model identifier used for generation.
   */
  model: string;

  /**
   * Generated response content.
   */
  content: TextContent | ImageContent;

  /**
   * Response role.
   */
  role: 'user' | 'assistant';

  /**
   * Optional generation stop reason.
   */
  stopReason?: 'endTurn' | 'stopSequence' | 'maxTokens' | string;
}

/**
 * Form-based elicitation request parameters.
 */
export interface ElicitationFormParams {
  /**
   * Elicitation mode. Omit or set to `'form'` for form input.
   */
  mode?: 'form';

  /**
   * User-facing message.
   */
  message: string;

  /**
   * Requested form schema.
   */
  requestedSchema: {
    /**
     * Root schema type.
     */
    type: 'object';

    /**
     * Field definitions.
     */
    properties: Record<string, InputSchema>;

    /**
     * Required field names.
     */
    required?: string[];

    /**
     * Additional schema keywords.
     */
    [key: string]: unknown;
  };
}

/**
 * URL-based elicitation request parameters.
 */
export interface ElicitationUrlParams {
  /**
   * Elicitation mode.
   */
  mode: 'url';

  /**
   * User-facing message.
   */
  message: string;

  /**
   * Unique elicitation identifier.
   */
  elicitationId: string;

  /**
   * URL to open.
   */
  url: string;
}

/**
 * Elicitation request parameters.
 */
export type ElicitationParams = ElicitationFormParams | ElicitationUrlParams;

/**
 * Result returned by `modelContext.elicitInput`.
 */
export interface ElicitationResult {
  /**
   * User decision.
   */
  action: 'accept' | 'decline' | 'cancel';

  /**
   * Submitted values when `action` is `'accept'`.
   */
  content?: Record<string, string | number | boolean | string[]>;
}

// ============================================================================
// Model Context
// ============================================================================

/**
 * ModelContext interface on navigator.modelContext.
 * Implements the W3C Web Model Context API proposal.
 */
export interface ModelContext {
  // ==================== CONTEXT ====================

  /**
   * Replaces base context with provided tools.
   */
  provideContext(context: ModelContextInput): void;

  // ==================== TOOLS ====================

  /**
   * Registers a dynamic tool.
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

  // ==================== SAMPLING ====================

  /**
   * Requests model sampling from the connected client.
   */
  createMessage(params: SamplingRequestParams): Promise<SamplingResult>;

  // ==================== ELICITATION ====================

  /**
   * Requests user input from the connected client.
   */
  elicitInput(params: ElicitationParams): Promise<ElicitationResult>;

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
