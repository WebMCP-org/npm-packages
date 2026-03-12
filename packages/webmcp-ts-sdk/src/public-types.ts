import type {
  InputSchema,
  ModelContextCore,
  ModelContextOptions,
  ModelContextToolReference,
  ResourceContents,
  ToolDescriptor,
  ToolListItem,
  ToolResponse,
} from '@mcp-b/webmcp-types';

export interface JSONRPCMessage {
  jsonrpc: '2.0';
  id?: string | number | null | undefined;
  method?: string | undefined;
  params?: unknown;
  result?: unknown;
  error?: JsonRpcError | undefined;
  [key: string]: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
  [key: string]: unknown;
}

export interface TransportSendOptions {
  relatedRequestId?: string | number;
  [key: string]: unknown;
}

export interface Transport {
  sessionId?: string;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  start(): Promise<void>;
  send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void>;
  close(): Promise<void>;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  maxTotalTimeout?: number;
  resetTimeoutOnProgress?: boolean;
  onprogress?: (notification: unknown) => void;
  [key: string]: unknown;
}

export interface ServerCapabilities {
  tools?: { listChanged?: boolean; [key: string]: unknown };
  resources?: { listChanged?: boolean; [key: string]: unknown };
  prompts?: { listChanged?: boolean; [key: string]: unknown };
  sampling?: Record<string, unknown>;
  elicitation?: Record<string, unknown>;
  logging?: Record<string, unknown>;
  experimental?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ServerInfo {
  name: string;
  version: string;
  title?: string;
  [key: string]: unknown;
}

export interface JsonSchemaValidatorResult<T> {
  valid: boolean;
  data: T | undefined;
  errorMessage: string | undefined;
}

export interface JsonSchemaValidator {
  getValidator<T>(schema: unknown): (input: unknown) => JsonSchemaValidatorResult<T>;
}

export interface BrowserMcpServerOptions {
  native?: ModelContextCore;
  capabilities?: ServerCapabilities;
  jsonSchemaValidator?: JsonSchemaValidator;
  [key: string]: unknown;
}

export interface ResourceDescriptor {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  read: (uri: URL, params?: Record<string, string>) => Promise<{ contents: ResourceContents[] }>;
}

export interface PromptContentBlock {
  type: 'text' | 'image' | 'audio' | 'resource';
  [key: string]: unknown;
}

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: PromptContentBlock | PromptContentBlock[];
}

export interface PromptDescriptor {
  name: string;
  description?: string;
  argsSchema?: InputSchema;
  get: (args: Record<string, unknown>) => Promise<{ messages: PromptMessage[] }>;
}

export type Tool = ToolListItem;

export interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface Prompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export interface ReadResourceResult {
  contents: ResourceContents[];
}

export interface GetPromptResult {
  description?: string;
  messages: PromptMessage[];
}

export interface SamplingRequestParams {
  messages: PromptMessage[];
  maxTokens?: number;
  systemPrompt?: string;
  includeContext?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SamplingResult {
  model?: string;
  role?: string;
  content: unknown;
  stopReason?: string;
  [key: string]: unknown;
}

export interface BrowserMcpServer {
  readonly __isBrowserMcpServer: true;
  connect(transport: Transport): Promise<void>;
  close(): Promise<void>;
  backfillTools(
    tools: readonly ToolListItem[],
    execute: (name: string, args: Record<string, unknown>) => Promise<ToolResponse>
  ): number;
  syncNativeTools(): number;
  registerTool(tool: ToolDescriptor): { unregister: () => void };
  unregisterTool(nameOrTool: string | ModelContextToolReference): void;
  registerResource(descriptor: ResourceDescriptor): { unregister: () => void };
  registerPrompt(descriptor: PromptDescriptor): { unregister: () => void };
  provideContext(options?: ModelContextOptions): void;
  clearContext(): void;
  listTools(): ToolListItem[];
  listResources(): Resource[];
  readResource(uri: string): Promise<ReadResourceResult>;
  listPrompts(): Prompt[];
  getPrompt(name: string, args?: Record<string, unknown>): Promise<GetPromptResult>;
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<ToolResponse>;
  executeTool(name: string, args?: Record<string, unknown>): Promise<ToolResponse>;
  createMessage(params: SamplingRequestParams, options?: RequestOptions): Promise<SamplingResult>;
  elicitInput(
    params: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<Record<string, unknown>>;
}

export interface BrowserMcpServerConstructor {
  new (serverInfo: ServerInfo, options?: BrowserMcpServerOptions): BrowserMcpServer;
}
