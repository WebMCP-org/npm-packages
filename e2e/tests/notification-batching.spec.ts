import { expect, test } from '@playwright/test';

/**
 * E2E Tests for Notification Batching (Microtask-based)
 *
 * These tests verify that the WebModelContext correctly batches
 * tool/resource/prompt list change notifications using queueMicrotask().
 *
 * Expected behavior:
 * - Multiple synchronous registrations → 1 notification (batched via microtask)
 * - Registrations across separate tasks → 1 notification per task
 */
test.describe('Notification Batching Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Web Model Context API E2E Test');
    // Wait for API to be ready
    await expect(page.locator('#api-status')).toContainText('API: Ready');
  });

  test('should batch multiple synchronous tool registrations into single notification', async ({
    page,
  }) => {
    // Register 10 tools synchronously - should result in only 1 notification
    const result = await page.evaluate(async () => {
      return await window.testApp.testRapidToolRegistration(10);
    });

    expect(result.registeredCount).toBe(10);
    // With microtask batching, all 10 registrations should result in 1 notification
    expect(result.notificationCount).toBe(1);
  });

  test('should batch 50 synchronous tool registrations into single notification', async ({
    page,
  }) => {
    // Stress test with 50 tools
    const result = await page.evaluate(async () => {
      return await window.testApp.testRapidToolRegistration(50);
    });

    expect(result.registeredCount).toBe(50);
    expect(result.notificationCount).toBe(1);
  });

  test('should batch 100 synchronous tool registrations into single notification', async ({
    page,
  }) => {
    // Stress test with 100 tools (simulates React app with many components mounting)
    const result = await page.evaluate(async () => {
      return await window.testApp.testRapidToolRegistration(100);
    });

    expect(result.registeredCount).toBe(100);
    expect(result.notificationCount).toBe(1);
  });

  test('should send separate notifications for registrations in different tasks', async ({
    page,
  }) => {
    // Register 5 tools across separate setTimeout tasks
    // Each task should trigger its own notification
    const result = await page.evaluate(async () => {
      return await window.testApp.testMultiTaskToolRegistration(5);
    });

    expect(result.registeredCount).toBe(5);
    // Each registration in a separate task should trigger its own notification
    expect(result.notificationCount).toBe(5);
  });

  test('should batch within each task but not across tasks', async ({ page }) => {
    // Test mixed scenario: multiple phases with synchronous registrations in each
    const result = await page.evaluate(async () => {
      return await window.testApp.testMixedRegistrationBatching();
    });

    // Each phase should have exactly 1 notification despite multiple registrations
    expect(result.phase1Notifications).toBe(1); // 5 tools → 1 notification
    expect(result.phase2Notifications).toBe(1); // 3 tools → 1 notification
    expect(result.phase3Notifications).toBe(1); // 2 tools → 1 notification
  });

  test('should handle rapid register/unregister cycles', async ({ page }) => {
    const result = await page.evaluate(async () => {
      let notificationCount = 0;

      if ('modelContextTesting' in navigator && navigator.modelContextTesting) {
        navigator.modelContextTesting.registerToolsChangedCallback(() => {
          notificationCount++;
        });
      }

      // Register and immediately unregister multiple tools synchronously
      const registrations: Array<{ unregister: () => void }> = [];

      // First, register 5 tools
      for (let i = 0; i < 5; i++) {
        registrations.push(
          navigator.modelContext.registerTool({
            name: `rapidCycleTool_${i}`,
            description: `Rapid cycle test tool ${i}`,
            inputSchema: { type: 'object', properties: {} },
            async execute() {
              return { content: [{ type: 'text', text: 'test' }] };
            },
          })
        );
      }

      // Then immediately unregister all 5
      registrations.forEach((reg) => {
        reg.unregister();
      });

      // Wait for microtask to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      return { notificationCount };
    });

    // All registrations + all unregistrations should batch into 2 notifications
    // (1 for all registrations, 1 for all unregistrations)
    // Note: Due to the current implementation, registrations and unregistrations
    // each schedule their own microtask, but within the same synchronous block
    // they share the same pending flag, so we might get just 1 or 2 notifications
    expect(result.notificationCount).toBeLessThanOrEqual(2);
  });

  test('should correctly batch provideContext calls', async ({ page }) => {
    const result = await page.evaluate(async () => {
      let notificationCount = 0;

      if ('modelContextTesting' in navigator && navigator.modelContextTesting) {
        navigator.modelContextTesting.registerToolsChangedCallback(() => {
          notificationCount++;
        });
      }

      // Multiple provideContext calls in the same task should batch
      navigator.modelContext.provideContext({
        tools: [
          {
            name: 'batchProvide1',
            description: 'test',
            inputSchema: { type: 'object', properties: {} },
            async execute() {
              return { content: [{ type: 'text', text: 'test' }] };
            },
          },
        ],
      });

      navigator.modelContext.provideContext({
        tools: [
          {
            name: 'batchProvide2',
            description: 'test',
            inputSchema: { type: 'object', properties: {} },
            async execute() {
              return { content: [{ type: 'text', text: 'test' }] };
            },
          },
        ],
      });

      navigator.modelContext.provideContext({
        tools: [
          {
            name: 'batchProvide3',
            description: 'test',
            inputSchema: { type: 'object', properties: {} },
            async execute() {
              return { content: [{ type: 'text', text: 'test' }] };
            },
          },
        ],
      });

      // Wait for microtask
      await new Promise((resolve) => setTimeout(resolve, 50));

      return { notificationCount };
    });

    // All 3 provideContext calls should batch into 1 notification
    expect(result.notificationCount).toBe(1);
  });

  test('should verify notification count is dramatically reduced compared to registration count', async ({
    page,
  }) => {
    // This test verifies the core value proposition: 100 registrations → 1 notification
    const result = await page.evaluate(async () => {
      let notificationCount = 0;

      if ('modelContextTesting' in navigator && navigator.modelContextTesting) {
        navigator.modelContextTesting.registerToolsChangedCallback(() => {
          notificationCount++;
        });
      }

      const registrations: Array<{ unregister: () => void }> = [];

      // Simulate a React app mounting with 100 useWebMCP hooks
      for (let i = 0; i < 100; i++) {
        registrations.push(
          navigator.modelContext.registerTool({
            name: `reactHookTool_${i}`,
            description: `Simulated React hook tool ${i}`,
            inputSchema: { type: 'object', properties: {} },
            async execute() {
              return { content: [{ type: 'text', text: 'test' }] };
            },
          })
        );
      }

      // Wait for microtask
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Cleanup
      registrations.forEach((reg) => {
        reg.unregister();
      });

      // Wait for cleanup notifications
      await new Promise((resolve) => setTimeout(resolve, 50));

      return {
        registrationCount: 100,
        notificationCount,
        reduction: Math.round((1 - notificationCount / 100) * 100),
      };
    });

    // Verify we got dramatic reduction
    expect(result.notificationCount).toBeLessThanOrEqual(2); // 1 for register, 1 for unregister
    expect(result.reduction).toBeGreaterThanOrEqual(98); // At least 98% reduction
  });
});

test.describe('Notification Batching - Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#api-status')).toContainText('API: Ready');
  });

  test('should handle single registration correctly (no batching needed)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      let notificationCount = 0;

      if ('modelContextTesting' in navigator && navigator.modelContextTesting) {
        navigator.modelContextTesting.registerToolsChangedCallback(() => {
          notificationCount++;
        });
      }

      const reg = navigator.modelContext.registerTool({
        name: 'singleTool',
        description: 'Single tool test',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'test' }] };
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      reg.unregister();

      await new Promise((resolve) => setTimeout(resolve, 50));

      return { notificationCount };
    });

    // Single registration should still work - 1 for register, 1 for unregister
    expect(result.notificationCount).toBe(2);
  });

  test('should handle clearContext batching', async ({ page }) => {
    const result = await page.evaluate(async () => {
      let notificationCount = 0;

      // Register some tools first
      for (let i = 0; i < 5; i++) {
        navigator.modelContext.registerTool({
          name: `clearContextTool_${i}`,
          description: 'test',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'test' }] };
          },
        });
      }

      // Wait for registration notifications
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Now start tracking
      if ('modelContextTesting' in navigator && navigator.modelContextTesting) {
        navigator.modelContextTesting.registerToolsChangedCallback(() => {
          notificationCount++;
        });
      }

      // Call clearContext multiple times synchronously (edge case)
      navigator.modelContext.clearContext();
      navigator.modelContext.clearContext();
      navigator.modelContext.clearContext();

      await new Promise((resolve) => setTimeout(resolve, 50));

      return { notificationCount };
    });

    // Multiple clearContext calls should batch to 1 notification
    expect(result.notificationCount).toBe(1);
  });
});
