import { expect, test } from '@playwright/test';

test.describe('Codemode WebMCP E2E', () => {
  test('uses modelContextTesting to build and execute a codemode tool', async ({ page }) => {
    await page.goto('/codemode-webmcp.html');

    await expect(page.locator('#codemode-status')).toHaveAttribute('data-status', 'ready', {
      timeout: 15000,
    });

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
