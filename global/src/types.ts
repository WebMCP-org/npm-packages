// Web Model Context API Types
// Based on: https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/WebModelContext/explainer.md

import type { CallToolResult, Server as McpServer, ToolAnnotations } from '@mcp-b/webmcp-ts-sdk';
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
  tools: ToolDescriptor<any, any>[];
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
  server: McpServer;
  tools: Map<string, ValidatedToolDescriptor>;
  modelContext: InternalModelContext;
  isInitialized: boolean;
}

declare global {
  interface Navigator {
    /**
     * Web Model Context API
     * Provides tools and context to AI agents
     */
    modelContext: ModelContext;
  }

  interface Window {
    /**
     * Internal MCP server instance (for debugging/advanced use)
     */
    __mcpBridge?: MCPBridge;
  }
}
