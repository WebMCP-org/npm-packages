export type {
  CallToolResult,
  ContentBlock,
  JSONObject as JsonObject,
  JSONValue as JsonValue,
  TextContent,
} from '@modelcontextprotocol/server';

/** JSON Schema object accepted at the WebMCP boundary. */
export interface InputSchema {
  type?: unknown;
  properties?: Readonly<Record<string, unknown>> | undefined;
  required?: readonly string[] | undefined;
  [keyword: string]: unknown;
}

/** Values accepted by WebMCP tool callbacks. */
export type WebMcpToolInput = Record<string, unknown> | unknown[];

/** Handle returned by MCP-B registration helpers. */
export interface RegistrationHandle {
  unregister(): void;
}
