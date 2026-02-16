import type { IframeChildTransportOptions, TabServerTransportOptions } from '@mcp-b/transports';
import type { PromptMessage, ResourceContents } from '@mcp-b/webmcp-ts-sdk';
import type {
  CallToolResult,
  InputSchema,
  ModelContextCore,
  ModelContextOptions,
  ToolAnnotations,
  ToolDescriptor,
  ToolListItem,
  ToolResponse,
} from '@mcp-b/webmcp-types';

export interface TransportConfiguration {
  tabServer?: Partial<TabServerTransportOptions> | false;
  iframeServer?: Partial<IframeChildTransportOptions> | false;
}

export type NativeModelContextBehavior = 'preserve' | 'patch';

export interface WebModelContextInitOptions {
  transport?: TransportConfiguration;
  autoInitialize?: boolean;
  /**
   * Behavior when navigator.modelContext already exists.
   * - 'preserve' (default): keep native implementation untouched.
   * - 'patch': replace with BrowserMcpServer that mirrors to the native object.
   */
  nativeModelContextBehavior?: NativeModelContextBehavior;
  /**
   * Forwarded to @mcp-b/webmcp-polyfill when polyfill installation is needed.
   * - true or 'if-missing' (default): install modelContextTesting only when missing.
   * - 'always': replace existing modelContextTesting.
   * - false: do not install modelContextTesting.
   */
  installTestingShim?: boolean | 'always' | 'if-missing';
}

/** BrowserMcpServer exposed as navigator.modelContext. */
export type ModelContext = ModelContextCore & {
  listTools(): ToolListItem[];
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<ToolResponse>;

  registerResource(descriptor: {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
    read: (uri: URL, params?: Record<string, string>) => Promise<{ contents: ResourceContents[] }>;
  }): { unregister: () => void };

  listResources(): Array<{
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
  }>;

  readResource(uri: string): Promise<{ contents: ResourceContents[] }>;

  registerPrompt(descriptor: {
    name: string;
    description?: string;
    argsSchema?: InputSchema;
    get: (args: Record<string, unknown>) => Promise<{ messages: PromptMessage[] }>;
  }): { unregister: () => void };

  listPrompts(): Array<{
    name: string;
    description?: string;
    arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  }>;

  getPrompt(name: string, args?: Record<string, unknown>): Promise<{ messages: PromptMessage[] }>;
};

export type {
  CallToolResult,
  InputSchema,
  ModelContextCore,
  ModelContextOptions,
  PromptMessage,
  ResourceContents,
  ToolAnnotations,
  ToolDescriptor,
  ToolListItem,
  ToolResponse,
};

declare global {
  interface Window {
    __webModelContextOptions?: WebModelContextInitOptions;
  }
}
