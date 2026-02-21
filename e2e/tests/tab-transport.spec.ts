import { expect, test } from '@playwright/test';

test.describe('Web Model Context API E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Web Model Context API E2E Test');
  });

  test('should load the test application', async ({ page }) => {
    // Verify page loaded correctly
    await expect(page.locator('#api-status')).toContainText('API: Ready');
    await expect(page.locator('#counter-display')).toHaveText('0');

    // Verify base tool buttons are visible
    await expect(page.locator('#increment')).toBeVisible();
    await expect(page.locator('#decrement')).toBeVisible();
    await expect(page.locator('#reset')).toBeVisible();
    await expect(page.locator('#get-counter')).toBeVisible();

    // Verify dynamic tool buttons
    await expect(page.locator('#register-dynamic')).toBeEnabled();
    await expect(page.locator('#unregister-dynamic')).toBeDisabled();
  });

  test('should have navigator.modelContext API available', async ({ page }) => {
    // Check that the API is available
    const hasAPI = await page.evaluate(() => 'modelContext' in navigator);
    expect(hasAPI).toBe(true);

    // Verify status shows API is ready
    await expect(page.locator('#api-status')).toContainText('API: Ready');
    await expect(page.locator('#api-status')).toHaveAttribute('data-status', 'ready');
  });

  test('should register base tools via provideContext', async ({ page }) => {
    // Check the log for base tools registration
    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(
      logEntries.some((entry) => entry.includes('Registering base tools via provideContext'))
    ).toBe(true);
    expect(
      logEntries.some((entry) => entry.includes('Base tools registered successfully (Bucket A)'))
    ).toBe(true);
  });

  test('should list all registered tools', async ({ page }) => {
    // Click list all tools button
    await page.click('#list-all-tools');

    // Wait for tools to be listed
    await page.waitForTimeout(500);

    const toolNames = await page.evaluate(() =>
      navigator.modelContext.listTools().map((tool: { name: string }) => tool.name)
    );
    expect(toolNames).toHaveLength(4);
    expect(toolNames).toContain('incrementCounter');
    expect(toolNames).toContain('decrementCounter');
    expect(toolNames).toContain('resetCounter');
    expect(toolNames).toContain('getCounter');
  });

  test('should register dynamic tool (Bucket B)', async ({ page }) => {
    // Register dynamic tool
    await page.click('#register-dynamic');

    // Wait for registration
    await page.waitForTimeout(500);

    // Verify status updated
    await expect(page.locator('#dynamic-status')).toContainText('Registered');

    // Verify buttons updated
    await expect(page.locator('#register-dynamic')).toBeDisabled();
    await expect(page.locator('#unregister-dynamic')).toBeEnabled();
    await expect(page.locator('#call-dynamic')).toBeEnabled();

    // Check log
    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(
      logEntries.some((entry) => entry.includes('Dynamic tool registered successfully (Bucket B)'))
    ).toBe(true);
  });

  test('should unregister dynamic tool', async ({ page }) => {
    // First register
    await page.click('#register-dynamic');
    await page.waitForTimeout(500);

    // Then unregister
    await page.click('#unregister-dynamic');
    await page.waitForTimeout(500);

    // Verify status updated
    await expect(page.locator('#dynamic-status')).toContainText('Not registered');

    // Verify buttons updated
    await expect(page.locator('#register-dynamic')).toBeEnabled();
    await expect(page.locator('#unregister-dynamic')).toBeDisabled();
    await expect(page.locator('#call-dynamic')).toBeDisabled();

    // Check log
    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(
      logEntries.some((entry) => entry.includes('Dynamic tool unregistered successfully'))
    ).toBe(true);
  });

  test('should replace dynamic tools on provideContext calls (strict core behavior)', async ({
    page,
  }) => {
    // Register dynamic tool
    await page.click('#register-dynamic');
    await page.waitForTimeout(500);

    // Verify 5 tools total (4 base + 1 dynamic)
    let toolNames = await page.evaluate(() =>
      navigator.modelContext.listTools().map((tool: { name: string }) => tool.name)
    );
    expect(toolNames).toHaveLength(5);
    expect(toolNames).toContain('dynamicTool');

    // Replace base tools (strict mode replaces all registered tools)
    await page.click('#replace-base-tools');
    await page.waitForTimeout(500);

    toolNames = await page.evaluate(() =>
      navigator.modelContext.listTools().map((tool: { name: string }) => tool.name)
    );
    expect(toolNames).toHaveLength(2);
    expect(toolNames).toContain('doubleCounter');
    expect(toolNames).toContain('halveCounter');
    expect(toolNames).not.toContain('dynamicTool');
  });

  test('should expose tools via public modelContext API', async ({ page }) => {
    const toolCount = await page.evaluate(() => navigator.modelContext.listTools().length);

    // Should have 4 base tools initially
    expect(toolCount).toBe(4);
  });

  test('should use testApp API for programmatic testing', async ({ page }) => {
    // Test that the testApp API is exposed
    const hasTestApp = await page.evaluate(() => 'testApp' in window);
    expect(hasTestApp).toBe(true);

    // Test counter function
    const counter = await page.evaluate(() => {
      const w = window as unknown as {
        testApp: { counter: () => number; getAPIStatus: () => boolean };
      };
      return w.testApp.counter();
    });
    expect(counter).toBe(0);

    // Test getAPIStatus function
    const apiStatus = await page.evaluate(() => {
      const w = window as unknown as {
        testApp: { counter: () => number; getAPIStatus: () => boolean };
      };
      return w.testApp.getAPIStatus();
    });
    expect(apiStatus).toBe(true);
  });

  test('should clear event log', async ({ page }) => {
    // Add some log entries first
    await page.click('#list-all-tools');
    await page.waitForTimeout(500);

    // Verify log has entries
    let logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.length).toBeGreaterThan(0);

    // Clear log
    await page.click('#clear-log');
    await page.waitForTimeout(500);

    // Verify log only has "Log cleared" entry
    logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.length).toBe(1);
    expect(logEntries[0]).toContain('Log cleared');
  });
});

test.describe('Resources API Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Web Model Context API E2E Test');
  });

  test('should register base resources via provideContext (Bucket A)', async ({ page }) => {
    await page.click('#register-base-resources');
    await page.waitForTimeout(500);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(
      logEntries.some((entry) =>
        entry.includes('Base resources registered successfully (Bucket A)')
      )
    ).toBe(true);

    const status = page.locator('#resources-status');
    await expect(status).toHaveAttribute('data-resources', 'base-registered');
  });

  test('should register dynamic resource via registerResource (Bucket B)', async ({ page }) => {
    await page.click('#register-dynamic-resource');
    await page.waitForTimeout(500);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(
      logEntries.some((entry) =>
        entry.includes('Dynamic resource registered successfully (Bucket B)')
      )
    ).toBe(true);

    const status = page.locator('#resources-status');
    await expect(status).toHaveAttribute('data-resources', 'dynamic-registered');

    await expect(page.locator('#register-dynamic-resource')).toBeDisabled();
    await expect(page.locator('#unregister-dynamic-resource')).toBeEnabled();
  });

  test('should unregister dynamic resource', async ({ page }) => {
    await page.click('#register-dynamic-resource');
    await page.waitForTimeout(500);

    await page.click('#unregister-dynamic-resource');
    await page.waitForTimeout(500);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(
      logEntries.some((entry) => entry.includes('Dynamic resource unregistered successfully'))
    ).toBe(true);

    const status = page.locator('#resources-status');
    await expect(status).toHaveAttribute('data-resources', 'dynamic-unregistered');

    await expect(page.locator('#register-dynamic-resource')).toBeEnabled();
    await expect(page.locator('#unregister-dynamic-resource')).toBeDisabled();
  });
});

test.describe('Prompts API Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Web Model Context API E2E Test');
  });

  test('should register base prompts via provideContext (Bucket A)', async ({ page }) => {
    await page.click('#register-base-prompts');
    await page.waitForTimeout(500);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(
      logEntries.some((entry) => entry.includes('Base prompts registered successfully (Bucket A)'))
    ).toBe(true);

    const status = page.locator('#prompts-status');
    await expect(status).toHaveAttribute('data-prompts', 'base-registered');
  });

  test('should register dynamic prompt via registerPrompt (Bucket B)', async ({ page }) => {
    await page.click('#register-dynamic-prompt');
    await page.waitForTimeout(500);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(
      logEntries.some((entry) =>
        entry.includes('Dynamic prompt registered successfully (Bucket B)')
      )
    ).toBe(true);

    const status = page.locator('#prompts-status');
    await expect(status).toHaveAttribute('data-prompts', 'dynamic-registered');

    await expect(page.locator('#register-dynamic-prompt')).toBeDisabled();
    await expect(page.locator('#unregister-dynamic-prompt')).toBeEnabled();
  });

  test('should unregister dynamic prompt', async ({ page }) => {
    await page.click('#register-dynamic-prompt');
    await page.waitForTimeout(500);

    await page.click('#unregister-dynamic-prompt');
    await page.waitForTimeout(500);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(
      logEntries.some((entry) => entry.includes('Dynamic prompt unregistered successfully'))
    ).toBe(true);

    const status = page.locator('#prompts-status');
    await expect(status).toHaveAttribute('data-prompts', 'dynamic-unregistered');

    await expect(page.locator('#register-dynamic-prompt')).toBeEnabled();
    await expect(page.locator('#unregister-dynamic-prompt')).toBeDisabled();
  });
});

test.describe('Model Context Testing API Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Web Model Context API E2E Test');
  });

  test('should have navigator.modelContextTesting API available', async ({ page }) => {
    const hasTestingAPI = await page.evaluate(() => 'modelContextTesting' in navigator);
    expect(hasTestingAPI).toBe(true);
  });

  test('should detect testing API implementation type', async ({ page }) => {
    await page.click('#check-testing-api');
    await page.waitForTimeout(500);

    const status = page.locator('#testing-api-status');
    await expect(status).toHaveAttribute('data-testing-api', 'available');

    const apiType = await status.getAttribute('data-testing-api-type');
    expect(['native', 'polyfill']).toContain(apiType);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(
      logEntries.some((entry) => entry.includes('navigator.modelContextTesting is available'))
    ).toBe(true);
  });

  test('should expose core testing API methods', async ({ page }) => {
    const methods = await page.evaluate(() => {
      const testingAPI = navigator.modelContextTesting;
      if (!testingAPI) return [];

      return ['listTools', 'executeTool', 'registerToolsChangedCallback'].filter(
        (method) => typeof testingAPI[method as keyof typeof testingAPI] === 'function'
      );
    });

    expect(methods).toHaveLength(3);
    expect(methods).toContain('listTools');
    expect(methods).toContain('executeTool');
    expect(methods).toContain('registerToolsChangedCallback');
  });

  test('should list base tools via modelContextTesting.listTools()', async ({ page }) => {
    const toolNames = await page.evaluate(() => {
      const testingAPI = navigator.modelContextTesting;
      if (!testingAPI) return [];
      return testingAPI.listTools().map((tool: { name: string }) => tool.name);
    });

    expect(toolNames).toContain('incrementCounter');
    expect(toolNames).toContain('decrementCounter');
    expect(toolNames).toContain('resetCounter');
    expect(toolNames).toContain('getCounter');
  });

  test('should execute a tool via modelContextTesting.executeTool()', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const testingAPI = navigator.modelContextTesting;
      if (!testingAPI) return null;
      return await testingAPI.executeTool('getCounter', '{}');
    });

    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
  });

  test('should fire registerToolsChangedCallback on tool registration', async ({ page }) => {
    const callbackCount = await page.evaluate(async () => {
      const testingAPI = navigator.modelContextTesting;
      if (!testingAPI) return 0;

      let count = 0;
      testingAPI.registerToolsChangedCallback(() => {
        count++;
      });

      const toolName = `testingCallbackTool_${Date.now()}`;
      navigator.modelContext.registerTool({
        name: toolName,
        description: 'Callback test tool',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 200));
      navigator.modelContext.unregisterTool(toolName);

      return count;
    });

    expect(callbackCount).toBeGreaterThan(0);
  });
});

test.describe('Sampling & Elicitation API Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Web Model Context API E2E Test');
  });

  test('should have createMessage and elicitInput methods available', async ({ page }) => {
    await page.click('#check-sampling-api');
    await page.waitForTimeout(500);

    const status = page.locator('#sampling-status');
    await expect(status).toHaveAttribute('data-sampling-api', 'available');

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('createMessage available: true'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('elicitInput available: true'))).toBe(true);
  });

  test('should have createMessage method on navigator.modelContext', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return typeof navigator.modelContext.createMessage === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('should have elicitInput method on navigator.modelContext', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return typeof navigator.modelContext.elicitInput === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('should reject or timeout createMessage without a connected sampling client', async ({
    page,
  }) => {
    const outcome = await page.evaluate(async () => {
      try {
        await Promise.race([
          navigator.modelContext.createMessage({
            messages: [{ role: 'user', content: { type: 'text', text: 'test' } }],
            maxTokens: 50,
          }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('timeout')), 2000);
          }),
        ]);
        return 'resolved';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    });

    expect(outcome).not.toBe('resolved');
  });

  test('should reject or timeout elicitInput without a connected elicitation client', async ({
    page,
  }) => {
    const outcome = await page.evaluate(async () => {
      try {
        await Promise.race([
          navigator.modelContext.elicitInput({
            message: 'Name?',
            requestedSchema: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
          }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('timeout')), 2000);
          }),
        ]);
        return 'resolved';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    });

    expect(outcome).not.toBe('resolved');
  });
});
