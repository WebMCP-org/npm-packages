import { expect, test } from '@playwright/test';

test.describe('MCP Tab Transport E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('MCP Tab Transport E2E Test');
  });

  test('should load the test application', async ({ page }) => {
    // Verify page loaded correctly
    await expect(page.locator('#server-status')).toHaveText('Server: Not Started');
    await expect(page.locator('#client-status')).toHaveText('Client: Not Connected');
    await expect(page.locator('#counter-display')).toHaveText('0');

    // Verify initial button states
    await expect(page.locator('#start-server')).toBeEnabled();
    await expect(page.locator('#stop-server')).toBeDisabled();
    await expect(page.locator('#connect-client')).toBeDisabled();
    await expect(page.locator('#disconnect-client')).toBeDisabled();
  });

  test('should start MCP server successfully', async ({ page }) => {
    // Start the server
    await page.click('#start-server');

    // Wait for server to start
    await expect(page.locator('#server-status')).toHaveText('Server: Running', {
      timeout: 5000,
    });
    await expect(page.locator('#server-status')).toHaveAttribute('data-status', 'running');

    // Verify button states changed
    await expect(page.locator('#start-server')).toBeDisabled();
    await expect(page.locator('#stop-server')).toBeEnabled();
    await expect(page.locator('#connect-client')).toBeEnabled();

    // Verify log entry
    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('MCP Server started successfully'))).toBe(
      true
    );
  });

  test('should connect MCP client to server', async ({ page }) => {
    // Start server
    await page.click('#start-server');
    await expect(page.locator('#server-status')).toHaveText('Server: Running', {
      timeout: 5000,
    });

    // Connect client
    await page.click('#connect-client');

    // Wait for client to connect
    await expect(page.locator('#client-status')).toHaveText('Client: Connected', {
      timeout: 5000,
    });
    await expect(page.locator('#client-status')).toHaveAttribute('data-status', 'connected');

    // Verify button states
    await expect(page.locator('#connect-client')).toBeDisabled();
    await expect(page.locator('#disconnect-client')).toBeEnabled();
    await expect(page.locator('#list-tools')).toBeEnabled();
    await expect(page.locator('#increment')).toBeEnabled();

    // Verify log entry
    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('MCP Client connected successfully'))).toBe(
      true
    );
  });

  test('should list available tools', async ({ page }) => {
    // Setup: Start server and connect client
    await page.click('#start-server');
    await expect(page.locator('#server-status')).toHaveText('Server: Running', {
      timeout: 5000,
    });
    await page.click('#connect-client');
    await expect(page.locator('#client-status')).toHaveText('Client: Connected', {
      timeout: 5000,
    });

    // List tools
    await page.click('#list-tools');

    // Wait for tools to be listed in log
    await page.waitForTimeout(1000); // Give time for async operation

    // Verify all tools are listed
    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Found 4 tools'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('incrementCounter'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('decrementCounter'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('resetCounter'))).toBe(true);
    expect(logEntries.some((entry) => entry.includes('getCounter'))).toBe(true);
  });

  test('should increment counter via MCP tool call', async ({ page }) => {
    // Setup: Start server and connect client
    await page.click('#start-server');
    await expect(page.locator('#server-status')).toHaveText('Server: Running', {
      timeout: 5000,
    });
    await page.click('#connect-client');
    await expect(page.locator('#client-status')).toHaveText('Client: Connected', {
      timeout: 5000,
    });

    // Verify initial counter value
    await expect(page.locator('#counter-display')).toHaveText('0');

    // Increment counter
    await page.click('#increment');

    // Wait for counter to update
    await expect(page.locator('#counter-display')).toHaveText('1', { timeout: 3000 });
    await expect(page.locator('#counter-display')).toHaveAttribute('data-counter', '1');

    // Verify log entry
    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Counter incremented to 1'))).toBe(true);
  });

  test('should decrement counter via MCP tool call', async ({ page }) => {
    // Setup: Start server and connect client
    await page.click('#start-server');
    await expect(page.locator('#server-status')).toHaveText('Server: Running', {
      timeout: 5000,
    });
    await page.click('#connect-client');
    await expect(page.locator('#client-status')).toHaveText('Client: Connected', {
      timeout: 5000,
    });

    // First increment to 2
    await page.click('#increment');
    await expect(page.locator('#counter-display')).toHaveText('1', { timeout: 3000 });
    await page.click('#increment');
    await expect(page.locator('#counter-display')).toHaveText('2', { timeout: 3000 });

    // Then decrement
    await page.click('#decrement');
    await expect(page.locator('#counter-display')).toHaveText('1', { timeout: 3000 });

    // Verify log entry
    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Counter decremented to 1'))).toBe(true);
  });

  test('should reset counter via MCP tool call', async ({ page }) => {
    // Setup: Start server and connect client
    await page.click('#start-server');
    await expect(page.locator('#server-status')).toHaveText('Server: Running', {
      timeout: 5000,
    });
    await page.click('#connect-client');
    await expect(page.locator('#client-status')).toHaveText('Client: Connected', {
      timeout: 5000,
    });

    // Increment counter multiple times
    await page.click('#increment');
    await page.click('#increment');
    await page.click('#increment');
    await expect(page.locator('#counter-display')).toHaveText('3', { timeout: 3000 });

    // Reset counter
    await page.click('#reset');
    await expect(page.locator('#counter-display')).toHaveText('0', { timeout: 3000 });

    // Verify log entry
    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Counter reset to 0'))).toBe(true);
  });

  test('should get counter value via MCP tool call', async ({ page }) => {
    // Setup: Start server and connect client
    await page.click('#start-server');
    await expect(page.locator('#server-status')).toHaveText('Server: Running', {
      timeout: 5000,
    });
    await page.click('#connect-client');
    await expect(page.locator('#client-status')).toHaveText('Client: Connected', {
      timeout: 5000,
    });

    // Set counter to a specific value
    await page.click('#increment');
    await page.click('#increment');
    await expect(page.locator('#counter-display')).toHaveText('2', { timeout: 3000 });

    // Get counter value
    await page.click('#get-counter');

    // Verify log entry
    await page.waitForTimeout(1000);
    const logEntries = await page.locator('#log .log-entry').allTextContents();
    expect(logEntries.some((entry) => entry.includes('Current counter value: 2'))).toBe(true);
  });

  test('should handle multiple rapid tool calls', async ({ page }) => {
    // Setup: Start server and connect client
    await page.click('#start-server');
    await expect(page.locator('#server-status')).toHaveText('Server: Running', {
      timeout: 5000,
    });
    await page.click('#connect-client');
    await expect(page.locator('#client-status')).toHaveText('Client: Connected', {
      timeout: 5000,
    });

    // Rapidly increment multiple times
    for (let i = 0; i < 5; i++) {
      await page.click('#increment');
    }

    // Wait for all operations to complete
    await expect(page.locator('#counter-display')).toHaveText('5', { timeout: 5000 });
  });

  test('should disconnect and reconnect client', async ({ page }) => {
    // Setup: Start server and connect client
    await page.click('#start-server');
    await expect(page.locator('#server-status')).toHaveText('Server: Running', {
      timeout: 5000,
    });
    await page.click('#connect-client');
    await expect(page.locator('#client-status')).toHaveText('Client: Connected', {
      timeout: 5000,
    });

    // Increment counter
    await page.click('#increment');
    await expect(page.locator('#counter-display')).toHaveText('1', { timeout: 3000 });

    // Disconnect client
    await page.click('#disconnect-client');
    await expect(page.locator('#client-status')).toHaveText('Client: Not Connected', {
      timeout: 5000,
    });
    await expect(page.locator('#increment')).toBeDisabled();

    // Reconnect client
    await page.click('#connect-client');
    await expect(page.locator('#client-status')).toHaveText('Client: Connected', {
      timeout: 5000,
    });

    // Counter should still be at 1 (state persisted on server)
    await expect(page.locator('#counter-display')).toHaveText('1');

    // Should be able to use tools again
    await page.click('#increment');
    await expect(page.locator('#counter-display')).toHaveText('2', { timeout: 3000 });
  });

  test('should stop and restart server', async ({ page }) => {
    // Setup: Start server and connect client
    await page.click('#start-server');
    await expect(page.locator('#server-status')).toHaveText('Server: Running', {
      timeout: 5000,
    });
    await page.click('#connect-client');
    await expect(page.locator('#client-status')).toHaveText('Client: Connected', {
      timeout: 5000,
    });

    // Set counter value
    await page.click('#increment');
    await page.click('#increment');
    await expect(page.locator('#counter-display')).toHaveText('2', { timeout: 3000 });

    // Stop server (should also disconnect client)
    await page.click('#stop-server');
    await expect(page.locator('#server-status')).toHaveText('Server: Not Started', {
      timeout: 5000,
    });
    await expect(page.locator('#client-status')).toHaveText('Client: Not Connected', {
      timeout: 5000,
    });

    // Restart server
    await page.click('#start-server');
    await expect(page.locator('#server-status')).toHaveText('Server: Running', {
      timeout: 5000,
    });

    // Reconnect client
    await page.click('#connect-client');
    await expect(page.locator('#client-status')).toHaveText('Client: Connected', {
      timeout: 5000,
    });

    // Counter should still show 2 (UI state persisted, but server state is new)
    // Note: In this implementation, counter state is global, not per-server instance
    await expect(page.locator('#counter-display')).toHaveText('2');
  });

  test('should use testApp API for programmatic testing', async ({ page }) => {
    // Use the exposed testApp API
    const serverStarted = await page.evaluate(async () => {
      const testApp = (window as any).testApp;
      await testApp.startServer();
      return testApp.getServerStatus();
    });

    expect(serverStarted).toBe(true);
    await expect(page.locator('#server-status')).toHaveText('Server: Running');

    const clientConnected = await page.evaluate(async () => {
      const testApp = (window as any).testApp;
      await testApp.connectClient();
      return testApp.getClientStatus();
    });

    expect(clientConnected).toBe(true);
    await expect(page.locator('#client-status')).toHaveText('Client: Connected');

    // Call tools programmatically
    await page.evaluate(async () => {
      const testApp = (window as any).testApp;
      await testApp.callTool('incrementCounter');
      await testApp.callTool('incrementCounter');
      await testApp.callTool('incrementCounter');
    });

    const counterValue = await page.evaluate(() => {
      const testApp = (window as any).testApp;
      return testApp.getCounter();
    });

    expect(counterValue).toBe(3);
    await expect(page.locator('#counter-display')).toHaveText('3');
  });
});
