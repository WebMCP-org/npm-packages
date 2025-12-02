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

    // Check that the tools are listed in the log
    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Total tools registered: 4'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('incrementCounter'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('decrementCounter'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('resetCounter'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('getCounter'))).toBe(true);
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

  test('should persist dynamic tool across provideContext calls (two-bucket system)', async ({
    page,
  }) => {
    // Register dynamic tool
    await page.click('#register-dynamic');
    await page.waitForTimeout(500);

    // Verify 5 tools total (4 base + 1 dynamic)
    await page.click('#list-all-tools');
    await page.waitForTimeout(500);
    let logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Total tools registered: 5'))).toBe(true);

    // Replace base tools (Bucket A)
    await page.click('#replace-base-tools');
    await page.waitForTimeout(500);

    // Verify dynamic tool persisted
    logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(
      logEntries.some((entry) =>
        entry.includes('Dynamic tool still registered! (Bucket B persists)')
      )
    ).toBe(true);

    // List tools again - should now have 3 tools (2 new base + 1 dynamic)
    await page.click('#list-all-tools');
    await page.waitForTimeout(500);
    logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Total tools registered: 3'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('dynamicTool'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('doubleCounter'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('halveCounter'))).toBe(true);
  });

  test('should access tools via __mcpBridge for debugging', async ({ page }) => {
    const toolCount = await page.evaluate(() => {
      const w = window as unknown as { __mcpBridge?: { tools: Map<string, unknown> } };
      if (w.__mcpBridge) {
        return w.__mcpBridge.tools.size;
      }
      return 0;
    });

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

  test('should list all resources', async ({ page }) => {
    await page.click('#register-base-resources');
    await page.waitForTimeout(500);

    await page.click('#list-resources');
    await page.waitForTimeout(500);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Total resources:'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('config://app-settings'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('counter://value'))).toBe(true);
  });

  test('should list resource templates', async ({ page }) => {
    await page.click('#register-base-resources');
    await page.waitForTimeout(500);

    await page.click('#list-resource-templates');
    await page.waitForTimeout(500);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Total templates:'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('file://{path}'))).toBe(true);
  });

  test('should read static resource', async ({ page }) => {
    await page.click('#register-base-resources');
    await page.waitForTimeout(500);

    await page.click('#read-static-resource');
    await page.waitForTimeout(500);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Resource read successfully'))).toBe(true);

    const status = page.locator('#resources-status');
    await expect(status).toHaveAttribute('data-read-static', 'success');
  });

  test('should read template resource', async ({ page }) => {
    await page.click('#register-base-resources');
    await page.waitForTimeout(500);

    await page.click('#read-template-resource');
    await page.waitForTimeout(500);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Template resource read successfully'))).toBe(
      true
    );

    const status = page.locator('#resources-status');
    await expect(status).toHaveAttribute('data-read-template', 'success');
  });

  test('should persist dynamic resource across provideContext calls (two-bucket system)', async ({
    page,
  }) => {
    // Register dynamic resource
    await page.click('#register-dynamic-resource');
    await page.waitForTimeout(500);

    // List resources - should have 1 dynamic resource
    await page.click('#list-resources');
    await page.waitForTimeout(500);
    let logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('dynamic://status'))).toBe(true);

    // Register base resources (replaces Bucket A)
    await page.click('#register-base-resources');
    await page.waitForTimeout(500);

    // List resources again - dynamic resource should persist
    await page.click('#list-resources');
    await page.waitForTimeout(500);
    logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('dynamic://status'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('config://app-settings'))).toBe(true);
  });

  test('should access resources via __mcpBridge', async ({ page }) => {
    await page.click('#register-base-resources');
    await page.waitForTimeout(500);

    const resourceCount = await page.evaluate(() => {
      const w = window as unknown as { __mcpBridge?: { resources: Map<string, unknown> } };
      if (w.__mcpBridge) {
        return w.__mcpBridge.resources.size;
      }
      return 0;
    });

    // Should have 3 base resources (app-settings, counter, file template)
    expect(resourceCount).toBe(3);
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

  test('should list all prompts', async ({ page }) => {
    await page.click('#register-base-prompts');
    await page.waitForTimeout(500);

    await page.click('#list-prompts');
    await page.waitForTimeout(500);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Total prompts:'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('greeting'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('code-review'))).toBe(true);
  });

  test('should get prompt without arguments', async ({ page }) => {
    await page.click('#register-base-prompts');
    await page.waitForTimeout(500);

    await page.click('#get-prompt-without-args');
    await page.waitForTimeout(500);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Prompt retrieved successfully'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('Hello! How can you help me today?'))).toBe(
      true
    );

    const status = page.locator('#prompts-status');
    await expect(status).toHaveAttribute('data-get-prompt-no-args', 'success');
  });

  test('should get prompt with arguments', async ({ page }) => {
    await page.click('#register-base-prompts');
    await page.waitForTimeout(500);

    await page.click('#get-prompt-with-args');
    await page.waitForTimeout(500);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(
      logEntries.some((entry) => entry.includes('Prompt with args retrieved successfully'))
    ).toBe(true);
    expect(logEntries.some((entry) => entry.includes('Please review this javascript code'))).toBe(
      true
    );

    const status = page.locator('#prompts-status');
    await expect(status).toHaveAttribute('data-get-prompt-with-args', 'success');
  });

  test('should persist dynamic prompt across provideContext calls (two-bucket system)', async ({
    page,
  }) => {
    // Register dynamic prompt
    await page.click('#register-dynamic-prompt');
    await page.waitForTimeout(500);

    // List prompts - should have 1 dynamic prompt
    await page.click('#list-prompts');
    await page.waitForTimeout(500);
    let logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('dynamic-summary'))).toBe(true);

    // Register base prompts (replaces Bucket A)
    await page.click('#register-base-prompts');
    await page.waitForTimeout(500);

    // List prompts again - dynamic prompt should persist
    await page.click('#list-prompts');
    await page.waitForTimeout(500);
    logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('dynamic-summary'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('greeting'))).toBe(true);
  });

  test('should access prompts via __mcpBridge', async ({ page }) => {
    await page.click('#register-base-prompts');
    await page.waitForTimeout(500);

    const promptCount = await page.evaluate(() => {
      const w = window as unknown as { __mcpBridge?: { prompts: Map<string, unknown> } };
      if (w.__mcpBridge) {
        return w.__mcpBridge.prompts.size;
      }
      return 0;
    });

    // Should have 2 base prompts (greeting, code-review)
    expect(promptCount).toBe(2);
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

  test('should track tool calls via modelContextTesting', async ({ page }) => {
    await page.click('#test-tool-tracking');
    await page.waitForTimeout(1000);

    const status = page.locator('#testing-api-status');
    const toolCalls = await status.getAttribute('data-tool-calls');
    expect(Number.parseInt(toolCalls || '0', 10)).toBeGreaterThan(0);

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Tool calls tracked:'))).toBe(true);
  });

  test('should inject mock responses via modelContextTesting', async ({ page }) => {
    await page.click('#test-mock-response');
    await page.waitForTimeout(1000);

    const status = page.locator('#testing-api-status');
    await expect(status).toHaveAttribute('data-mock-response', 'working');

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Mock response verified!'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('This is a MOCK response!'))).toBe(true);
  });

  test('should reset testing state', async ({ page }) => {
    await page.click('#test-tool-tracking');
    await page.waitForTimeout(1000);

    let status = page.locator('#testing-api-status');
    const toolCallsBefore = await status.getAttribute('data-tool-calls');
    expect(Number.parseInt(toolCallsBefore || '0', 10)).toBeGreaterThan(0);

    await page.click('#test-reset');
    await page.waitForTimeout(500);

    status = page.locator('#testing-api-status');
    await expect(status).toHaveAttribute('data-reset', 'working');

    const toolCallsAfter = await status.getAttribute('data-tool-calls');
    expect(toolCallsAfter).toBeNull();

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Reset successful!'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('Tool calls after reset: 0'))).toBe(true);
  });

  test('should expose all testing API methods', async ({ page }) => {
    const methods = await page.evaluate(() => {
      const testingAPI = navigator.modelContextTesting;
      if (!testingAPI) return [];

      return [
        'getToolCalls',
        'clearToolCalls',
        'setMockToolResponse',
        'clearMockToolResponse',
        'clearAllMockToolResponses',
        'getRegisteredTools',
        'reset',
      ].filter((method) => typeof testingAPI[method as keyof typeof testingAPI] === 'function');
    });

    expect(methods).toHaveLength(7);
    expect(methods).toContain('getToolCalls');
    expect(methods).toContain('clearToolCalls');
    expect(methods).toContain('setMockToolResponse');
    expect(methods).toContain('clearMockToolResponse');
    expect(methods).toContain('clearAllMockToolResponses');
    expect(methods).toContain('getRegisteredTools');
    expect(methods).toContain('reset');
  });

  test('should track multiple tool calls correctly', async ({ page }) => {
    const initialCalls = await page.evaluate(() => {
      const testingAPI = navigator.modelContextTesting;
      if (!testingAPI) return 0;
      return testingAPI.getToolCalls().length;
    });

    await page.click('#test-tool-tracking');
    await page.waitForTimeout(500);

    await page.click('#test-tool-tracking');
    await page.waitForTimeout(500);

    const finalCalls = await page.evaluate(() => {
      const testingAPI = navigator.modelContextTesting;
      if (!testingAPI) return 0;
      return testingAPI.getToolCalls().length;
    });

    expect(finalCalls).toBeGreaterThan(initialCalls);
  });

  test('should getRegisteredTools match listTools', async ({ page }) => {
    const toolsMatch = await page.evaluate(() => {
      const testingAPI = navigator.modelContextTesting;
      if (!testingAPI) return false;

      const testingTools = testingAPI.getRegisteredTools();
      const contextTools = navigator.modelContext.listTools();

      return testingTools.length === contextTools.length;
    });

    expect(toolsMatch).toBe(true);
  });

  test('should clear individual mock responses', async ({ page }) => {
    const mockCleared = await page.evaluate(async () => {
      const testingAPI = navigator.modelContextTesting;
      if (!testingAPI) return false;

      const tools = navigator.modelContext.listTools();
      if (tools.length === 0) return false;

      const toolName = tools[0].name;
      const mockResponse = {
        content: [{ type: 'text' as const, text: 'Mock' }],
      };

      testingAPI.setMockToolResponse(toolName, mockResponse);

      const resultWithMock = await navigator.modelContext.executeTool(toolName, {});
      const hasMock =
        resultWithMock.content[0].type === 'text' && resultWithMock.content[0].text === 'Mock';

      testingAPI.clearMockToolResponse(toolName);

      const resultWithoutMock = await navigator.modelContext.executeTool(toolName, {});
      const noMock = !(
        resultWithoutMock.content[0].type === 'text' && resultWithoutMock.content[0].text === 'Mock'
      );

      return hasMock && noMock;
    });

    expect(mockCleared).toBe(true);
  });

  test('should clearAllMockToolResponses work correctly', async ({ page }) => {
    const allCleared = await page.evaluate(async () => {
      const testingAPI = navigator.modelContextTesting;
      if (!testingAPI) return false;

      const tools = navigator.modelContext.listTools();
      if (tools.length < 2) return false;

      const mockResponse = {
        content: [{ type: 'text' as const, text: 'Mock' }],
      };

      testingAPI.setMockToolResponse(tools[0].name, mockResponse);
      testingAPI.setMockToolResponse(tools[1].name, mockResponse);

      testingAPI.clearAllMockToolResponses();

      const result1 = await navigator.modelContext.executeTool(tools[0].name, {});
      const result2 = await navigator.modelContext.executeTool(tools[1].name, {});

      const bothCleared =
        !(result1.content[0].type === 'text' && result1.content[0].text === 'Mock') &&
        !(result2.content[0].type === 'text' && result2.content[0].text === 'Mock');

      return bothCleared;
    });

    expect(allCleared).toBe(true);
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

  test('should throw error when calling createMessage without connected client', async ({
    page,
  }) => {
    await page.click('#test-sampling-call');
    await page.waitForTimeout(500);

    const status = page.locator('#sampling-status');
    await expect(status).toHaveAttribute('data-sampling-call', 'error-no-client');

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('createMessage() threw error'))).toBe(true);
    expect(
      logEntries.some((entry) => entry.includes('Correct error thrown for missing client'))
    ).toBe(true);
  });

  test('should throw error when calling elicitInput without connected client', async ({ page }) => {
    await page.click('#test-elicitation-call');
    await page.waitForTimeout(500);

    const status = page.locator('#sampling-status');
    await expect(status).toHaveAttribute('data-elicitation-call', 'error-no-client');

    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('elicitInput() threw error'))).toBe(true);
    expect(
      logEntries.some((entry) => entry.includes('Correct error thrown for missing client'))
    ).toBe(true);
  });
});
