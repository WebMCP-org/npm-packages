import type {} from '../react-webmcp-test-app/src/testMiddleware.js';
import type {} from '@mcp-b/global';
import type { MCPIframeElement } from '@mcp-b/mcp-iframe/element';
import type {
  CallToolResult,
  Client,
  GetPromptResult,
  ReadResourceResult,
  Variables,
} from '@modelcontextprotocol/client';
import type { JsonObject, RegisteredTool, WebMCP } from '@mcp-b/webmcp-ts-sdk';

declare global {
  interface Window {
    __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: WebMCP.ModelContext;
    __WEBMCP_SHOWCASE_RAW_SURFACE__?: Record<string, boolean>;
    mcpClient?: Client;
    mcpIframeHost: {
      addCollidingChildResources: () => void;
      callTool: (name: string, args: JsonObject) => Promise<CallToolResult>;
      getMcpIframe: () => MCPIframeElement;
      readResource: (uri: string) => Promise<ReadResourceResult>;
      readResourceTemplate: (template: string, variables: Variables) => Promise<ReadResourceResult>;
      getPrompt: (name: string, args: Record<string, string>) => Promise<GetPromptResult>;
      getParentTool: (name: string) => Promise<RegisteredTool | undefined>;
      setDynamicItems: (enabled: boolean) => Promise<void>;
      stopChildRuntime: () => Promise<void>;
    };
  }
}
