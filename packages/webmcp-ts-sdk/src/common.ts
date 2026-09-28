import type { StandardJSONSchemaV1 } from '@standard-schema/spec';
import type { WebMCP } from 'webmcp-types';

export type {
  CallToolResult,
  ContentBlock,
  JSONObject as JsonObject,
  JSONValue as JsonValue,
  TextContent,
} from '@modelcontextprotocol/server';

/** JSON Schema object accepted at the WebMCP boundary. */
type StandardJsonSchemaObject = ReturnType<StandardJSONSchemaV1.Converter['input']>;

export interface InputSchema extends StandardJsonSchemaObject {
  type?: unknown;
  properties?: Readonly<StandardJsonSchemaObject> | undefined;
  required?: readonly string[] | undefined;
}

/** Object or array values accepted at the WebMCP runtime boundary. */
export type WebMcpToolObjectInput = Parameters<WebMCP.ToolExecuteCallback>[0];
export type WebMcpToolInput = WebMcpToolObjectInput | unknown[];
export type WebMcpToolResult = Awaited<ReturnType<WebMCP.ToolExecuteCallback>>;

/** Handle returned by MCP-B registration helpers. */
export interface RegistrationHandle {
  unregister(): void;
}
