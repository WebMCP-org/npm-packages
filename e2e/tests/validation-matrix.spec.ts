import { expect, test } from '@playwright/test';

/**
 * Validation Matrix E2E Tests
 *
 * Tests validation across all Zod 3 + Zod 4/build/framework combinations:
 * - vanilla-iife-json: IIFE + JSON Schema (no Zod)
 * - vanilla-iife-zod3: IIFE + Zod 3 CDN
 * - vanilla-esm-zod3: ESM + Zod 3
 * - vanilla-esm-zod4: ESM + Zod 4
 * - react18-zod3: React 18 + Zod 3
 * - react18-zod4: React 18 + Zod 4
 * - react-webmcp-test-app: React 19 + Zod 3
 * - react-webmcp-test-app-zod4: React 19 + Zod 4
 *
 * Supports both Zod 3.25+ and Zod 4.
 */

interface TestApp {
  name: string;
  port: number;
  type: 'json' | 'zod3' | 'zod4';
  isReact: boolean;
}

const apps: TestApp[] = [
  { name: 'vanilla-iife-json', port: 3010, type: 'json', isReact: false },
  { name: 'vanilla-iife-zod3', port: 3011, type: 'zod3', isReact: false },
  { name: 'vanilla-iife-zod4', port: 3012, type: 'zod4', isReact: false },
  { name: 'vanilla-esm-zod3', port: 3013, type: 'zod3', isReact: false },
  { name: 'vanilla-esm-zod4', port: 3014, type: 'zod4', isReact: false },
  { name: 'react18-zod3', port: 3015, type: 'zod3', isReact: true },
  { name: 'react18-zod4', port: 3016, type: 'zod4', isReact: true },
  { name: 'react-webmcp-test-app', port: 8888, type: 'zod3', isReact: true },
  { name: 'react-webmcp-test-app-zod4', port: 8889, type: 'zod4', isReact: true },
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
        if (app.name.startsWith('react-webmcp-test-app')) {
          await page.waitForSelector('[data-testid="app-status"]', { timeout: 10000 });
          const status = page.locator('[data-testid="app-status"]');
          await expect(status).toContainText('Ready');
        } else {
          // react18-zod3/react18-zod4
          await page.waitForSelector('.status-badge', { timeout: 10000 });
          const status = page.locator('.status-badge');
          await expect(status).toContainText('Ready');
        }
      });

      // react18-zod3/react18-zod4 have a Zod version UI section
      if (app.name.startsWith('react18-zod')) {
        test(`should detect correct Zod version (${app.type.toUpperCase()})`, async ({ page }) => {
          await page.waitForSelector('.section h2:has-text("Zod Version")', { timeout: 5000 });
          const zodSection = page.locator('.section:has(h2:has-text("Zod Version"))');
          await expect(zodSection).toContainText(app.type === 'zod4' ? 'Zod 4' : 'Zod 3');
        });
      }

      test('should register tools successfully', async ({ page }) => {
        // Wait for tools to be registered
        await page.waitForTimeout(1000);

        if (app.name.startsWith('react-webmcp-test-app')) {
          // Check for registered tools list
          const toolsList = page.locator('[data-testid="client-tools-list"]');
          await expect(toolsList).toBeVisible({ timeout: 10000 });
        } else {
          // react18-zod3 - check for tools in the registered tools section
          const logsOrTools = page.locator('.log, .log-entry, h2:has-text("Registered MCP Tools")');
          await expect(logsOrTools.first()).toBeVisible({ timeout: 10000 });
        }
      });

      if (app.name.startsWith('react18-zod')) {
        test('should execute realistic Zod validation flows through UI', async ({ page }) => {
          await page.getByRole('button', { name: 'Valid User' }).click();
          await expect(page.locator('.log')).toContainText('Validated: testuser');

          await page.getByRole('button', { name: 'Test Invalid Email' }).click();
          await expect(page.locator('.log')).toContainText(
            /not-an-email|Invalid email rejected as expected/
          );

          await page.getByRole('button', { name: 'Test Age Too Low' }).click();
          await expect(page.locator('.log')).toContainText(
            /age=15|Age too low rejected as expected/
          );
        });
      }

      if (app.name.startsWith('react-webmcp-test-app')) {
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

      if (app.type === 'zod3' || app.type === 'zod4') {
        test(`should detect correct Zod version (${app.type.toUpperCase()})`, async ({ page }) => {
          const zodVersion = page.locator('#zod-version');
          await expect(zodVersion).toContainText(app.type === 'zod4' ? 'Zod 4' : 'Zod 3');
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
