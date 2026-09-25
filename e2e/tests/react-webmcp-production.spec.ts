import { expect, type Page, test } from '@playwright/test';

// =============================================================================
// Constants
// =============================================================================

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
      try {
        const tools = await window.mcpClient?.listTools();
        return tools
          ? names.every((name) => tools.tools.some((tool) => tool.name === name))
          : false;
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
      try {
        const tools = await window.mcpClient?.listTools();
        return (tools?.tools.length ?? 0) > 0;
      } catch {
        return false;
      }
    },
    { timeout: 10000 }
  );
}

/** Tool names currently visible to the real MCP client; empty when the client is unreachable. */
async function listToolNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    try {
      const response = await window.mcpClient?.listTools();
      return response?.tools.map((tool) => tool.name) ?? [];
    } catch {
      return [];
    }
  });
}

async function callToolViaClient(
  page: Page,
  toolName: string,
  args: Record<string, unknown>
): Promise<void> {
  await page.evaluate(
    async ({ name, arguments_ }) => {
      if (!window.mcpClient) {
        throw new Error('mcpClient not available');
      }

      await window.mcpClient.callTool({ name, arguments: arguments_ });
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

// =============================================================================
// Tests
// =============================================================================

test.describe('Production Build - Runtime Integration Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector(SELECTORS.APP_STATUS);
  });

  test('exposes MCP-B extensions over the WebMCP runtime', async ({ page }) => {
    const apiCheck = await page.evaluate(() => {
      const context = document.modelContext as
        | (NonNullable<Document['modelContext']> & { listTools?: unknown })
        | undefined;
      const testing = navigator.modelContextTesting;
      return {
        hasContext: Boolean(context),
        hasGetTools: typeof context?.getTools === 'function',
        hasMcpBListTools: typeof context?.listTools === 'function',
        hasTestingListTools: typeof testing?.listTools === 'function',
        hasTestingExecuteTool: typeof testing?.executeTool === 'function',
      };
    });

    expect(apiCheck).toEqual({
      hasContext: true,
      hasGetTools: true,
      hasMcpBListTools: true,
      hasTestingListTools: true,
      hasTestingExecuteTool: true,
    });
  });

  test('executes tool exactly once', async ({ page }) => {
    await waitForToolsRegistered(page, [TOOLS.COUNTER_INCREMENT]);

    const initialCount = await getExecutionCount(page);

    // Execute the tool via real MCP client transport
    await callToolViaClient(page, TOOLS.COUNTER_INCREMENT, { amount: 1 });

    // Wait for execution count to update (not a fixed timeout)
    await waitForExecutionCount(page, initialCount + 1);

    // Verify counter increased by 1, not 2
    await waitForCounterValue(page, 1);
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

    const tools = await listToolNames(page);

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

    const tools = await listToolNames(page);

    const toolCounts = new Map<string, number>();
    for (const name of tools) {
      toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
    }
    const duplicates = [...toolCounts]
      .filter(([, count]) => count > 1)
      .map(([name, count]) => ({ name, count }));

    expect(duplicates).toEqual([]);
  });
});
