import { expect, test } from '@playwright/test';

test.describe('MCPIframeElement E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the host page
    await page.goto('/mcp-iframe-host.html');

    // Wait for the iframe to connect
    await page.waitForSelector('[data-status="ready"]', { timeout: 10000 });
  });

  test('should connect to iframe MCP server', async ({ page }) => {
    // Verify connection status
    const status = page.locator('#connection-status');
    await expect(status).toHaveAttribute('data-status', 'ready');
    await expect(status).toContainText('Connected');
  });

  test('should expose tools from iframe', async ({ page }) => {
    // Check exposed tools
    const toolsEl = page.locator('#exposed-tools');
    await expect(toolsEl).toHaveAttribute('data-count', '3');

    // Verify tool names are prefixed
    const toolsText = await toolsEl.textContent();
    expect(toolsText).toContain('child-iframe_add');
    expect(toolsText).toContain('child-iframe_multiply');
    expect(toolsText).toContain('child-iframe_greet');
  });

  test('should call add tool and get result', async ({ page }) => {
    // Click the add button
    await page.click('#test-add');

    // Wait for result
    await page.waitForSelector('#tool-result[data-result]', { timeout: 5000 });

    // Verify result
    const resultEl = page.locator('#tool-result');
    const result = await resultEl.getAttribute('data-result');
    expect(result).toBe('8'); // 5 + 3 = 8
  });

  test('should call multiply tool and get result', async ({ page }) => {
    // Click the multiply button
    await page.click('#test-multiply');

    // Wait for result
    await page.waitForSelector('#tool-result[data-result]', { timeout: 5000 });

    // Verify result
    const resultEl = page.locator('#tool-result');
    const result = await resultEl.getAttribute('data-result');
    expect(result).toBe('28'); // 4 * 7 = 28
  });

  test('should call greet tool and get result', async ({ page }) => {
    // Click the greet button
    await page.click('#test-greet');

    // Wait for result
    await page.waitForSelector('#tool-result[data-result]', { timeout: 5000 });

    // Verify result
    const resultEl = page.locator('#tool-result');
    const result = await resultEl.getAttribute('data-result');
    expect(result).toBe('Hello, World!');
  });

  test('should verify tools are callable via modelContext', async ({ page }) => {
    // Use page.evaluate to call the tool programmatically
    const result = await page.evaluate(async () => {
      return await window.mcpIframeHost.callTool('add', { a: 10, b: 20 });
    });

    // Verify the result structure
    expect(result).toHaveProperty('content');
    const content = (result as { content: Array<{ type: string; text: string }> }).content;
    const firstContent = content[0];
    expect(firstContent).toBeDefined();
    if (!firstContent) {
      throw new Error('Tool response content was empty');
    }
    expect(firstContent.type).toBe('text');
    expect(firstContent.text).toBe('30');
  });
});

test.describe('MCP Iframe Client E2E Tests', () => {
  test('should connect and call tool via MCP client', async ({ page }) => {
    await page.goto('/mcp-iframe-client.html');
    await page.waitForSelector('#client-status[data-status="pass"]', { timeout: 15000 });

    const status = page.locator('#client-status');
    await expect(status).toHaveAttribute('data-status', 'pass');

    const tools = page.locator('#client-tools');
    await expect(tools).toContainText('add');

    const result = page.locator('#client-result');
    await expect(result).toHaveAttribute('data-result', '5');
  });
});
