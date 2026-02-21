import type { ToolListItem, ToolResponse } from '@mcp-b/webmcp-types';

declare module '@mcp-b/webmcp-types' {
  interface ModelContextCore {
    listTools(): ToolListItem[];
    executeTool(name: string, args?: Record<string, unknown>): Promise<ToolResponse>;
    callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<ToolResponse>;
    createMessage(params: unknown): Promise<unknown>;
    elicitInput(params: unknown): Promise<unknown>;
    registerResource(descriptor: {
      uri: string;
      name: string;
      description?: string;
      mimeType?: string;
      read: (uri: URL, params?: Record<string, string>) => Promise<{ contents: unknown[] }>;
    }): { unregister: () => void };
    listResources(): Array<{
      uri: string;
      name: string;
      description?: string;
      mimeType?: string;
    }>;
    listResourceTemplates(): Array<{
      uriTemplate: string;
      name: string;
      description?: string;
      mimeType?: string;
    }>;
    registerPrompt(descriptor: {
      name: string;
      description?: string;
      argsSchema?: unknown;
      get: (args: Record<string, unknown>) => Promise<{ messages: unknown[] }>;
    }): { unregister: () => void };
    listPrompts(): Array<{
      name: string;
      description?: string;
      arguments?: Array<{
        name: string;
        description?: string;
        required?: boolean;
      }>;
    }>;
  }
}
