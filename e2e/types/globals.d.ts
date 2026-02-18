/// <reference types="@mcp-b/webmcp-ts-sdk" />
import type {
  ModelContextTesting,
  ModelContextTestingPolyfillExtensions,
} from '@mcp-b/webmcp-types';

type ExtendedModelContextTesting = ModelContextTesting &
  Partial<ModelContextTestingPolyfillExtensions>;

declare global {
  interface Navigator {
    modelContextTesting?: ExtendedModelContextTesting;
  }

  interface Window {
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
