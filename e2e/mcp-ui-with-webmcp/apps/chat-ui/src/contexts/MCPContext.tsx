import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type {
  CallToolRequest,
  CallToolResult,
  Prompt,
  Resource,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { createContext } from 'react';

export interface MCPContextValue {
  tools: Tool[];
  prompts: Prompt[];
  resources: Resource[];
  state: 'disconnected' | 'connecting' | 'loading' | 'ready' | 'failed';
  callPrompt: (name: string, args?: Record<string, string>) => Promise<unknown>;
  readResource: (uri: string) => Promise<unknown>;
  callTool: (request: CallToolRequest['params'], sourceId?: string) => Promise<CallToolResult>;
  // Server connection management
  serverUrl: string | null;
  connectServer: (url: string) => Promise<void>;
  disconnectServer: () => Promise<void>;

  // WebMCP integration methods
  registerWebMcpClient: (sourceId: string, client: Client) => void;
  registerWebMcpTools: (tools: Tool[], sourceId: string) => void;
  unregisterWebMcpClient: (sourceId: string) => void;
}

export const MCPContext = createContext<MCPContextValue | null>(null);
