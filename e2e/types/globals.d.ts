import type { ToolListItem, ToolResponse } from '@mcp-b/webmcp-types';

declare module '@mcp-b/webmcp-types' {
  // These augment ModelContextCore with BrowserMcpServer methods that exist
  // at runtime after @mcp-b/global replaces navigator.modelContext.
  // registerTool is NOT listed here — it already has proper overloads in the package.
  interface ModelContextCore {
    listTools(): ToolListItem[];
    callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<ToolResponse>;
    executeTool(name: string, args?: Record<string, unknown>): Promise<ToolResponse>;
    unregisterTool(name: string): void;
    createMessage(params: unknown): Promise<unknown>;
    elicitInput(params: unknown): Promise<unknown>;
  }

  // These match ModelContextTestingPolyfillExtensions from the package.
  // Augmented here so e2e tests can access them via navigator.modelContextTesting.
  interface ModelContextTesting {
    getToolCalls?(): Array<{
      toolName: string;
      arguments: Record<string, unknown>;
      timestamp: number;
    }>;
    clearToolCalls?(): void;
    setMockToolResponse?(toolName: string, response: ToolResponse): void;
    clearMockToolResponse?(toolName: string): void;
    clearAllMockToolResponses?(): void;
    getRegisteredTools?(): ToolListItem[];
    reset?(): void;
  }
}

declare global {
  interface Window {
    __WEBMCP_E2E__?: {
      isReady: () => boolean;
      registerDynamicTool: () => boolean;
      unregisterDynamicTool: (name?: string) => boolean;
      readInvocations: () => Array<{
        name: string;
        arguments: Record<string, unknown>;
      }>;
      resetInvocations: () => void;
    };
    mcpClient?: {
      listTools: () => Promise<{ tools: Array<{ name: string }> }>;
      callTool: (params: {
        name: string;
        arguments?: Record<string, unknown>;
      }) => Promise<ToolResponse>;
    };
    mcpIframeHost: {
      callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
      getMcpIframe: () => Element | null;
    };
    testApp: {
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
    } & Record<string, unknown>;
  }
}
