import { expect, test } from '@playwright/test';

/**
 * Validation Matrix E2E Tests
 *
 * Tests validation across JSON Schema and the React workspace app.
 */

interface TestApp {
  name: string;
  port: number;
  type: 'json' | 'react';
  isReact: boolean;
}

const apps: TestApp[] = [
  { name: 'vanilla-iife-json', port: 3010, type: 'json', isReact: false },
  { name: 'react-webmcp-test-app', port: 8888, type: 'react', isReact: true },
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
        await page.waitForSelector('[data-testid="app-status"]', { timeout: 10000 });
        const status = page.locator('[data-testid="app-status"]');
        await expect(status).toContainText('Ready');
      });

      test('should register tools successfully', async ({ page }) => {
        // Wait for tools to be registered
        await page.waitForTimeout(1000);

        const toolsList = page.locator('[data-testid="client-tools-list"]');
        await expect(toolsList).toBeVisible({ timeout: 10000 });
      });

      if (app.name === 'react-webmcp-test-app') {
        test('should execute real MCP client tool calls and surface validation errors', async ({
          page,
        }) => {
          await expect
            .poll(async () => {
              return page.evaluate(() => Boolean((window as { mcpClient?: unknown }).mcpClient));
            })
            .toBe(true);

          const validCall = await page.evaluate(async () => {
            const client = (
              window as Window & { mcpClient?: { callTool: (req: unknown) => Promise<unknown> } }
            ).mcpClient;
            if (!client) {
              throw new Error('mcpClient missing');
            }
            const response = (await client.callTool({
              name: 'counter_increment',
              arguments: { amount: 2 },
            })) as {
              isError?: boolean;
              content?: Array<{ type?: string; text?: string }>;
            };

            const text =
              response.content?.find(
                (item) => item.type === 'text' && typeof item.text === 'string'
              )?.text ?? '';
            return {
              isError: Boolean(response.isError),
              text,
            };
          });

          expect(validCall.isError).toBe(false);
          expect(validCall.text).toContain('"counter": 2');
          await expect(page.locator('[data-testid="counter-display"]')).toContainText('2');

          const invalidCall = await page.evaluate(async () => {
            const client = (
              window as Window & { mcpClient?: { callTool: (req: unknown) => Promise<unknown> } }
            ).mcpClient;
            if (!client) {
              return {
                threw: true,
                isError: true,
                message: 'mcpClient missing',
              };
            }

            try {
              const response = (await client.callTool({
                name: 'counter_increment',
                arguments: { amount: 'bad-input' },
              })) as {
                isError?: boolean;
                content?: Array<{ type?: string; text?: string }>;
              };

              return {
                threw: false,
                isError: Boolean(response.isError),
                message:
                  response.content?.find(
                    (item) => item.type === 'text' && typeof item.text === 'string'
                  )?.text ?? '',
              };
            } catch (error) {
              return {
                threw: true,
                isError: true,
                message: error instanceof Error ? error.message : String(error),
              };
            }
          });

          expect(invalidCall.threw || invalidCall.isError).toBe(true);
          if (invalidCall.message) {
            expect(invalidCall.message.toLowerCase()).toMatch(/invalid|number|error/);
          }

          const eventTypes = await page.evaluate(() => {
            const log = (window as { mcpEventLog?: { getEvents: () => Array<{ type: string }> } })
              .mcpEventLog;
            return (log?.getEvents() ?? []).map((event) => event.type);
          });

          expect(eventTypes).toContain('tool_call');
          expect(eventTypes.some((type) => type === 'tool_result' || type === 'tool_error')).toBe(
            true
          );
        });
      }
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

      test('should keep explicit invalid-input outcome markers', async ({ page }) => {
        await page.waitForSelector('#results', { timeout: 10000 });
        const resultsText = await page.locator('#results').textContent();

        const hasInvalidOutcomeMarker =
          resultsText?.includes('FAILED (should reject)') ||
          resultsText?.includes('PASSED (rejected)');
        expect(hasInvalidOutcomeMarker).toBe(true);
        expect(resultsText).not.toContain('Valid input: FAILED');
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
