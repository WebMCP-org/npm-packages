import type { RuntimeContractController } from '../runtime-contract/core.js';
import type { Client } from '@modelcontextprotocol/client';

declare global {
  interface Window {
    __WEBMCP_E2E__?: RuntimeContractController;
    mcpClient?: Client;
    mcpIframeHost: {
      callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
      getMcpIframe: () => Element & {
        client: unknown;
        ready: boolean;
        exposedTools: string[];
        exposedResources: string[];
        exposedPrompts: string[];
      };
      readResource: (uri: string) => Promise<unknown>;
      getParentTool: (name: string) => Promise<unknown>;
      addChildDynamicItem: (item: 'tool' | 'resource' | 'prompt') => Promise<void>;
      removeChildDynamicItems: () => void;
      stopChildRuntime: () => Promise<void>;
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
