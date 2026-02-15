import type {
  InternalModelContext,
  ModelContextTesting,
  ModelContextTestingPolyfillExtensions,
} from '@mcp-b/global';

type ExtendedModelContextTesting = ModelContextTesting &
  Partial<ModelContextTestingPolyfillExtensions>;

declare global {
  interface Navigator {
    modelContext: InternalModelContext;
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
