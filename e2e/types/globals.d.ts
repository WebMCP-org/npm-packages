import type { RuntimeContractController } from '../runtime-contract/core.js';
import type { MCPIframeElement } from '@mcp-b/mcp-iframe/element';
import type {
  CallToolResult,
  Client,
  GetPromptResult,
  ReadResourceResult,
  Variables,
} from '@modelcontextprotocol/client';

declare global {
  interface Window {
    __WEBMCP_E2E__?: RuntimeContractController;
    mcpClient?: Client;
    mcpIframeHost: {
      addCollidingChildResources: () => void;
      callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;
      getMcpIframe: () => MCPIframeElement;
      readResource: (uri: string) => Promise<ReadResourceResult>;
      readResourceTemplate: (template: string, variables: Variables) => Promise<ReadResourceResult>;
      getPrompt: (name: string, args: Record<string, string>) => Promise<GetPromptResult>;
      getParentTool: (name: string) => Promise<unknown>;
      setDynamicItems: (enabled: boolean) => Promise<void>;
      stopChildRuntime: () => Promise<void>;
    };
    testApp: {
      counter: () => number;
      getAPIStatus: () => boolean;
      testRapidToolRegistration: (
        count: number
      ) => Promise<{ registeredCount: number; notificationCount: number }>;
      testMultiTaskToolRegistration: (
        count: number
      ) => Promise<{ registeredCount: number; notificationCount: number }>;
      testMixedRegistrationBatching: () => Promise<{
        phase1Notifications: number;
        phase2Notifications: number;
        phase3Notifications: number;
      }>;
    };
  }
}
