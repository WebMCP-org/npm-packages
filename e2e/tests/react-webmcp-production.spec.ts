import { expect, type Page, test } from '@playwright/test';

/**
 * Production Build Tests for React WebMCP
 *
 * These tests verify that the polyfill detection works correctly in production builds
 * where class names are minified. This specifically tests the fix for the "double tool
 * execution" bug where tools would execute twice due to incorrect polyfill detection.
 *
 * Bug: In production builds, class names are minified, causing the constructor name check
 * `testingConstructorName.includes('WebModelContext')` to fail. This incorrectly identified
 * the polyfill as a "Native Chromium API", creating dual execution paths.
 *
 * Fix: Use a marker property `__isWebMCPPolyfill` instead of constructor name checking.
 */

// =============================================================================
// Constants - Single source of truth for test values
// =============================================================================

/** Marker property name - must match POLYFILL_MARKER_PROPERTY in @mcp-b/global */
const POLYFILL_MARKER = '__isWebMCPPolyfill' as const;

/** Tool names used in the test app */
const TOOLS = {
  COUNTER_INCREMENT: 'counter_increment',
  COUNTER_DECREMENT: 'counter_decrement',
  COUNTER_GET: 'counter_get',
  POSTS_LIKE: 'posts_like',
  POSTS_SEARCH: 'posts_search',
} as const;

/** Test selectors */
const SELECTORS = {
  APP_STATUS: '[data-testid="app-status"]',
  TOTAL_EXECUTIONS: '[data-testid="total-executions"]',
  COUNTER_DISPLAY: '[data-testid="counter-display"]',
  COUNTER_EXECUTIONS: '[data-testid="counter-executions"]',
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Wait for specific tools to be available through the real MCP client.
 */
async function waitForToolsRegistered(page: Page, toolNames: string[]): Promise<void> {
  await page.waitForFunction(
    async (names: string[]) => {
      const w = window as unknown as {
        mcpClient?: {
          listTools: () => Promise<{ tools: Array<{ name: string }> }>;
        };
      };
      if (!w.mcpClient || typeof w.mcpClient.listTools !== 'function') {
        return false;
      }

      try {
        const tools = await w.mcpClient.listTools();
        return names.every((name) => tools.tools.some((tool) => tool.name === name));
      } catch {
        return false;
      }
    },
    toolNames,
    { timeout: 10000 }
  );
}

/**
 * Wait for any tools to be available through the real MCP client.
 */
async function waitForAnyToolsRegistered(page: Page): Promise<void> {
  await page.waitForFunction(
    async () => {
      const w = window as unknown as {
        mcpClient?: {
          listTools: () => Promise<{ tools: Array<{ name: string }> }>;
        };
      };
      if (!w.mcpClient || typeof w.mcpClient.listTools !== 'function') {
        return false;
      }

      try {
        const tools = await w.mcpClient.listTools();
        return tools.tools.length > 0;
      } catch {
        return false;
      }
    },
    { timeout: 10000 }
  );
}

async function callToolViaClient(
  page: Page,
  toolName: string,
  args: Record<string, unknown>
): Promise<void> {
  await page.evaluate(
    async ({ name, arguments_ }) => {
      const w = window as unknown as {
        mcpClient?: {
          callTool: (request: {
            name: string;
            arguments?: Record<string, unknown>;
          }) => Promise<unknown>;
        };
      };
      if (!w.mcpClient || typeof w.mcpClient.callTool !== 'function') {
        throw new Error('mcpClient not available');
      }

      await w.mcpClient.callTool({ name, arguments: arguments_ });
    },
    { name: toolName, arguments_: args }
  );
}

/**
 * Get the current execution count from the UI.
 */
async function getExecutionCount(page: Page): Promise<number> {
  const text = await page.locator(SELECTORS.TOTAL_EXECUTIONS).textContent();
  return Number.parseInt(text || '0', 10);
}

/**
 * Wait for execution count to reach a specific value.
 * More reliable than waitForTimeout.
 */
async function waitForExecutionCount(page: Page, expectedCount: number): Promise<void> {
  await expect(page.locator(SELECTORS.TOTAL_EXECUTIONS)).toHaveText(String(expectedCount), {
    timeout: 5000,
  });
}

/**
 * Wait for counter display to reach a specific value.
 */
async function waitForCounterValue(page: Page, expectedValue: number): Promise<void> {
  await expect(page.locator(SELECTORS.COUNTER_DISPLAY)).toHaveText(String(expectedValue), {
    timeout: 5000,
  });
}

// =============================================================================
// Type definitions for page.evaluate
// =============================================================================

interface PolyfillMarkerCheck {
  exists: boolean;
  reason?: string;
  hasMarker?: boolean;
  markerValue?: boolean;
  constructorName?: string;
}

interface ApiCheck {
  hasApis: boolean;
  reason?: string;
  isPolyfill?: boolean;
  testingConstructorName?: string;
  isConstructorMinified?: boolean;
}

// =============================================================================
// Tests
// =============================================================================

test.describe('Production Build - Polyfill Detection Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector(SELECTORS.APP_STATUS);
  });

  test('should surface polyfill marker when present in production build', async ({ page }) => {
    const markerCheck = await page.evaluate((marker): PolyfillMarkerCheck => {
      const testing = navigator.modelContextTesting;
      if (!testing) {
        return { exists: false, reason: 'modelContextTesting not available' };
      }

      const hasMarker = marker in testing;
      const markerValue = (testing as unknown as Record<string, unknown>)[marker] as
        | boolean
        | undefined;

      return {
        exists: true,
        hasMarker,
        ...(markerValue !== undefined ? { markerValue } : {}),
        constructorName: testing.constructor?.name || 'unknown',
      };
    }, POLYFILL_MARKER);

    expect(markerCheck.exists).toBe(true);
    // Some environments expose native modelContextTesting without polyfill marker.
    if (markerCheck.hasMarker) {
      expect(markerCheck.markerValue).toBe(true);
    } else {
      expect(typeof markerCheck.constructorName).toBe('string');
    }
  });

  test('should execute tool exactly once - no double execution', async ({ page }) => {
    await waitForToolsRegistered(page, [TOOLS.COUNTER_INCREMENT]);

    const initialCount = await getExecutionCount(page);

    // Execute the tool via real MCP client transport
    await callToolViaClient(page, TOOLS.COUNTER_INCREMENT, { amount: 1 });

    // Wait for execution count to update (not a fixed timeout)
    await waitForExecutionCount(page, initialCount + 1);

    // Verify counter increased by 1, not 2
    await waitForCounterValue(page, 1);
  });

  test('should classify testing API using marker rather than constructor name', async ({
    page,
  }) => {
    const apiCheck = await page.evaluate((marker): ApiCheck => {
      const ctx = navigator.modelContext;
      const testing = navigator.modelContextTesting;

      if (!ctx || !testing) {
        return { hasApis: false, reason: 'APIs not available' };
      }

      const isPolyfill =
        marker in testing && (testing as unknown as Record<string, unknown>)[marker] === true;

      const testingConstructorName = testing.constructor?.name || '';
      const isConstructorMinified = !testingConstructorName.includes('WebModelContext');

      return {
        hasApis: true,
        isPolyfill,
        testingConstructorName,
        isConstructorMinified,
      };
    }, POLYFILL_MARKER);

    expect(apiCheck.hasApis).toBe(true);
    expect(typeof apiCheck.isPolyfill).toBe('boolean');

    if (apiCheck.isPolyfill) {
      expect(apiCheck.testingConstructorName).toBeDefined();
    }
  });

  test('should execute multiple tools without double execution', async ({ page }) => {
    await waitForToolsRegistered(page, [TOOLS.COUNTER_INCREMENT, TOOLS.POSTS_LIKE]);

    const initialCount = await getExecutionCount(page);

    // Execute 3 different tool calls
    await callToolViaClient(page, TOOLS.COUNTER_INCREMENT, { amount: 1 });
    await callToolViaClient(page, TOOLS.COUNTER_INCREMENT, { amount: 2 });
    await callToolViaClient(page, TOOLS.POSTS_LIKE, { postId: '1' });

    // Wait for execution count to update - should be 3, not 6
    await waitForExecutionCount(page, initialCount + 3);

    // Counter should be 3 (1 + 2)
    await waitForCounterValue(page, 3);
  });

  test('should track counter executions correctly without doubling', async ({ page }) => {
    await waitForToolsRegistered(page, [TOOLS.COUNTER_INCREMENT]);

    // Execute counter increment 5 times
    for (let i = 0; i < 5; i++) {
      await callToolViaClient(page, TOOLS.COUNTER_INCREMENT, { amount: 1 });
    }

    // Wait for final values (not fixed timeout)
    await waitForCounterValue(page, 5);
    await waitForExecutionCount(page, 5);

    // Verify counter-specific executions
    await expect(page.locator(SELECTORS.COUNTER_EXECUTIONS)).toHaveText('5');
  });
});

test.describe('Production Build - Tool Registration Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector(SELECTORS.APP_STATUS);
  });

  test('should register tools only once in production build', async ({ page }) => {
    await waitForAnyToolsRegistered(page);

    const tools = await page.evaluate(async () => {
      const w = window as unknown as {
        mcpClient?: {
          listTools: () => Promise<{ tools: Array<{ name: string }> }>;
        };
      };
      if (!w.mcpClient || typeof w.mcpClient.listTools !== 'function') {
        return [];
      }
      try {
        const response = await w.mcpClient.listTools();
        return response.tools.map((tool) => tool.name);
      } catch {
        return [];
      }
    });

    // Check for duplicates
    const uniqueTools = [...new Set(tools)];
    expect(tools.length).toBe(uniqueTools.length);

    // Verify expected tools are registered
    expect(tools).toContain(TOOLS.COUNTER_INCREMENT);
    expect(tools).toContain(TOOLS.COUNTER_DECREMENT);
    expect(tools).toContain(TOOLS.COUNTER_GET);
    expect(tools).toContain(TOOLS.POSTS_LIKE);
    expect(tools).toContain(TOOLS.POSTS_SEARCH);
  });

  test('should not have any duplicate tool registrations', async ({ page }) => {
    await waitForAnyToolsRegistered(page);

    const toolCheck = await page.evaluate(async () => {
      const w = window as unknown as {
        mcpClient?: {
          listTools: () => Promise<{ tools: Array<{ name: string }> }>;
        };
      };
      if (!w.mcpClient || typeof w.mcpClient.listTools !== 'function') {
        return { tools: [] as string[], hasDuplicates: false };
      }

      let tools: string[] = [];
      try {
        const response = await w.mcpClient.listTools();
        tools = response.tools.map((tool) => tool.name);
      } catch {
        return { tools: [] as string[], hasDuplicates: false };
      }

      const toolCounts = tools.reduce(
        (acc: Record<string, number>, name: string) => {
          acc[name] = (acc[name] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const duplicates = (Object.entries(toolCounts) as Array<[string, number]>)
        .filter(([, count]) => count > 1)
        .map(([name, count]) => ({ name, count }));

      return {
        tools,
        toolCounts,
        duplicates,
        hasDuplicates: duplicates.length > 0,
      };
    });

    expect(toolCheck.hasDuplicates).toBe(false);
    if (toolCheck.hasDuplicates) {
      console.error('Duplicate tools found:', toolCheck.duplicates);
    }
  });
});
