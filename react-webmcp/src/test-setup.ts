import { initializeWebModelContext } from '@mcp-b/global';
import { beforeAll, beforeEach } from 'vitest';

// Navigator type is extended by @mcp-b/global/src/types.ts

// Use a unique channel ID for the entire test suite to avoid conflicts
const TEST_CHANNEL_ID = `react-webmcp-test-${Date.now()}`;

/**
 * Initialize the polyfill once for all tests.
 * Call this in beforeAll of your test suite.
 */
export function setupPolyfill() {
  beforeAll(() => {
    if (!navigator.modelContext) {
      initializeWebModelContext({
        transport: {
          tabServer: {
            channelId: TEST_CHANNEL_ID,
            allowedOrigins: [window.location.origin],
          },
        },
      });
    }
  });

  // Clear context before each test to ensure clean state
  beforeEach(() => {
    navigator.modelContext?.clearContext();
    navigator.modelContextTesting?.reset();
  });
}
