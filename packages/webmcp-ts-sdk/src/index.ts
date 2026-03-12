import type { ResourceContents, ToolAnnotations } from '@mcp-b/webmcp-types';
import {
  BrowserMcpServer as BrowserMcpServerRuntime,
  SERVER_MARKER_PROPERTY,
} from './browser-server.js';
import { NoOpJsonSchemaValidator } from './no-op-validator.js';
import { PolyfillJsonSchemaValidator } from './polyfill-validator.js';
import type {
  BrowserMcpServerConstructor,
  BrowserMcpServerOptions,
  BrowserMcpServer as BrowserMcpServerType,
  GetPromptResult,
  Prompt,
  PromptDescriptor,
  PromptMessage,
  ReadResourceResult,
  RequestOptions,
  Resource,
  ResourceDescriptor,
  SamplingRequestParams,
  SamplingResult,
  ServerCapabilities,
  ServerInfo,
  Tool,
  Transport,
  TransportSendOptions,
} from './public-types.js';

export const BrowserMcpServer = BrowserMcpServerRuntime as unknown as BrowserMcpServerConstructor;
export const McpServer = BrowserMcpServer;

export { NoOpJsonSchemaValidator, PolyfillJsonSchemaValidator, SERVER_MARKER_PROPERTY };

export type BrowserMcpServer = BrowserMcpServerType;
export type McpServer = BrowserMcpServerType;

export type {
  BrowserMcpServerOptions,
  GetPromptResult,
  Prompt,
  PromptDescriptor,
  PromptMessage,
  ReadResourceResult,
  RequestOptions,
  Resource,
  ResourceContents,
  ResourceDescriptor,
  SamplingRequestParams,
  SamplingResult,
  ServerCapabilities,
  ServerInfo,
  Tool,
  ToolAnnotations,
  Transport,
  TransportSendOptions,
};
