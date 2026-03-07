import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

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
    mcpClient?: Client;
  }
}
