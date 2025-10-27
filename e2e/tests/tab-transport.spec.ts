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
