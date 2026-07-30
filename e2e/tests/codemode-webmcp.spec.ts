import { expect, test } from '@playwright/test';

test.describe('Codemode WebMCP E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (
        window as Window & {
          __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
        }
      ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ = document.modelContext;
    });
  });

  test('builds and executes a codemode tool from document.modelContext', async ({ page }) => {
    await page.goto('/codemode-webmcp.html');

    await expect(page.locator('#codemode-status')).toHaveAttribute('data-status', 'ready', {
      timeout: 15000,
    });

    const runtime = await page.locator('#codemode-runtime').getAttribute('data-runtime');
    expect(['native', 'polyfill']).toContain(runtime);

    if (test.info().project.name === 'chrome-m152-webmcp') {
      expect(runtime).toBe('native');
    }

    await expect(page.locator('#codemode-status')).toHaveAttribute('data-runtime', runtime ?? '');

    await expect(page.locator('#codemode-tools')).toHaveAttribute('data-count', '2');
    await expect(page.locator('#codemode-tools')).toContainText('sumNumbers');
    await expect(page.locator('#codemode-tools')).toContainText('greetPerson');

    await expect(page.locator('#codemode-description')).toContainText('type SumNumbersInput = {');
    await expect(page.locator('#codemode-description')).toContainText(
      '@param input.a - First number'
    );
    await expect(page.locator('#codemode-description')).toContainText('type GreetPersonInput = {');

    await expect(page.locator('#codemode-result')).toHaveAttribute('data-status', 'ready');
    await expect(page.locator('#codemode-result')).toContainText('"total": 12');
    await expect(page.locator('#codemode-result')).toContainText('"greeting": "Hello, WebMCP!"');

    await expect(page.locator('#codemode-calls')).toHaveAttribute('data-count', '2');
    await expect(page.locator('#codemode-calls')).toContainText('"toolName": "sumNumbers"');
    await expect(page.locator('#codemode-calls')).toContainText('"toolName": "greetPerson"');
  });
});
