import type { IframeChildTransportOptions, TabServerTransportOptions } from '@mcp-b/transports';
import type {
  CallToolResult,
  CreateMessageRequest,
  CreateMessageResult,
  ElicitRequest,
  ElicitResult,
  Server as McpServer,
  Prompt,
  PromptMessage,
  Resource,
  ResourceContents,
  ResourceTemplate,
  ToolAnnotations,
  Transport,
} from '@mcp-b/webmcp-ts-sdk';
import type { z } from 'zod/v4';

// ============================================================================
// MCP SDK Type Re-exports
// ============================================================================
// Re-export MCP SDK types for consumer convenience. These are the canonical
// types from the Model Context Protocol specification.

/**
 * Re-export Resource type from MCP SDK.
 * Represents a resource that can be read by AI models.
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/resources/}
 */
export type { Resource };

/**
 * Re-export ResourceContents type from MCP SDK.
 * Represents the contents returned when reading a resource.
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/resources/}
 */
export type { ResourceContents };

/**
 * Re-export ResourceTemplate type from MCP SDK.
 * Represents a URI template for dynamic resources.
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/resources/}
 */
export type { ResourceTemplate };

/**
 * Re-export Prompt type from MCP SDK.
 * Represents a reusable prompt template.
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/prompts/}
 */
export type { Prompt };

/**
 * Re-export PromptMessage type from MCP SDK.
 * Represents a message within a prompt.
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/prompts/}
 */
export type { PromptMessage };

/**
 * Re-export CreateMessageRequest type from MCP SDK.
 * Represents a request for LLM sampling from server to client.
 * @see {@link https://spec.modelcontextprotocol.io/specification/client/sampling/}
 */
export type { CreateMessageRequest };

/**
 * Re-export CreateMessageResult type from MCP SDK.
 * Represents the result of an LLM sampling request.
 * @see {@link https://spec.modelcontextprotocol.io/specification/client/sampling/}
 */
export type { CreateMessageResult };

/**
 * Re-export ElicitRequest type from MCP SDK.
 * Represents a request for user input from server to client.
 * @see {@link https://spec.modelcontextprotocol.io/specification/client/elicitation/}
 */
export type { ElicitRequest };

/**
 * Re-export ElicitResult type from MCP SDK.
 * Represents the result of an elicitation request.
 * @see {@link https://spec.modelcontextprotocol.io/specification/client/elicitation/}
 */
export type { ElicitResult };

// ============================================================================
// Schema Types
// ============================================================================

/**
 * JSON Schema definition for tool/prompt input parameters.
 *
 * This interface represents a JSON Schema object as defined by the JSON Schema
 * specification. It's used for defining tool input schemas and prompt argument
 * schemas when not using Zod.
 *
 * @see {@link https://json-schema.org/}
 *
 * @example
 * ```typescript
 * const schema: InputSchema = {
 *   type: 'object',
 *   properties: {
 *     query: { type: 'string', description: 'Search query' },
 *     limit: { type: 'number', description: 'Max results' }
 *   },
 *   required: ['query']
 * };
 * ```
 */
export interface InputSchema {
  /** The JSON Schema type (typically "object" for tool inputs) */
  type: string;
  /** Property definitions for object schemas */
  properties?: Record<
    string,
    {
      /** The property type */
      type: string;
      /** Human-readable description of the property */
      description?: string;
      /** Additional JSON Schema keywords */
      [key: string]: unknown;
    }
  >;
  /** Array of required property names */
  required?: string[];
  /** Additional JSON Schema keywords */
  [key: string]: unknown;
}

/**
 * Zod schema object type for type-safe tool and prompt definitions.
 *
 * When using Zod schemas instead of JSON Schema, define your schema as an object
 * where keys are parameter names and values are Zod type definitions.
 *
 * @example
 * ```typescript
 * import { z } from 'zod/v4';
 *
 * const mySchema: ZodSchemaObject = {
 *   query: z.string().describe('Search query'),
 *   limit: z.number().optional().describe('Max results')
 * };
 * ```
 */
export type ZodSchemaObject = Record<string, z.ZodTypeAny>;

/**
 * Re-export ToolAnnotations from MCP SDK.
 * Provides hints about tool behavior (e.g., destructive, idempotent).
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/tools/}
 */
export type { ToolAnnotations };

/**
 * Re-export CallToolResult from MCP SDK.
 * The result returned from tool execution.
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/tools/}
 */
export type { CallToolResult };

/**
 * Tool response format for the Web Model Context API.
 * This is an alias for MCP SDK's CallToolResult for API consistency.
 * @see {@link CallToolResult}
 */
export type ToolResponse = CallToolResult;

// ============================================================================
// Navigation Metadata Types
// ============================================================================

/**
 * Metadata for tools that trigger page navigation.
 *
 * When a tool needs to navigate the page (e.g., to a different URL), it must include
 * this metadata in its response to signal the navigation intent to the client. This
 * allows the client to distinguish between successful navigation and interrupted execution.
 *
 * **CRITICAL PATTERN**: Tools MUST return their response BEFORE triggering navigation.
 * Use `setTimeout()` with a minimum 100ms delay to ensure the response is transmitted
 * via `postMessage` and received by the client before the page unloads.
 *
 * **Why the pattern is necessary**: During page navigation, the JavaScript context
 * is destroyed. If navigation occurs before the response is sent, the client will
 * never receive the tool's result and cannot distinguish success from failure.
 *
 * @example Correct pattern - Response before navigation
 * ```typescript
 * navigator.modelContext.registerTool({
 *   name: 'navigate_to_docs',
 *   description: 'Navigate to documentation page',
 *   inputSchema: { section: z.string() },
 *   async execute(args) {
 *     const url = `https://docs.example.com/${args.section}`;
 *
 *     // 1. Prepare response with navigation metadata
 *     const response = {
 *       content: [{ type: 'text', text: `Navigating to ${url}` }],
 *       metadata: {
 *         willNavigate: true,
 *         navigationUrl: url,
 *         navigationTiming: 'immediate',
 *       },
 *     };
 *
 *     // 2. Schedule navigation AFTER response is returned (100ms minimum)
 *     setTimeout(() => {
 *       window.location.href = url;
 *     }, 100);
 *
 *     // 3. Return response BEFORE navigation occurs
 *     return response;
 *   },
 * });
 * ```
 *
 * @example Anti-pattern - Navigation before response (DO NOT DO THIS)
 * ```typescript
 * // ❌ WRONG - Response will be lost during navigation
 * async execute(args) {
 *   window.location.href = computeUrl(args); // Navigation happens first
 *   return { content: [...] }; // This response is never received!
 * }
 * ```
 *
 * @see {@link InterruptionMetadata} for metadata added when navigation interrupts execution
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage} for postMessage timing
 */
export interface NavigationMetadata {
  /**
   * Indicates this tool will trigger page navigation.
   * This flag signals to the client that the tool succeeded and navigation is expected.
   */
  willNavigate: true;

  /**
   * The URL the page will navigate to (if known).
   * Helps clients track navigation targets.
   */
  navigationUrl?: string;

  /**
   * When navigation will occur relative to the response.
   * - 'immediate': Navigation scheduled immediately after return (within ~100ms)
   * - 'delayed': Navigation will occur after some delay (see navigationDelayMs)
   * @default 'immediate'
   */
  navigationTiming?: 'immediate' | 'delayed';

  /**
   * Expected delay in milliseconds before navigation (if timing='delayed').
   * Only meaningful when navigationTiming is 'delayed'.
   */
  navigationDelayMs?: number;
}

/**
 * Metadata indicating a tool call was interrupted by page navigation.
 *
 * This metadata is automatically added by the transport layer (`TabServerTransport`)
 * when a page navigation occurs while a tool is executing. The transport layer's
 * `beforeunload` event handler detects the navigation and sends an interrupted
 * response for any pending tool calls.
 *
 * **When this occurs**:
 * - User clicks browser back/forward buttons during tool execution
 * - User manually navigates to a different URL
 * - Tool triggers immediate navigation without following the response-first pattern
 * - Page is reloaded or closed during tool execution
 *
 * **How to distinguish from successful navigation**:
 * - Tool succeeded and navigated: Response includes `NavigationMetadata` with `willNavigate: true`
 * - Tool was interrupted: Response includes `InterruptionMetadata` with `navigationInterrupted: true`
 *
 * **Client handling**:
 * ```typescript
 * const response = await client.callTool('my_tool', args);
 *
 * if (response.metadata?.willNavigate) {
 *   // Tool succeeded and will navigate - expected behavior
 *   console.log('Tool navigated successfully');
 * } else if (response.metadata?.navigationInterrupted) {
 *   // Tool was interrupted - may not have completed
 *   console.warn('Tool execution interrupted by navigation');
 * } else {
 *   // Normal tool response - no navigation
 *   console.log('Tool completed normally');
 * }
 * ```
 *
 * @see {@link NavigationMetadata} for metadata indicating intentional navigation
 * @see {@link TabServerTransport._handleBeforeUnload} for the implementation
 * @internal This metadata is added automatically by the transport layer
 */
export interface InterruptionMetadata {
  /**
   * Indicates the tool execution was interrupted by page navigation.
   * When `true`, the tool may not have completed its operation successfully.
   */
  navigationInterrupted: true;

  /**
   * The original JSON-RPC method that was interrupted.
   * Typically `'tools/call'` for tool invocations, but could be other MCP methods.
   *
   * @example 'tools/call' | 'resources/read' | 'prompts/get'
   */
  originalMethod: string;

  /**
   * Unix timestamp (milliseconds since epoch) when the interruption was detected.
   * Useful for logging, debugging, and understanding the timeline of events.
   *
   * @example 1704067200000 (January 1, 2024, 00:00:00 UTC)
   */
  timestamp: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Transport configuration for initializing the Web Model Context polyfill.
 *
 * The polyfill supports multiple transport modes:
 * - **Custom transport**: Provide your own MCP transport implementation
 * - **Tab server**: Same-window communication via postMessage
 * - **Iframe server**: Parent-child iframe communication
 *
 * @example Custom transport
 * ```typescript
 * const config: TransportConfiguration = {
 *   create: () => new MyCustomTransport()
 * };
 * ```
 *
 * @example Configure allowed origins
 * ```typescript
 * const config: TransportConfiguration = {
 *   tabServer: { allowedOrigins: ['https://example.com'] },
 *   iframeServer: false // disable iframe server
 * };
 * ```
 */
export interface TransportConfiguration {
  /**
   * Provide a custom transport factory.
   * When set, tabServer and iframeServer options are ignored.
   */
  create?: () => Transport;

  /**
   * Options passed to the built-in TabServerTransport when no custom factory is provided.
   * Set to `false` to disable the tab server.
   * @default { allowedOrigins: ['*'] }
   */
  tabServer?: Partial<TabServerTransportOptions> | false;

  /**
   * Options passed to the built-in IframeChildTransport when no custom factory is provided.
   * Set to `false` to disable the iframe server.
   * @default Auto-enabled when `window.parent !== window`
   */
  iframeServer?: Partial<IframeChildTransportOptions> | false;
}

/**
 * Initialization options for the Web Model Context polyfill.
 *
 * @example
 * ```typescript
 * initializeWebModelContext({
 *   autoInitialize: true,
 *   transport: {
 *     tabServer: { allowedOrigins: ['https://trusted.com'] }
 *   }
 * });
 * ```
 */
export interface WebModelContextInitOptions {
  /**
   * Configure the transport used to expose the MCP server in the browser.
   */
  transport?: TransportConfiguration;

  /**
   * When set to `false`, automatic initialization on module load is skipped.
   * Useful when you need to configure options before initialization.
   * @default true
   */
  autoInitialize?: boolean;
}

// ============================================================================
// Tool Types
// ============================================================================

/**
 * Tool descriptor for the Web Model Context API.
 *
 * Tools are functions that AI models can call to perform actions or retrieve
 * information. This interface supports both JSON Schema (Web standard) and
 * Zod schemas (type-safe) for input/output validation.
 *
 * @template TInputSchema - Zod schema object type for input type inference
 * @template TOutputSchema - Zod schema object type for output type inference
 *
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/tools/}
 *
 * @example JSON Schema
 * ```typescript
 * const tool: ToolDescriptor = {
 *   name: 'search',
 *   description: 'Search the web',
 *   inputSchema: {
 *     type: 'object',
 *     properties: { query: { type: 'string' } },
 *     required: ['query']
 *   },
 *   execute: async ({ query }) => ({
 *     content: [{ type: 'text', text: `Results for: ${query}` }]
 *   })
 * };
 * ```
 *
 * @example Zod Schema (type-safe)
 * ```typescript
 * const tool: ToolDescriptor<{ query: z.ZodString }> = {
 *   name: 'search',
 *   description: 'Search the web',
 *   inputSchema: { query: z.string() },
 *   execute: async ({ query }) => ({ // query is typed as string
 *     content: [{ type: 'text', text: `Results for: ${query}` }]
 *   })
 * };
 * ```
 */
export interface ToolDescriptor<
  TInputSchema extends ZodSchemaObject = Record<string, never>,
  TOutputSchema extends ZodSchemaObject = Record<string, never>,
> {
  /**
   * Unique identifier for the tool
   */
  name: string;

  /**
   * Natural language description of what the tool does
   */
  description: string;

  /**
   * Input schema - accepts EITHER:
   * - JSON Schema object (Web standard): { type: "object", properties: {...}, required: [...] }
   * - Zod schema object (type-safe): { text: z.string(), priority: z.enum(...) }
   *
   * When using Zod, TypeScript will infer the execute parameter types automatically
   */
  inputSchema: InputSchema | TInputSchema;

  /**
   * Optional output schema - accepts EITHER:
   * - JSON Schema object (Web standard): { type: "object", properties: {...} }
   * - Zod schema object (type-safe): { result: z.string(), success: z.boolean() }
   */
  outputSchema?: InputSchema | TOutputSchema;

  /**
   * Optional annotations providing hints about tool behavior
   */
  annotations?: ToolAnnotations;

  /**
   * Function that executes the tool logic
   *
   * When using Zod schemas, the args parameter type is automatically inferred from TInputSchema
   * When using JSON Schema, args is Record<string, unknown>
   */
  execute: (
    args: TInputSchema extends Record<string, never>
      ? Record<string, unknown>
      : z.infer<z.ZodObject<TInputSchema>>
  ) => Promise<ToolResponse>;
}

/**
 * Internal validated tool descriptor (used internally by the bridge).
 * Always stores JSON Schema format for MCP protocol compatibility,
 * plus Zod validators for runtime validation.
 * @internal
 */
export interface ValidatedToolDescriptor {
  name: string;
  description: string;
  inputSchema: InputSchema;
  outputSchema?: InputSchema;
  annotations?: ToolAnnotations;
  execute: (args: Record<string, unknown>) => Promise<ToolResponse>;

  /** Zod validator for input arguments (not exposed via MCP) */
  inputValidator: z.ZodType;
  /** Zod validator for output (not exposed via MCP) */
  outputValidator?: z.ZodType;
}

// ============================================================================
// Resource Types
// ============================================================================

/**
 * Resource descriptor for Web Model Context API
 * Defines a resource that can be read by AI models
 *
 * Resources can be:
 * - Static: Fixed URI like "config://app-settings"
 * - Dynamic: URI template like "file://{path}" where {path} is a parameter
 *
 * @example Static resource
 * ```typescript
 * const configResource: ResourceDescriptor = {
 *   uri: 'config://app-settings',
 *   name: 'App Settings',
 *   description: 'Application configuration',
 *   mimeType: 'application/json',
 *   read: async (uri) => ({
 *     contents: [{ uri: uri.href, text: JSON.stringify(config) }]
 *   })
 * };
 * ```
 *
 * @example Dynamic resource with URI template
 * ```typescript
 * const fileResource: ResourceDescriptor = {
 *   uri: 'file://{path}',
 *   name: 'File Reader',
 *   description: 'Read files from the virtual filesystem',
 *   read: async (uri, params) => ({
 *     contents: [{ uri: uri.href, text: await readFile(params?.path ?? '') }]
 *   })
 * };
 * ```
 */
export interface ResourceDescriptor {
  /**
   * The resource URI or URI template
   * - Static: "config://app-settings"
   * - Template: "file://{path}" where {path} becomes a parameter
   */
  uri: string;

  /**
   * Human-readable name for the resource
   */
  name: string;

  /**
   * Optional description of what the resource provides
   */
  description?: string;

  /**
   * Optional MIME type of the resource content
   */
  mimeType?: string;

  /**
   * Function that reads and returns the resource content
   *
   * @param uri - The resolved URI being requested
   * @param params - Parameters extracted from URI template (if applicable)
   * @returns Resource contents with the data
   */
  read: (uri: URL, params?: Record<string, string>) => Promise<{ contents: ResourceContents[] }>;
}

/**
 * Internal validated resource descriptor (used internally by the bridge).
 * @internal
 */
export interface ValidatedResourceDescriptor {
  uri: string;
  name: string;
  description: string | undefined;
  mimeType: string | undefined;
  read: (uri: URL, params?: Record<string, string>) => Promise<{ contents: ResourceContents[] }>;

  /** Whether this is a URI template (contains {param} placeholders) */
  isTemplate: boolean;

  /** Parameter names extracted from URI template (e.g., ['path'] for 'file://{path}') */
  templateParams: string[];
}

// ============================================================================
// Prompt Types
// ============================================================================

/**
 * Prompt descriptor for Web Model Context API
 * Defines a reusable prompt template for AI interactions
 *
 * Prompts help users interact with AI models by providing
 * pre-defined message templates. They can accept arguments
 * to customize the prompt dynamically.
 *
 * @template TArgsSchema - If using Zod, the schema object type for argument inference
 *
 * @example Simple prompt without arguments
 * ```typescript
 * const helpPrompt: PromptDescriptor = {
 *   name: 'help',
 *   description: 'Get help with using the application',
 *   get: async () => ({
 *     messages: [{
 *       role: 'user',
 *       content: { type: 'text', text: 'How do I use this application?' }
 *     }]
 *   })
 * };
 * ```
 *
 * @example Prompt with typed arguments
 * ```typescript
 * const reviewPrompt: PromptDescriptor<{ code: z.ZodString }> = {
 *   name: 'review-code',
 *   description: 'Review code for best practices',
 *   argsSchema: { code: z.string() },
 *   get: async ({ code }) => ({
 *     messages: [{
 *       role: 'user',
 *       content: { type: 'text', text: `Please review this code:\n\n${code}` }
 *     }]
 *   })
 * };
 * ```
 */
export interface PromptDescriptor<TArgsSchema extends ZodSchemaObject = Record<string, never>> {
  /**
   * Unique identifier for the prompt
   */
  name: string;

  /**
   * Optional description of what the prompt does
   */
  description?: string;

  /**
   * Optional schema for prompt arguments
   * Accepts EITHER:
   * - JSON Schema object: { type: "object", properties: {...} }
   * - Zod schema object: { code: z.string(), language: z.enum([...]) }
   */
  argsSchema?: InputSchema | TArgsSchema;

  /**
   * Function that generates prompt messages
   *
   * @param args - Arguments matching the argsSchema (if defined)
   * @returns Object containing the prompt messages
   */
  get: (
    args: TArgsSchema extends Record<string, never>
      ? Record<string, unknown>
      : z.infer<z.ZodObject<TArgsSchema>>
  ) => Promise<{ messages: PromptMessage[] }>;
}

/**
 * Internal validated prompt descriptor (used internally by the bridge).
 * @internal
 */
export interface ValidatedPromptDescriptor {
  name: string;
  description: string | undefined;
  argsSchema: InputSchema | undefined;
  get: (args: Record<string, unknown>) => Promise<{ messages: PromptMessage[] }>;

  /** Zod validator for arguments (not exposed via MCP) */
  argsValidator: z.ZodType | undefined;
}

// ============================================================================
// Return Types (for API cleanliness)
// ============================================================================

/**
 * Tool information returned by listTools().
 * Provides metadata about a registered tool without exposing the execute function.
 */
export interface ToolListItem {
  /** Unique identifier for the tool */
  name: string;
  /** Natural language description of what the tool does */
  description: string;
  /** JSON Schema for tool input parameters */
  inputSchema: InputSchema;
  /** Optional JSON Schema for tool output */
  outputSchema?: InputSchema;
  /** Optional annotations providing hints about tool behavior */
  annotations?: ToolAnnotations;
}

/**
 * Resource template information returned by listResourceTemplates().
 * Describes a dynamic resource with URI template parameters.
 */
export interface ResourceTemplateInfo {
  /** The URI template (e.g., 'file://{path}') */
  uriTemplate: string;
  /** Human-readable name for the resource */
  name: string;
  /** Optional description of what the resource provides */
  description?: string;
  /** Optional MIME type of the resource content */
  mimeType?: string;
}

/**
 * Registration handle returned by registerTool, registerResource, registerPrompt.
 * Provides a method to unregister the item.
 */
export interface RegistrationHandle {
  /** Unregister the item, removing it from the context */
  unregister: () => void;
}

// ============================================================================
// Sampling and Elicitation Types
// ============================================================================

/**
 * Parameters for a sampling request from the server.
 * Extracted from CreateMessageRequest for handler convenience.
 */
export interface SamplingRequestParams {
  /** Messages to send to the LLM */
  messages: Array<{
    role: 'user' | 'assistant';
    content:
      | { type: 'text'; text: string }
      | { type: 'image'; data: string; mimeType: string }
      | Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  }>;
  /** Optional system prompt */
  systemPrompt?: string | undefined;
  /** Maximum tokens to generate */
  maxTokens: number;
  /** Optional temperature for sampling */
  temperature?: number | undefined;
  /** Optional stop sequences */
  stopSequences?: string[] | undefined;
  /** Optional model preferences */
  modelPreferences?:
    | {
        hints?: Array<{ name?: string }>;
        costPriority?: number;
        speedPriority?: number;
        intelligencePriority?: number;
      }
    | undefined;
  /** Optional context inclusion setting */
  includeContext?: 'none' | 'thisServer' | 'allServers' | undefined;
  /** Optional metadata */
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Result of a sampling request.
 * Returned by the sampling handler.
 */
export interface SamplingResult {
  /** The model that generated the response */
  model: string;
  /** The generated content */
  content: { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
  /** Role of the responder */
  role: 'user' | 'assistant';
  /** Reason for stopping generation */
  stopReason?: 'endTurn' | 'stopSequence' | 'maxTokens' | string;
}

/**
 * Parameters for a form elicitation request.
 */
export interface ElicitationFormParams {
  /** Mode of elicitation */
  mode?: 'form';
  /** Message to show to the user */
  message: string;
  /** Schema for the form fields */
  requestedSchema: {
    type: 'object';
    properties: Record<
      string,
      {
        type: 'string' | 'number' | 'integer' | 'boolean';
        title?: string;
        description?: string;
        default?: string | number | boolean;
        minLength?: number;
        maxLength?: number;
        minimum?: number;
        maximum?: number;
        enum?: Array<string | number>;
        enumNames?: string[];
        format?: string;
      }
    >;
    required?: string[];
  };
}

/**
 * Parameters for a URL elicitation request.
 */
export interface ElicitationUrlParams {
  /** Mode of elicitation */
  mode: 'url';
  /** Message explaining why the URL needs to be opened */
  message: string;
  /** Unique identifier for this elicitation */
  elicitationId: string;
  /** URL to open */
  url: string;
}

/**
 * Parameters for an elicitation request.
 * Can be either form-based or URL-based.
 */
export type ElicitationParams = ElicitationFormParams | ElicitationUrlParams;

/**
 * Result of an elicitation request.
 */
export interface ElicitationResult {
  /** User action */
  action: 'accept' | 'decline' | 'cancel';
  /** Content returned when action is 'accept' */
  content?: Record<string, string | number | boolean | string[]>;
}

// ============================================================================
// Model Context Types
// ============================================================================

/**
 * Context provided to models via provideContext().
 * Contains the base set of tools, resources, and prompts (Bucket A).
 */
export interface ModelContextInput {
  /**
   * Array of tool descriptors
   * Supports both JSON Schema and Zod schema formats
   */
  tools?: ToolDescriptor[];

  /**
   * Array of resource descriptors
   * Resources expose data that AI models can read
   */
  resources?: ResourceDescriptor[];

  /**
   * Array of prompt descriptors
   * Prompts provide reusable message templates
   */
  prompts?: PromptDescriptor[];
}

/**
 * Tool call event
 */
export interface ToolCallEvent extends Event {
  /**
   * Name of the tool being called
   */
  name: string;

  /**
   * Arguments passed to the tool
   */
  arguments: Record<string, unknown>;

  /**
   * Respond with a result
   */
  respondWith: (response: ToolResponse) => void;
}

/**
 * ModelContext interface on window.navigator
 * Implements the W3C Web Model Context API proposal
 */
export interface ModelContext {
  /**
   * Provide context (tools, resources, prompts) to AI models
   * Clears base items (Bucket A) and replaces with the provided arrays.
   * Dynamic items (Bucket B) registered via register* methods persist.
   */
  provideContext(context: ModelContextInput): void;

  // ==================== TOOLS ====================

  /**
   * Register a single tool dynamically.
   * Returns a handle to unregister the tool.
   * Supports both JSON Schema and Zod schema formats.
   */
  registerTool<
    TInputSchema extends ZodSchemaObject = Record<string, never>,
    TOutputSchema extends ZodSchemaObject = Record<string, never>,
  >(tool: ToolDescriptor<TInputSchema, TOutputSchema>): RegistrationHandle;

  /**
   * Unregister a tool by name
   * Available in Chromium's native implementation
   */
  unregisterTool(name: string): void;

  /**
   * Get the list of all registered tools.
   * Returns tools from both buckets (provideContext and registerTool).
   */
  listTools(): ToolListItem[];

  // ==================== RESOURCES ====================

  /**
   * Register a single resource dynamically.
   * Returns a handle to unregister the resource.
   */
  registerResource(resource: ResourceDescriptor): RegistrationHandle;

  /**
   * Unregister a resource by URI
   */
  unregisterResource(uri: string): void;

  /**
   * Get the list of all registered resources
   * Returns resources from both buckets (provideContext and registerResource)
   */
  listResources(): Resource[];

  /**
   * Get the list of all resource templates.
   * Returns only resources with URI templates (dynamic resources).
   */
  listResourceTemplates(): ResourceTemplateInfo[];

  // ==================== PROMPTS ====================

  /**
   * Register a single prompt dynamically.
   * Returns a handle to unregister the prompt.
   * Supports both JSON Schema and Zod schema formats for argsSchema.
   */
  registerPrompt<TArgsSchema extends ZodSchemaObject = Record<string, never>>(
    prompt: PromptDescriptor<TArgsSchema>
  ): RegistrationHandle;

  /**
   * Unregister a prompt by name
   */
  unregisterPrompt(name: string): void;

  /**
   * Get the list of all registered prompts
   * Returns prompts from both buckets (provideContext and registerPrompt)
   */
  listPrompts(): Prompt[];

  // ==================== GENERAL ====================

  /**
   * Clear all registered context (tools, resources, prompts from both buckets)
   * Available in Chromium's native implementation
   */
  clearContext(): void;

  // ==================== SAMPLING ====================

  /**
   * Request an LLM completion from the connected client.
   * This allows the server (webpage) to request sampling from the client (AI agent).
   *
   * @param params - Parameters for the sampling request
   * @returns Promise resolving to the LLM completion result
   *
   * @example
   * ```typescript
   * const result = await navigator.modelContext.createMessage({
   *   messages: [
   *     { role: 'user', content: { type: 'text', text: 'What is 2+2?' } }
   *   ],
   *   maxTokens: 100,
   * });
   * console.log(result.content); // { type: 'text', text: '4' }
   * ```
   */
  createMessage(params: SamplingRequestParams): Promise<SamplingResult>;

  // ==================== ELICITATION ====================

  /**
   * Request user input from the connected client.
   * This allows the server (webpage) to request form data or URL navigation from the client.
   *
   * @param params - Parameters for the elicitation request
   * @returns Promise resolving to the user's response
   *
   * @example Form elicitation:
   * ```typescript
   * const result = await navigator.modelContext.elicitInput({
   *   message: 'Please provide your API key',
   *   requestedSchema: {
   *     type: 'object',
   *     properties: {
   *       apiKey: { type: 'string', title: 'API Key', description: 'Your API key' }
   *     },
   *     required: ['apiKey']
   *   }
   * });
   * if (result.action === 'accept') {
   *   console.log(result.content?.apiKey);
   * }
   * ```
   */
  elicitInput(params: ElicitationParams): Promise<ElicitationResult>;

  /**
   * Add event listener for tool calls
   */
  addEventListener(
    type: 'toolcall',
    listener: (event: ToolCallEvent) => void | Promise<void>,
    options?: boolean | AddEventListenerOptions
  ): void;

  /**
   * Remove event listener
   */
  removeEventListener(
    type: 'toolcall',
    listener: (event: ToolCallEvent) => void | Promise<void>,
    options?: boolean | EventListenerOptions
  ): void;

  /**
   * Dispatch an event
   */
  dispatchEvent(event: Event): boolean;
}

// ============================================================================
// Internal/Bridge Types
// ============================================================================

/**
 * Internal ModelContext interface with additional methods for MCP bridge.
 * Not exposed as part of the public Web Model Context API.
 * @internal
 */
export interface InternalModelContext extends ModelContext {
  /**
   * Execute a tool (internal use only by MCP bridge)
   * @internal
   */
  executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResponse>;

  /**
   * Read a resource by URI (internal use only by MCP bridge)
   * @internal
   */
  readResource(uri: string): Promise<{ contents: ResourceContents[] }>;

  /**
   * Get a prompt with arguments (internal use only by MCP bridge)
   * @internal
   */
  getPrompt(name: string, args?: Record<string, unknown>): Promise<{ messages: PromptMessage[] }>;
}

/**
 * Internal MCP Bridge state.
 * Contains the MCP servers and registered context items.
 * @internal
 */
export interface MCPBridge {
  /** The main tab server transport */
  tabServer: McpServer;
  /** Optional iframe server transport */
  iframeServer?: McpServer;
  /** Map of tool name -> validated tool descriptor */
  tools: Map<string, ValidatedToolDescriptor>;
  /** Map of resource URI -> validated resource descriptor */
  resources: Map<string, ValidatedResourceDescriptor>;
  /** Map of prompt name -> validated prompt descriptor */
  prompts: Map<string, ValidatedPromptDescriptor>;
  /** The internal model context instance */
  modelContext: InternalModelContext;
  /** Optional testing API instance */
  modelContextTesting?: ModelContextTesting;
  /** Whether the bridge has been initialized */
  isInitialized: boolean;
}

// ============================================================================
// Testing Types
// ============================================================================

/**
 * Tool info returned by listTools() in the testing API.
 * Note: inputSchema is a JSON string, not an object (matches Chromium implementation).
 */
export interface ToolInfo {
  name: string;
  description: string;
  inputSchema: string;
}

/**
 * Testing API for Model Context
 *
 * **Native Support**: This API is available natively in Chromium-based browsers
 * when the experimental "Model Context Testing" feature flag is enabled.
 *
 * **How to enable in Chromium**:
 * - Navigate to `chrome://flags`
 * - Search for "experimental web platform features" or "model context"
 * - Enable the feature and restart the browser
 * - Or launch with: `--enable-experimental-web-platform-features`
 *
 * **Polyfill**: If the native API is not available, this polyfill provides
 * a compatible implementation for testing purposes.
 */
export interface ModelContextTesting {
  /**
   * Execute a tool directly with JSON string input (Chromium native API)
   * @param toolName - Name of the tool to execute
   * @param inputArgsJson - JSON string of input arguments
   * @returns Promise resolving to the tool's result
   */
  executeTool(toolName: string, inputArgsJson: string): Promise<unknown>;

  /**
   * List all registered tools (Chromium native API)
   * Returns tools with inputSchema as JSON string
   */
  listTools(): ToolInfo[];

  /**
   * Register a callback that fires when the tools list changes (Chromium native API)
   * Callback will fire on: registerTool, unregisterTool, provideContext, clearContext
   */
  registerToolsChangedCallback(callback: () => void): void;

  /**
   * Get all tool calls that have been made (for testing/debugging)
   * Polyfill-specific extension
   */
  getToolCalls(): Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    timestamp: number;
  }>;

  /**
   * Clear the history of tool calls
   * Polyfill-specific extension
   */
  clearToolCalls(): void;

  /**
   * Set a mock response for a specific tool (for testing)
   * When set, the tool's execute function will be bypassed and the mock response returned
   * Polyfill-specific extension
   */
  setMockToolResponse(toolName: string, response: ToolResponse): void;

  /**
   * Clear mock response for a specific tool
   * Polyfill-specific extension
   */
  clearMockToolResponse(toolName: string): void;

  /**
   * Clear all mock tool responses
   * Polyfill-specific extension
   */
  clearAllMockToolResponses(): void;

  /**
   * Get the current tools registered in the system
   * (same as modelContext.listTools but explicitly for testing)
   * Polyfill-specific extension
   */
  getRegisteredTools(): ReturnType<ModelContext['listTools']>;

  /**
   * Reset the entire testing state (clears tool calls and mock responses)
   * Polyfill-specific extension
   */
  reset(): void;
}

declare global {
  interface Navigator {
    /**
     * Web Model Context API
     * Provides tools and context to AI agents
     */
    modelContext: ModelContext;

    /**
     * Model Context Testing API
     *
     * **IMPORTANT**: This API is only available in Chromium-based browsers
     * with the experimental feature flag enabled:
     * - `chrome://flags` → "Experimental Web Platform Features"
     * - Or launch with: `--enable-experimental-web-platform-features`
     *
     * If not available natively, the @mcp-b/global polyfill provides
     * a compatible implementation.
     */
    modelContextTesting?: ModelContextTesting;
  }

  interface Window {
    /**
     * Internal MCP server instance (for debugging/advanced use)
     */
    __mcpBridge?: MCPBridge;
  }
}
