import type { ResourceContents, ToolAnnotations } from '@mcp-b/webmcp-types';
import {
  BrowserMcpServer as BrowserMcpServerRuntime,
  SERVER_MARKER_PROPERTY,
} from './browser-server.js';
import { Client } from './client.js';
import { NoOpJsonSchemaValidator } from './no-op-validator.js';
import { PolyfillJsonSchemaValidator } from './polyfill-validator.js';
import { JSONRPCMessageSchema } from './protocol.js';
import type {
  BrowserMcpServerConstructor,
  BrowserMcpServerOptions,
  BrowserMcpServer as BrowserMcpServerType,
  GetPromptResult,
  JSONRPCMessage,
  PromptDescriptor,
  PromptMessage,
  ReadResourceResult,
  ResourceDescriptor,
  SamplingRequestParams,
  SamplingResult,
  ServerInfo,
  Transport,
  TransportSendOptions,
} from './public-types.js';

export const BrowserMcpServer = BrowserMcpServerRuntime as unknown as BrowserMcpServerConstructor;
export const McpServer = BrowserMcpServer;

export {
  Client,
  JSONRPCMessageSchema,
  NoOpJsonSchemaValidator,
  PolyfillJsonSchemaValidator,
  SERVER_MARKER_PROPERTY,
};
export {
  ResourceListChangedNotificationSchema,
  ToolListChangedNotificationSchema,
} from './client.js';

export type BrowserMcpServer = BrowserMcpServerType;
export type McpServer = BrowserMcpServerType;
export type {
  CallToolResult,
  Prompt,
  RequestOptions,
  Resource,
  ServerCapabilities,
  Tool,
} from './client.js';

export type {
  BrowserMcpServerOptions,
  GetPromptResult,
  JSONRPCMessage,
  PromptDescriptor,
  PromptMessage,
  ReadResourceResult,
  ResourceContents,
  ResourceDescriptor,
  SamplingRequestParams,
  SamplingResult,
  ServerInfo,
  ToolAnnotations,
  Transport,
  TransportSendOptions,
};
