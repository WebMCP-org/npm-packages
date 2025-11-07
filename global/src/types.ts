import type { IframeChildTransportOptions, TabServerTransportOptions } from '@mcp-b/transports';
import type {
  CallToolResult,
  Server as McpServer,
  ToolAnnotations,
  Transport,
} from '@mcp-b/webmcp-ts-sdk';
import type { z } from 'zod';

/**
 * JSON Schema definition for tool input parameters
 */
export interface InputSchema {
  type: string;
  properties?: Record<
    string,
    {
      type: string;
      description?: string;
      [key: string]: unknown;
    }
  >;
  required?: string[];
  [key: string]: unknown;
}

/**
 * Zod schema object type (Record<string, ZodType>)
 * Used for type-safe tool definitions
 */
export type ZodSchemaObject = Record<string, z.ZodTypeAny>;

/**
 * Re-export ToolAnnotations from MCP SDK for convenience
 */
export type { ToolAnnotations };

/**
 * Re-export CallToolResult from MCP SDK for convenience
 */
export type { CallToolResult };

/**
 * Tool response format (Web API version)
 * This is compatible with MCP SDK's CallToolResult
 */
export type ToolResponse = CallToolResult;

/**
 * Transport configuration for initializing the Web Model Context polyfill.
 */
export interface TransportConfiguration {
  /**
   * Provide a custom transport factory. When set, tabServer and iframeServer options are ignored.
   */
  create?: () => Transport;

  /**
   * Options passed to the built-in TabServerTransport when no custom factory is provided.
   * Set to false to disable the tab server.
   * Default: enabled with allowedOrigins: ['*']
   */
  tabServer?: Partial<TabServerTransportOptions> | false;

  /**
   * Options passed to the built-in IframeChildTransport when no custom factory is provided.
   * Set to false to disable the iframe server.
   * Default: auto-enabled when running in an iframe (window.parent !== window)
   */
  iframeServer?: Partial<IframeChildTransportOptions> | false;
}

/**
 * Initialization options for the Web Model Context polyfill.
 */
export interface WebModelContextInitOptions {
  /**
   * Configure the transport used to expose the MCP server in the browser.
   */
  transport?: TransportConfiguration;

  /**
   * When set to false, automatic initialization on module load is skipped.
   */
  autoInitialize?: boolean;
}

/**
 * Tool descriptor for Web Model Context API
 * Extended with full MCP protocol support
 *
 * Supports both JSON Schema (Web standard) and Zod schemas (type-safe)
 *
 * @template TInputSchema - If using Zod, the schema object type for type inference
 * @template TOutputSchema - If using Zod, the output schema object type
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
 * Internal validated tool descriptor (used internally by the bridge)
 * Always stores JSON Schema format for MCP protocol
 * Plus Zod validators for runtime validation
 */
export interface ValidatedToolDescriptor {
  name: string;
  description: string;
  inputSchema: InputSchema;
  outputSchema?: InputSchema;
  annotations?: ToolAnnotations;
  execute: (args: Record<string, unknown>) => Promise<ToolResponse>;

  // Internal validators (not exposed via MCP)
  inputValidator: z.ZodType;
  outputValidator?: z.ZodType;
}

/**
 * Context provided to models via provideContext()
 * Contains the base set of tools (Bucket A)
 */
export interface ModelContextInput {
  /**
   * Array of tool descriptors
   * Supports both JSON Schema and Zod schema formats
   */
  tools: ToolDescriptor[];
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
   * Provide context (tools) to AI models
   * Clears base tools (Bucket A) and replaces with the provided array.
   * Dynamic tools (Bucket B) registered via registerTool() persist.
   */
  provideContext(context: ModelContextInput): void;

  /**
   * Register a single tool dynamically
   * Returns an object with an unregister function to remove the tool
   * Supports both JSON Schema and Zod schema formats
   */
  registerTool<
    TInputSchema extends ZodSchemaObject = Record<string, never>,
    TOutputSchema extends ZodSchemaObject = Record<string, never>,
  >(
    tool: ToolDescriptor<TInputSchema, TOutputSchema>
  ): {
    unregister: () => void;
  };

  /**
   * Unregister a tool by name
   * Available in Chromium's native implementation
   */
  unregisterTool(name: string): void;

  /**
   * Clear all registered tools (both buckets)
   * Available in Chromium's native implementation
   */
  clearContext(): void;

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

  /**
   * Get the list of all registered tools
   * Returns tools from both buckets (provideContext and registerTool)
   */
  listTools(): Array<{
    name: string;
    description: string;
    inputSchema: InputSchema;
    outputSchema?: InputSchema;
    annotations?: ToolAnnotations;
  }>;
}

/**
 * Internal ModelContext interface with additional methods for MCP bridge
 * Not exposed as part of the public Web Model Context API
 */
export interface InternalModelContext extends ModelContext {
  /**
   * Execute a tool (internal use only by MCP bridge)
   * @internal
   */
  executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResponse>;
}

/**
 * Internal MCP Bridge state
 */
export interface MCPBridge {
  tabServer: McpServer;
  iframeServer?: McpServer;
  tools: Map<string, ValidatedToolDescriptor>;
  modelContext: InternalModelContext;
  modelContextTesting?: ModelContextTesting;
  isInitialized: boolean;
}

/**
 * Tool info returned by listTools() in testing API
 * Note: inputSchema is a JSON string, not an object (matches Chromium implementation)
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
