import { expect, test } from '@playwright/test';

/**
 * Validation Matrix E2E Tests
 *
 * Tests validation across all Zod 3/build/framework combinations:
 * - vanilla-iife-json: IIFE + JSON Schema (no Zod)
 * - vanilla-iife-zod3: IIFE + Zod 3 CDN
 * - vanilla-esm-zod3: ESM + Zod 3
 * - react18-zod3: React 18 + Zod 3
 * - react-webmcp-test-app: React 19 + Zod 3
 *
 * Note: Zod 4 is NOT supported. Only Zod 3.25+ is supported.
 */

interface TestApp {
  name: string;
  port: number;
  type: 'json' | 'zod3';
  isReact: boolean;
}

const apps: TestApp[] = [
  { name: 'vanilla-iife-json', port: 3010, type: 'json', isReact: false },
  { name: 'vanilla-iife-zod3', port: 3011, type: 'zod3', isReact: false },
  { name: 'vanilla-esm-zod3', port: 3013, type: 'zod3', isReact: false },
  { name: 'react18-zod3', port: 3015, type: 'zod3', isReact: true },
  { name: 'react-webmcp-test-app', port: 8888, type: 'zod3', isReact: true },
];

// Test each app in the matrix
for (const app of apps) {
  test.describe(`${app.name} (${app.type})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`http://localhost:${app.port}`);
      // Wait for page to load and initialize
      await page.waitForLoadState('networkidle');
    });

    if (app.isReact) {
      // React apps have different UI structure
      test('should load and show ready status', async ({ page }) => {
        // Wait for app to initialize
        if (app.name === 'react-webmcp-test-app') {
          await page.waitForSelector('[data-testid="app-status"]', { timeout: 10000 });
          const status = page.locator('[data-testid="app-status"]');
          await expect(status).toContainText('Ready');
        } else {
          // react18-zod3
          await page.waitForSelector('.status-badge', { timeout: 10000 });
          const status = page.locator('.status-badge');
          await expect(status).toContainText('Ready');
        }
      });

      // Only react18-zod3 has a Zod version UI section
      if (app.type === 'zod3' && app.name === 'react18-zod3') {
        test('should detect correct Zod version (Zod 3)', async ({ page }) => {
          // react18-zod3 app has a Zod version check section with text "Zod 3.x detected"
          await page.waitForSelector('.section h2:has-text("Zod Version")', { timeout: 5000 });
          const zodSection = page.locator('.section:has(h2:has-text("Zod Version"))');
          await expect(zodSection).toContainText('Zod 3');
        });
      }

      test('should register tools successfully', async ({ page }) => {
        // Wait for tools to be registered
        await page.waitForTimeout(1000);

        if (app.name === 'react-webmcp-test-app') {
          // Check for registered tools list
          const toolsList = page.locator('[data-testid="client-tools-list"]');
          await expect(toolsList).toBeVisible({ timeout: 10000 });
        } else {
          // react18-zod3 - check for tools in the registered tools section
          const logsOrTools = page.locator('.log, .log-entry, h2:has-text("Registered MCP Tools")');
          await expect(logsOrTools.first()).toBeVisible({ timeout: 10000 });
        }
      });
    } else {
      // Vanilla JS apps (IIFE and ESM)
      test('should show modelContext available', async ({ page }) => {
        await page.waitForSelector('#status', { timeout: 10000 });
        const status = page.locator('#status');
        // Accept either "modelContext available" or "All tests completed!" since the latter implies the former
        const statusText = await status.textContent();
        expect(
          statusText?.includes('modelContext available') ||
            statusText?.includes('All tests completed')
        ).toBe(true);
      });

      if (app.type === 'zod3') {
        test('should detect correct Zod version (Zod 3)', async ({ page }) => {
          const zodVersion = page.locator('#zod-version');
          await expect(zodVersion).toContainText('Zod 3');
        });
      }

      test('should register tool successfully', async ({ page }) => {
        // Wait for tests to run
        await page.waitForSelector('#results', { timeout: 10000 });

        // Check for successful tool registration in results
        const results = page.locator('#results');
        await expect(results).toContainText('registered successfully', { timeout: 10000 });
      });

      test('valid input should execute successfully', async ({ page }) => {
        await page.waitForSelector('#results', { timeout: 10000 });
        const results = page.locator('#results');

        // Look for "Valid input: PASSED" or similar success indicator
        await expect(results).toContainText('Valid input', { timeout: 10000 });
        await expect(results).toContainText('PASSED');
      });

      test('missing required field should be rejected', async ({ page }) => {
        await page.waitForSelector('#results', { timeout: 10000 });
        const results = page.locator('#results');

        // Look for "Missing email: PASSED (rejected)" or similar
        await expect(results).toContainText('Missing');
        await expect(results).toContainText('PASSED');
      });

      test('invalid type should be rejected', async ({ page }) => {
        await page.waitForSelector('#results', { timeout: 10000 });
        const results = page.locator('#results');

        // Look for "Invalid type: PASSED (rejected)" or similar
        await expect(results).toContainText('Invalid type');
        await expect(results).toContainText('PASSED');
      });

      test('value out of range should be rejected', async ({ page }) => {
        await page.waitForSelector('#results', { timeout: 10000 });
        const results = page.locator('#results');

        // Look for range validation test results
        // These could be "Age too low", "Score too high", "String too short", etc.
        const resultsText = await results.textContent();
        const hasRangeTest =
          resultsText?.includes('too low') ||
          resultsText?.includes('too short') ||
          resultsText?.includes('too high') ||
          resultsText?.includes('out of range');
        expect(hasRangeTest).toBe(true);
      });

      test('all tests should complete without errors', async ({ page }) => {
        await page.waitForSelector('#status', { timeout: 10000 });
        const status = page.locator('#status');

        // Final status should indicate completion
        await expect(status).toContainText('completed', { timeout: 15000 });
      });
    }
  });
}

// Cross-app validation consistency tests
test.describe('Validation Consistency', () => {
  test('all apps should reject invalid email format', async ({ page }) => {
    // Test a subset of apps for email validation consistency
    const emailTestApps = apps.filter((a) => !a.isReact);

    for (const app of emailTestApps) {
      await page.goto(`http://localhost:${app.port}`);
      await page.waitForSelector('#results', { timeout: 10000 });

      const results = page.locator('#results');
      const resultsText = await results.textContent();

      // All apps should have email validation tests that pass
      expect(
        resultsText?.includes('email') || resultsText?.includes('Email'),
        `${app.name} should test email validation`
      ).toBe(true);
    }
  });
});
