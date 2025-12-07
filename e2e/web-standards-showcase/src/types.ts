/**
 * Type definitions for the native Chromium Web Model Context API
 * This file provides TypeScript types without importing any polyfills
 */

export interface ToolInputSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
}

/**
 * The Web Model Context API expects execute functions to return any value.
 * The native API will handle serialization to string for the testing API.
 */
export interface ToolOutputSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
}

/**
 * The Web Model Context API expects execute functions to return any value.
 * The native API will handle serialization to string for the testing API.
 * When outputSchema is defined, the response will include structuredContent.
 */
export interface Tool {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  outputSchema?: ToolOutputSchema;
  execute: (input: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface ToolRegistration {
  unregister: () => void;
}

export interface ProvideContextOptions {
  tools: Tool[];
}

export interface ModelContext extends EventTarget {
  provideContext(options: ProvideContextOptions): void;
  registerTool(tool: Tool): ToolRegistration;
  listTools(): Tool[];
  executeTool(name: string, input: Record<string, unknown>): Promise<unknown>;
  unregisterTool(name: string): void;
  clearContext(): void;
}

export interface ToolInfo {
  name: string;
  description: string;
  inputSchema: string; // JSON string, not object!
  outputSchema?: string; // JSON string when defined
}

export interface ModelContextTesting {
  executeTool(toolName: string, inputArgsJson: string): Promise<string>;
  listTools(): ToolInfo[];
  registerToolsChangedCallback(callback: () => void): void;
  getToolCalls(): Array<{ toolName: string; inputArgs: string; result: string }>;
  clearToolCalls(): void;
  setMockToolResponse(toolName: string, response: string): void;
  clearMockToolResponse(toolName: string): void;
  getRegisteredTools(): ToolInfo[];
  reset(): void;
}

declare global {
  interface Navigator {
    modelContext?: ModelContext;
    modelContextTesting?: ModelContextTesting;
  }
}

export interface DetectionResult {
  available: boolean;
  isNative: boolean;
  isPolyfill: boolean;
  testingAvailable: boolean;
  message: string;
}
