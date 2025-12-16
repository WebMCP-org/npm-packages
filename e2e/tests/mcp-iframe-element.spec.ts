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

  test('should expose resources from iframe', async ({ page }) => {
    // Check exposed resources
    const resourcesEl = page.locator('#exposed-resources');
    await expect(resourcesEl).toHaveAttribute('data-count', '2');

    // Verify resource URIs are prefixed
    const resourcesText = await resourcesEl.textContent();
    expect(resourcesText).toContain('child-iframe_iframe://config');
    expect(resourcesText).toContain('child-iframe_iframe://timestamp');
  });

  test('should expose prompts from iframe', async ({ page }) => {
    // Check exposed prompts
    const promptsEl = page.locator('#exposed-prompts');
    await expect(promptsEl).toHaveAttribute('data-count', '2');

    // Verify prompt names are prefixed
    const promptsText = await promptsEl.textContent();
    expect(promptsText).toContain('child-iframe_summarize');
    expect(promptsText).toContain('child-iframe_translate');
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

  test('should read config resource from iframe', async ({ page }) => {
    // Click the read config button
    await page.click('#test-read-config');

    // Wait for result
    await page.waitForSelector('#resource-result[data-result]', { timeout: 5000 });

    // Verify result contains expected config
    const resultEl = page.locator('#resource-result');
    const result = await resultEl.getAttribute('data-result');
    expect(result).toContain('version');
    expect(result).toContain('1.0.0');
    expect(result).toContain('iframe-child');
  });

  test('should read timestamp resource from iframe', async ({ page }) => {
    // Click the read timestamp button
    await page.click('#test-read-timestamp');

    // Wait for result
    await page.waitForSelector('#resource-result[data-result]', { timeout: 5000 });

    // Verify result is an ISO timestamp
    const resultEl = page.locator('#resource-result');
    const result = await resultEl.getAttribute('data-result');
    // ISO timestamp format check
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('should get summarize prompt from iframe', async ({ page }) => {
    // Click the summarize button
    await page.click('#test-summarize');

    // Wait for result
    await page.waitForSelector('#prompt-result[data-result]', { timeout: 5000 });

    // Verify result contains expected prompt
    const resultEl = page.locator('#prompt-result');
    const result = await resultEl.getAttribute('data-result');
    expect(result).toContain('summarize');
    expect(result).toContain('test text');
  });

  test('should get translate prompt from iframe', async ({ page }) => {
    // Click the translate button
    await page.click('#test-translate');

    // Wait for result
    await page.waitForSelector('#prompt-result[data-result]', { timeout: 5000 });

    // Verify result contains expected prompt
    const resultEl = page.locator('#prompt-result');
    const result = await resultEl.getAttribute('data-result');
    expect(result).toContain('translate');
    expect(result).toContain('Spanish');
    expect(result).toContain('Hello, World!');
  });

  test('should verify tools are callable via modelContext', async ({ page }) => {
    // Use page.evaluate to call the tool programmatically
    const result = await page.evaluate(async () => {
      return await window.mcpIframeHost.callTool('add', { a: 10, b: 20 });
    });

    // Verify the result structure
    expect(result).toHaveProperty('content');
    const content = (result as { content: Array<{ type: string; text: string }> }).content;
    expect(content[0].type).toBe('text');
    expect(content[0].text).toBe('30');
  });

  test('should have mcp-iframe element with correct properties', async ({ page }) => {
    // Check the element's properties via JavaScript
    const elementInfo = await page.evaluate(() => {
      const el = window.mcpIframeHost.getMcpIframe();
      return {
        ready: el.ready,
        exposedToolsCount: el.exposedTools.length,
        exposedResourcesCount: el.exposedResources.length,
        exposedPromptsCount: el.exposedPrompts.length,
        itemPrefix: el.itemPrefix,
      };
    });

    expect(elementInfo.ready).toBe(true);
    expect(elementInfo.exposedToolsCount).toBe(3);
    expect(elementInfo.exposedResourcesCount).toBe(2);
    expect(elementInfo.exposedPromptsCount).toBe(2);
    expect(elementInfo.itemPrefix).toBe('child-iframe_');
  });
});
