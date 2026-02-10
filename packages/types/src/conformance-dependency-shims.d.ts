// Conformance-only module shims.
// These keep `@mcp-b/types` conformance checks independent from building sibling
// workspace packages while still preserving structural checks against shared types.

declare module '@mcp-b/transports' {
  export interface TabServerTransportOptions {
    allowedOrigins?: string[];
    [key: string]: unknown;
  }

  export interface IframeChildTransportOptions {
    allowedOrigins?: string[];
    [key: string]: unknown;
  }
}

declare module '@mcp-b/webmcp-ts-sdk' {
  export interface Server {}

  export interface Transport {
    start?(): Promise<void>;
    close?(): Promise<void>;
    [key: string]: unknown;
  }

  export interface ToolAnnotations {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
    [key: string]: unknown;
  }

  export interface Resource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
  }

  export interface ResourceContents {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
    [key: string]: unknown;
  }

  export interface ResourceTemplate {
    uriTemplate: string;
    name: string;
    description?: string;
    mimeType?: string;
    [key: string]: unknown;
  }

  export interface PromptMessage {
    role: 'user' | 'assistant';
    content:
      | { type: 'text'; text: string }
      | { type: 'image'; data: string; mimeType: string }
      | Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  }

  export interface Prompt {
    name: string;
    description?: string;
    arguments?: Array<{
      name: string;
      description?: string;
      required?: boolean;
      [key: string]: unknown;
    }>;
  }

  export interface CallToolResult {
    content: Array<Record<string, unknown>>;
    isError?: boolean;
    [key: string]: unknown;
  }

  export interface CreateMessageRequest {
    params: Record<string, unknown>;
  }

  export interface CreateMessageResult {
    model: string;
    role: string;
    content: Record<string, unknown>;
    stopReason?: string;
    [key: string]: unknown;
  }

  export interface ElicitRequest {
    params: Record<string, unknown>;
  }

  export interface ElicitResult {
    action: 'accept' | 'decline' | 'cancel';
    content?: Record<string, unknown>;
    [key: string]: unknown;
  }
}
