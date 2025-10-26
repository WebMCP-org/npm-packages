// Web Model Context API Types
// Based on: https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/WebModelContext/explainer.md

import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';

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
 * Content item in a tool response
 */
export interface ContentItem {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
  [key: string]: unknown;
}

/**
 * Tool response format
 */
export interface ToolResponse {
  content: ContentItem[];
  isError?: boolean;
}

/**
 * Tool descriptor for Web Model Context API
 */
export interface ToolDescriptor {
  /**
   * Unique identifier for the tool
   */
  name: string;

  /**
   * Natural language description of what the tool does
   */
  description: string;

  /**
   * JSON Schema defining the input parameters
   */
  inputSchema: InputSchema;

  /**
   * Function that executes the tool logic
   */
  execute: (args: Record<string, unknown>) => Promise<ToolResponse>;
}

/**
 * Context provided to agents
 */
export interface AgentContext {
  /**
   * Array of tool descriptors
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
 * Agent interface on window
 */
export interface Agent extends EventTarget {
  /**
   * Provide context (tools) to agents
   */
  provideContext(context: AgentContext): void;

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
}

/**
 * Internal MCP Bridge state
 */
export interface MCPBridge {
  server: McpServer;
  tools: Map<string, ToolDescriptor>;
  isInitialized: boolean;
}

declare global {
  interface Window {
    /**
     * Web Model Context API
     */
    agent: Agent;

    /**
     * Internal MCP server instance (for debugging/advanced use)
     */
    __mcpBridge?: MCPBridge;
  }
}

export {};
