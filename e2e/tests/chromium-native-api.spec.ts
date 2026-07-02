import { expect, test } from '@playwright/test';

type LegacyModelContext = NonNullable<typeof navigator.modelContext> & {
  unregisterTool(name: string): void;
};

function isDirectOrWrappedText(value: unknown, expectedText: string): boolean {
  if (value === expectedText) {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const parsed = JSON.parse(value) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    return parsed.content?.[0]?.type === 'text' && parsed.content?.[0]?.text === expectedText;
  } catch {
    return false;
  }
}

/**
 * E2E Tests for Chromium Native API Compatibility
 *
 * These tests verify that the polyfill correctly implements the Chromium native
 * navigator.modelContext and navigator.modelContextTesting APIs.
 *
 * Tests work with both:
 * - Native Chromium implementation (when --enable-experimental-web-platform-features is set)
 * - Polyfill implementation (when native is not available)
 *
 * To test with Chromium native:
 * 1. Launch Chrome 152+ with:
 *    --enable-experimental-web-platform-features --enable-features=WebMCPTesting
 * 2. Or enable "WebMCP for testing" at chrome://flags/#enable-webmcp-testing
 */
test.describe('Chromium Native API - ModelContext', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Web Model Context API E2E Test');
  });

  test('should have unregisterTool method available', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return (
        typeof (navigator.modelContext as LegacyModelContext | undefined)?.unregisterTool ===
        'function'
      );
    });
    expect(hasMethod).toBe(true);
  });

  test('should not expose removed clearContext method', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return (
        typeof (navigator.modelContext as unknown as { clearContext?: unknown })?.clearContext ===
        'function'
      );
    });
    expect(hasMethod).toBe(false);
  });

  test('should unregisterTool by name - dynamic tool', async ({ page }) => {
    // Register a dynamic tool first
    await page.click('#register-dynamic');
    await page.waitForTimeout(500);

    // Verify tool exists
    let toolCount = await page.evaluate(() => {
      return navigator.modelContext.listTools().length;
    });
    expect(toolCount).toBe(5); // 4 base + 1 dynamic

    // Unregister using the new API
    await page.click('#chromium-unregister-tool');
    await page.waitForTimeout(500);

    // Verify tool removed
    toolCount = await page.evaluate(() => {
      return navigator.modelContext.listTools().length;
    });
    expect(toolCount).toBe(4); // back to 4 base tools

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(
      logEntries.some((entry) => entry.includes('Tool unregistered via AbortSignal cleanup'))
    ).toBe(true);
  });

  test('should unregisterTool by name - base tool', async ({ page }) => {
    // Get initial tool count
    let toolCount = await page.evaluate(() => {
      return navigator.modelContext.listTools().length;
    });
    expect(toolCount).toBe(4); // 4 base tools

    // Unregister a base tool directly
    await page.evaluate(() => {
      (navigator.modelContext as LegacyModelContext).unregisterTool('incrementCounter');
    });
    await page.waitForTimeout(300);

    // Verify tool removed
    toolCount = await page.evaluate(() => {
      return navigator.modelContext.listTools().length;
    });
    expect(toolCount).toBe(3); // 3 remaining base tools

    // Verify specific tool is gone
    const hasIncrementTool = await page.evaluate(() => {
      const tools = navigator.modelContext.listTools();
      return tools.some((tool: { name: string }) => tool.name === 'incrementCounter');
    });
    expect(hasIncrementTool).toBe(false);
  });

  test('should clearContext remove all tools', async ({ page }) => {
    // Register dynamic tool to have tools from both buckets
    await page.click('#register-dynamic');
    await page.waitForTimeout(500);

    let toolCount = await page.evaluate(() => {
      return navigator.modelContext.listTools().length;
    });
    expect(toolCount).toBeGreaterThan(0);

    // Clear all tools
    await page.click('#chromium-clear-context');
    await page.waitForTimeout(500);

    // Verify all tools cleared
    toolCount = await page.evaluate(() => {
      return navigator.modelContext.listTools().length;
    });
    expect(toolCount).toBe(0);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('All tools cleared'))).toBe(true);
  });

  test('should clearContext clear both buckets', async ({ page }) => {
    // Start with base tools
    let toolCount = await page.evaluate(() => {
      return navigator.modelContext.listTools().length;
    });
    expect(toolCount).toBe(4); // 4 base tools (Bucket A)

    // Add dynamic tool (Bucket B)
    await page.click('#register-dynamic');
    await page.waitForTimeout(500);

    toolCount = await page.evaluate(() => {
      return navigator.modelContext.listTools().length;
    });
    expect(toolCount).toBe(5); // 4 base + 1 dynamic

    await page.click('#chromium-clear-context');
    await page.waitForTimeout(500);

    // Verify both buckets cleared
    toolCount = await page.evaluate(() => {
      return navigator.modelContext.listTools().length;
    });
    expect(toolCount).toBe(0);
  });

  test('should handle unregisterTool on non-existent tool gracefully', async ({ page }) => {
    const result = await page.evaluate(() => {
      try {
        (navigator.modelContext as LegacyModelContext).unregisterTool('non-existent-tool');
        return { success: true, error: null };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    // Should not throw, just warn (based on implementation)
    expect(result.success).toBe(true);
  });
});

test.describe('Chromium Native API - ModelContextTesting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Web Model Context API E2E Test');
  });

  test('should have executeTool method available', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return typeof navigator.modelContextTesting?.executeTool === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('should have listTools method available', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return typeof navigator.modelContextTesting?.listTools === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('should have addEventListener method available', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return typeof navigator.modelContextTesting?.addEventListener === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('should executeTool with JSON string input', async ({ page }) => {
    await page.click('#chromium-execute-tool');
    await page.waitForTimeout(500);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('executeTool() succeeded with result'))).toBe(
      true
    );
  });

  test('should executeTool return correct value', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const testingAPI = navigator.modelContextTesting;
      if (!testingAPI) return null;

      // Register a simple echo tool
      navigator.modelContext.registerTool({
        name: 'echoTest',
        description: 'Echo test',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
          },
          required: ['text'],
        },
        async execute(args: { text: string }) {
          return {
            content: [{ type: 'text', text: args.text }],
          };
        },
      });

      // Execute using executeTool with JSON string
      const inputJson = JSON.stringify({ text: 'Hello World' });
      return await testingAPI.executeTool('echoTest', inputJson);
    });

    expect(isDirectOrWrappedText(result, 'Hello World')).toBe(true);
  });

  test('should executeTool throw on invalid JSON', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const testingAPI = navigator.modelContextTesting;
      if (!testingAPI) return { error: 'No testing API' };

      try {
        await testingAPI.executeTool('getCounter', '{invalid json}');
        return { success: true };
      } catch (error: unknown) {
        return {
          error: error instanceof Error ? error.name : 'Unknown',
        };
      }
    });

    expect(result.error).toBe('UnknownError');
  });

  test('should executeTool throw on non-existent tool', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const testingAPI = navigator.modelContextTesting;
      if (!testingAPI) return { error: 'No testing API' };

      try {
        await testingAPI.executeTool('nonExistentTool', '{}');
        return { success: true };
      } catch (error: unknown) {
        return {
          error: error instanceof Error ? error.message : 'Unknown',
        };
      }
    });

    expect(result.error).toContain('Tool not found');
  });

  test('should listTools return tools with inputSchema as JSON string', async ({ page }) => {
    await page.click('#chromium-list-tools');
    await page.waitForTimeout(500);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('listTools() returned'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('inputSchema is string: true'))).toBe(true);
  });

  test('should listTools return array of ToolInfo objects', async ({ page }) => {
    const tools = await page.evaluate(() => {
      const testingAPI = navigator.modelContextTesting;
      if (!testingAPI) return [];

      return testingAPI.listTools();
    });

    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);

    // Verify structure
    const firstTool = tools[0] as { name: string; description: string; inputSchema: string };
    expect(firstTool).toHaveProperty('name');
    expect(firstTool).toHaveProperty('description');
    expect(firstTool).toHaveProperty('inputSchema');
    expect(typeof firstTool.inputSchema).toBe('string');

    // Verify inputSchema is valid JSON
    expect(() => JSON.parse(firstTool.inputSchema)).not.toThrow();
  });

  test('should toolchange event fire on registerTool', async ({ page }) => {
    await page.click('#chromium-test-callback-register');
    await page.waitForTimeout(500);

    const callbackFired = await page.evaluate(() => {
      const statusEl = document.getElementById('chromium-callback-status');
      return statusEl?.getAttribute('data-register-fired') === 'true';
    });

    expect(callbackFired).toBe(true);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Callback fired on registerTool!'))).toBe(
      true
    );
  });

  test('should toolchange event fire on unregisterTool', async ({ page }) => {
    // First register a tool
    await page.click('#register-dynamic');
    await page.waitForTimeout(500);

    // Setup callback and test unregister
    await page.click('#chromium-test-callback-unregister');
    await page.waitForTimeout(500);

    const callbackFired = await page.evaluate(() => {
      const statusEl = document.getElementById('chromium-callback-status');
      return statusEl?.getAttribute('data-unregister-fired') === 'true';
    });

    expect(callbackFired).toBe(true);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Callback fired on unregisterTool!'))).toBe(
      true
    );
  });

  test('should toolchange event fire on base context replacement', async ({ page }) => {
    await page.click('#chromium-test-callback-provide');
    await page.waitForTimeout(500);

    const callbackFired = await page.evaluate(() => {
      const statusEl = document.getElementById('chromium-callback-status');
      return statusEl?.getAttribute('data-provide-fired') === 'true';
    });

    expect(callbackFired).toBe(true);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Callback fired on registerTool!'))).toBe(
      true
    );
  });

  test('should toolchange event fire on AbortSignal cleanup', async ({ page }) => {
    await page.click('#chromium-test-callback-clear');
    await page.waitForTimeout(500);

    const callbackFired = await page.evaluate(() => {
      const statusEl = document.getElementById('chromium-callback-status');
      return statusEl?.getAttribute('data-clear-fired') === 'true';
    });

    expect(callbackFired).toBe(true);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(
      logEntries.some((entry) => entry.includes('Callback fired on AbortSignal cleanup!'))
    ).toBe(true);
  });

  test('should toolchange event support multiple listeners', async ({ page }) => {
    const callbackCounts = await page.evaluate(async () => {
      const testingAPI = navigator.modelContextTesting;
      if (!testingAPI) return { first: 0, second: 0 };

      let first = 0;
      let second = 0;
      const callback1 = () => {
        first++;
      };
      const callback2 = () => {
        second++;
      };

      testingAPI.addEventListener('toolchange', callback1);
      testingAPI.addEventListener('toolchange', callback2);

      const controller = new AbortController();
      navigator.modelContext.registerTool(
        {
          name: `tempTool_${Date.now()}`,
          description: 'temp',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'test' }] };
          },
        },
        { signal: controller.signal }
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      controller.abort();

      return { first, second };
    });

    // addEventListener adds listeners — both should fire.
    expect(callbackCounts.first).toBe(1);
    expect(callbackCounts.second).toBe(1);
  });

  test('should toolchange event not break on listener error', async ({ page }) => {
    const secondCallbackFired = await page.evaluate(async () => {
      const testingAPI = navigator.modelContextTesting;
      if (!testingAPI) return false;

      let secondCalled = false;

      // First listener throws
      testingAPI.addEventListener('toolchange', () => {
        throw new Error('Test error');
      });

      // Second listener should still fire
      testingAPI.addEventListener('toolchange', () => {
        secondCalled = true;
      });

      const controller = new AbortController();
      navigator.modelContext.registerTool(
        {
          name: `tempTool2_${Date.now()}`,
          description: 'temp',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'test' }] };
          },
        },
        { signal: controller.signal }
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      controller.abort();

      return secondCalled;
    });

    expect(secondCallbackFired).toBe(true);
  });
});

test.describe('Chromium Native API - Integration Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Web Model Context API E2E Test');
  });

  test('should work together: executeTool and listTools', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const testingAPI = navigator.modelContextTesting;
      if (!testingAPI) return { error: 'No testing API' };

      // List tools
      const tools = testingAPI.listTools();
      if (tools.length === 0) return { error: 'No tools' };

      // Parse first tool's inputSchema
      const firstTool = tools[0];
      if (!firstTool) return { error: 'No tools' };
      const schema = JSON.parse(firstTool.inputSchema ?? '{}');

      // Execute using executeTool
      const result = await testingAPI.executeTool(firstTool.name, '{}');

      return {
        toolName: firstTool.name,
        schemaType: schema.type,
        executionResult: result,
      };
    });

    expect(result).toHaveProperty('toolName');
    expect(result).toHaveProperty('schemaType', 'object');
    expect(result).toHaveProperty('executionResult');
  });

  test('should work together: callbacks track all operations', async ({ page }) => {
    const operations = await page.evaluate(async () => {
      const testingAPI = navigator.modelContextTesting;
      if (!testingAPI) return [];

      const ops: string[] = [];

      testingAPI.addEventListener('toolchange', () => {
        const tools = testingAPI.listTools();
        ops.push(`Changed: ${tools.length} tools`);
      });

      const first = new AbortController();
      const second = new AbortController();
      const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

      navigator.modelContext.registerTool(
        {
          name: `test1_${Date.now()}`,
          description: 'test',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'test' }] };
          },
        },
        { signal: first.signal }
      );
      await tick();

      navigator.modelContext.registerTool(
        {
          name: `test2_${Date.now()}`,
          description: 'test',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'test' }] };
          },
        },
        { signal: second.signal }
      );
      await tick();

      first.abort();
      await tick();
      second.abort();
      await tick();

      return ops;
    });

    expect(operations.length).toBeGreaterThanOrEqual(4);
    expect(operations[0]).toContain('Changed:');
  });

  test('should verify API matches Chromium specification', async ({ page }) => {
    const apiCheck = await page.evaluate(() => {
      const modelContext = navigator.modelContext;
      const modelContextTesting = navigator.modelContextTesting;

      if (!modelContext || !modelContextTesting) {
        return { valid: false, reason: 'APIs not available' };
      }

      // Check ModelContext methods
      const contextMethods = [
        'registerTool',
        'unregisterTool',
        'listTools',
        'addEventListener',
        'removeEventListener',
        'dispatchEvent',
      ];

      for (const method of contextMethods) {
        if (typeof (modelContext as unknown as Record<string, unknown>)[method] !== 'function') {
          return { valid: false, reason: `Missing modelContext.${method}` };
        }
      }

      for (const method of ['provideContext', 'clearContext']) {
        if (typeof (modelContext as unknown as Record<string, unknown>)[method] === 'function') {
          return { valid: false, reason: `Removed modelContext.${method} is still exposed` };
        }
      }

      // Check ModelContextTesting methods (Chromium native)
      const testingMethods = ['executeTool', 'listTools', 'addEventListener'];

      for (const method of testingMethods) {
        if (
          typeof (modelContextTesting as unknown as Record<string, unknown>)[method] !== 'function'
        ) {
          return { valid: false, reason: `Missing modelContextTesting.${method}` };
        }
      }

      return { valid: true, reason: 'All APIs present' };
    });

    expect(apiCheck.valid).toBe(true);
    expect(apiCheck.reason).toBe('All APIs present');
  });
});
