import { expect, test } from '@playwright/test';

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
test.describe('Production Build - Polyfill Detection Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-status"]');
  });

  test('should correctly detect polyfill via marker property in minified build', async ({
    page,
  }) => {
    // Verify the polyfill marker property exists on modelContextTesting
    const markerCheck = await page.evaluate(() => {
      const testing = navigator.modelContextTesting;
      if (!testing) {
        return { exists: false, reason: 'modelContextTesting not available' };
      }

      // Check for the marker property that identifies this as a polyfill
      const hasMarker = '__isWebMCPPolyfill' in testing;
      const markerValue = (testing as { __isWebMCPPolyfill?: boolean }).__isWebMCPPolyfill;

      return {
        exists: true,
        hasMarker,
        markerValue,
        constructorName: testing.constructor?.name || 'unknown',
      };
    });

    expect(markerCheck.exists).toBe(true);
    expect(markerCheck.hasMarker).toBe(true);
    expect(markerCheck.markerValue).toBe(true);

    // In production, constructor name will be minified (not 'WebModelContextTesting')
    // This proves that relying on constructor name would fail
    console.log(`Constructor name in production: ${markerCheck.constructorName}`);
  });

  test('should execute tool exactly once - no double execution', async ({ page }) => {
    // Wait for tools to be registered
    await page.waitForFunction(
      () => {
        const testing = navigator.modelContextTesting;
        if (!testing) return false;
        const tools = testing.listTools();
        return tools.some((t) => t.name === 'counter_increment');
      },
      { timeout: 10000 }
    );

    // Track how many times the tool handler is actually called
    // We do this by checking the execution count before and after
    const initialExecCount = await page.locator('[data-testid="total-executions"]').textContent();
    const initialCount = Number.parseInt(initialExecCount || '0', 10);

    // Execute the tool via modelContextTesting
    const result = await page.evaluate(async () => {
      const testing = navigator.modelContextTesting;
      if (!testing) {
        throw new Error('modelContextTesting not available');
      }

      // Execute counter_increment once
      await testing.executeTool('counter_increment', JSON.stringify({ amount: 1 }));

      return { success: true };
    });

    expect(result.success).toBe(true);

    // Wait for the execution to be reflected in the UI
    await page.waitForTimeout(500);

    // Check execution count - should have increased by exactly 1, not 2
    const finalExecCount = await page.locator('[data-testid="total-executions"]').textContent();
    const finalCount = Number.parseInt(finalExecCount || '0', 10);

    const executionDelta = finalCount - initialCount;
    expect(executionDelta).toBe(1); // Should be 1, not 2

    // Also verify counter increased by 1, not 2
    const counterValue = await page.locator('[data-testid="counter-display"]').textContent();
    expect(counterValue).toBe('1');
  });

  test('should not detect polyfill as native API in production build', async ({ page }) => {
    // In the buggy version, production builds would incorrectly detect the polyfill
    // as a native API because the constructor name check failed.
    // This test verifies the fix works correctly.

    const apiCheck = await page.evaluate(() => {
      // Check if modelContext and modelContextTesting are the polyfill versions
      const ctx = navigator.modelContext;
      const testing = navigator.modelContextTesting;

      if (!ctx || !testing) {
        return {
          hasApis: false,
          reason: 'APIs not available',
        };
      }

      // The polyfill marker should be present
      const isPolyfill =
        '__isWebMCPPolyfill' in testing &&
        (testing as { __isWebMCPPolyfill?: boolean }).__isWebMCPPolyfill === true;

      // Constructor names may be minified in production
      const testingConstructorName = testing.constructor?.name || '';
      const isConstructorMinified = !testingConstructorName.includes('WebModelContext');

      return {
        hasApis: true,
        isPolyfill,
        testingConstructorName,
        isConstructorMinified,
      };
    });

    expect(apiCheck.hasApis).toBe(true);
    expect(apiCheck.isPolyfill).toBe(true);

    // Log for debugging - in production, constructor name will likely be minified
    console.log(`Testing constructor name: ${apiCheck.testingConstructorName}`);
    console.log(`Is constructor minified: ${apiCheck.isConstructorMinified}`);
  });

  test('should execute multiple tools without double execution', async ({ page }) => {
    // Wait for tools to be registered
    await page.waitForFunction(
      () => {
        const testing = navigator.modelContextTesting;
        if (!testing) return false;
        const tools = testing.listTools();
        return (
          tools.some((t) => t.name === 'counter_increment') &&
          tools.some((t) => t.name === 'posts_like')
        );
      },
      { timeout: 10000 }
    );

    // Get initial counts
    const initialExecCount = await page.locator('[data-testid="total-executions"]').textContent();
    const initialCount = Number.parseInt(initialExecCount || '0', 10);

    // Execute multiple different tools
    const result = await page.evaluate(async () => {
      const testing = navigator.modelContextTesting;
      if (!testing) {
        throw new Error('modelContextTesting not available');
      }

      // Execute 3 different tool calls
      await testing.executeTool('counter_increment', JSON.stringify({ amount: 1 }));
      await testing.executeTool('counter_increment', JSON.stringify({ amount: 2 }));
      await testing.executeTool('posts_like', JSON.stringify({ postId: '1' }));

      return { success: true };
    });

    expect(result.success).toBe(true);

    // Wait for executions to complete
    await page.waitForTimeout(500);

    // Check execution count - should have increased by exactly 3
    const finalExecCount = await page.locator('[data-testid="total-executions"]').textContent();
    const finalCount = Number.parseInt(finalExecCount || '0', 10);

    const executionDelta = finalCount - initialCount;
    expect(executionDelta).toBe(3); // Should be 3, not 6

    // Counter should be 3 (1 + 2)
    const counterValue = await page.locator('[data-testid="counter-display"]').textContent();
    expect(counterValue).toBe('3');
  });

  test('should track counter executions correctly without doubling', async ({ page }) => {
    // Wait for tools to be registered
    await page.waitForFunction(
      () => {
        const testing = navigator.modelContextTesting;
        if (!testing) return false;
        const tools = testing.listTools();
        return tools.some((t) => t.name === 'counter_increment');
      },
      { timeout: 10000 }
    );

    // Execute counter increment 5 times
    for (let i = 0; i < 5; i++) {
      await page.evaluate(async () => {
        const testing = navigator.modelContextTesting;
        if (!testing) throw new Error('modelContextTesting not available');
        await testing.executeTool('counter_increment', JSON.stringify({ amount: 1 }));
      });
    }

    // Wait for all executions to complete
    await page.waitForTimeout(500);

    // Counter should be exactly 5
    const counterValue = await page.locator('[data-testid="counter-display"]').textContent();
    expect(counterValue).toBe('5');

    // Counter executions should be exactly 5
    const counterExecCount = await page.locator('[data-testid="counter-executions"]').textContent();
    expect(counterExecCount).toBe('5');

    // Total executions should also be 5
    const totalExecCount = await page.locator('[data-testid="total-executions"]').textContent();
    expect(totalExecCount).toBe('5');
  });
});

test.describe('Production Build - Tool Registration Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-status"]');
  });

  test('should register tools only once in production build', async ({ page }) => {
    // Wait for tools to be registered
    await page.waitForFunction(
      () => {
        const testing = navigator.modelContextTesting;
        if (!testing) return false;
        const tools = testing.listTools();
        return tools.length > 0;
      },
      { timeout: 10000 }
    );

    // Get all registered tools
    const tools = await page.evaluate(() => {
      const testing = navigator.modelContextTesting;
      if (!testing) return [];
      return testing.listTools().map((t) => t.name);
    });

    // Check for duplicates
    const uniqueTools = [...new Set(tools)];
    expect(tools.length).toBe(uniqueTools.length);

    // Verify expected tools are registered
    expect(tools).toContain('counter_increment');
    expect(tools).toContain('counter_decrement');
    expect(tools).toContain('counter_get');
    expect(tools).toContain('posts_like');
    expect(tools).toContain('posts_search');
  });

  test('should not have any duplicate tool registrations', async ({ page }) => {
    await page.waitForFunction(
      () => {
        const testing = navigator.modelContextTesting;
        if (!testing) return false;
        return testing.listTools().length > 0;
      },
      { timeout: 10000 }
    );

    const toolCheck = await page.evaluate(() => {
      const testing = navigator.modelContextTesting;
      if (!testing) return { tools: [], hasDuplicates: false };

      const tools = testing.listTools().map((t) => t.name);
      const toolCounts = tools.reduce(
        (acc, name) => {
          acc[name] = (acc[name] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const duplicates = Object.entries(toolCounts)
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
