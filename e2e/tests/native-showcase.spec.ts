import { expect, test } from '@playwright/test';

/**
 * Native Web Standards Showcase E2E Tests
 * These tests verify the showcase app works correctly with the native Chromium API
 */

test.describe('Native API Detection', () => {
  test('should detect native Web Model Context API', async ({ page }) => {
    await page.goto('/');

    // Wait for detection to complete
    await page.waitForSelector('.banner.success', { timeout: 5000 });

    // Verify success banner
    const banner = page.locator('.banner.success');
    await expect(banner).toBeVisible();

    const statusText = await banner.locator('#detection-status').textContent();
    expect(statusText).toContain('Native Chromium Web Model Context API detected');
  });

  test('should expose modelContext and modelContextTesting', async ({ page }) => {
    await page.goto('/');

    const hasModelContext = await page.evaluate(() => {
      return typeof navigator.modelContext !== 'undefined';
    });
    expect(hasModelContext).toBe(true);

    const hasModelContextTesting = await page.evaluate(() => {
      return typeof navigator.modelContextTesting !== 'undefined';
    });
    expect(hasModelContextTesting).toBe(true);
  });

  test('should verify native implementation (not polyfill)', async ({ page }) => {
    await page.goto('/');

    const isNative = await page.evaluate(() => {
      const testing = navigator.modelContextTesting;
      if (!testing) return false;

      // Native implementation should not have "WebModelContext" in constructor name
      const constructorName = testing.constructor.name;
      return !constructorName.includes('WebModelContext');
    });

    expect(isNative).toBe(true);
  });

  test('should have native-specific methods', async ({ page }) => {
    await page.goto('/');

    const hasNativeMethods = await page.evaluate(() => {
      const ctx = navigator.modelContext;
      if (!ctx) return false;

      return typeof ctx.unregisterTool === 'function' && typeof ctx.clearContext === 'function';
    });

    expect(hasNativeMethods).toBe(true);
  });
});

test.describe('Live Code Editor', () => {
  test('should load and execute counter template', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Load counter template
    await page.selectOption('#template-select', 'counter');

    // Verify code is loaded in editor
    const editorContent = await page.locator('#code-editor').inputValue();
    expect(editorContent).toContain('counter_increment');

    // Execute the code
    await page.click('#register-code');

    // Wait for success in event log
    await page.waitForSelector('.log-entry:has-text("Code executed")', { timeout: 5000 });

    // Verify tool appears in output
    const toolsOutput = page.locator('#tools-output');
    await expect(toolsOutput.locator('.tool-name:has-text("counter_increment")')).toBeVisible();

    // Verify tool count updated
    const toolCount = await page.locator('#tool-count').textContent();
    expect(toolCount).toContain('1 tool');
  });

  test('should load and execute calculator template', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Load calculator template
    await page.selectOption('#template-select', 'calculator');
    await page.click('#register-code');

    await page.waitForSelector('.log-entry:has-text("Code executed")');

    // Should have multiple tools
    const toolCount = await page.locator('#tool-count').textContent();
    expect(toolCount).toContain('2 tools');

    await expect(page.locator('.tool-name:has-text("calc_add")')).toBeVisible();
    await expect(page.locator('.tool-name:has-text("calc_multiply")')).toBeVisible();
  });

  test('should clear editor', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Load a template
    await page.selectOption('#template-select', 'counter');

    // Clear editor
    await page.click('#clear-editor');

    const editorContent = await page.locator('#code-editor').inputValue();
    expect(editorContent).toBe('');
  });

  test('should show error for invalid code', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Enter invalid code
    await page.fill('#code-editor', 'this is invalid javascript!!!');
    await page.click('#register-code');

    // Should show error
    await page.waitForSelector('#editor-error', { state: 'visible', timeout: 3000 });
    const errorText = await page.locator('#editor-error').textContent();
    expect(errorText).toContain('Error');
  });
});

test.describe('Two-Bucket System', () => {
  test('should demonstrate provideContext (Bucket A)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Provide counter tools (Bucket A)
    await page.click('#provide-counter-tools');

    // Wait for tools to appear
    await page.waitForSelector('.tool-name:has-text("counter_increment")');

    // Verify all counter tools are present
    await expect(page.locator('.tool-name:has-text("counter_increment")')).toBeVisible();
    await expect(page.locator('.tool-name:has-text("counter_decrement")')).toBeVisible();
    await expect(page.locator('.tool-name:has-text("counter_get")')).toBeVisible();

    // Verify bucket A indicator updated
    const bucketAText = await page.locator('#bucket-a-tools').textContent();
    expect(bucketAText).toContain('counter_increment');
  });

  test('should demonstrate registerTool (Bucket B)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Register timer tool (Bucket B)
    await page.click('#register-timer-tool');

    // Wait for tool to appear
    await page.waitForSelector('.tool-name:has-text("timer")');

    // Verify bucket B indicator updated
    const bucketBText = await page.locator('#bucket-b-tools').textContent();
    expect(bucketBText).toContain('timer');
  });

  test('should demonstrate Bucket A replacement', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Add counter tools to Bucket A
    await page.click('#provide-counter-tools');
    await page.waitForSelector('.tool-name:has-text("counter_increment")');

    // Replace Bucket A
    await page.click('#replace-bucket-a');

    // Wait for new tool
    await page.waitForSelector('.tool-name:has-text("greet")');

    // Verify old tools are gone
    await expect(page.locator('.tool-name:has-text("counter_increment")')).not.toBeVisible();

    // Verify new tool is present
    await expect(page.locator('.tool-name:has-text("greet")')).toBeVisible();
  });

  test('should demonstrate Bucket B persistence across Bucket A changes', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Register timer tool (Bucket B)
    await page.click('#register-timer-tool');
    await page.waitForSelector('.tool-name:has-text("timer")');

    // Add counter tools (Bucket A)
    await page.click('#provide-counter-tools');
    await page.waitForSelector('.tool-name:has-text("counter_increment")');

    // Replace Bucket A
    await page.click('#replace-bucket-a');

    // Wait a moment for changes to take effect
    await page.waitForTimeout(500);

    // Bucket B tool should still be present!
    await expect(page.locator('.tool-name:has-text("timer")')).toBeVisible();

    // But Bucket A tools should have changed
    await expect(page.locator('.tool-name:has-text("greet")')).toBeVisible();
    await expect(page.locator('.tool-name:has-text("counter_increment")')).not.toBeVisible();
  });

  test('should unregister Bucket B tools', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Register timer tool
    await page.click('#register-timer-tool');
    await page.waitForSelector('.tool-name:has-text("timer")');

    // Unregister timer tool
    await page.click('#unregister-timer');

    // Tool should be gone
    await expect(page.locator('.tool-name:has-text("timer")')).not.toBeVisible();

    // Bucket B should be empty
    const bucketBText = await page.locator('#bucket-b-tools').textContent();
    expect(bucketBText).toContain('Empty');
  });
});

test.describe('Native Methods', () => {
  test('should list tools', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Add some tools
    await page.click('#provide-counter-tools');
    await page.waitForSelector('.tool-name:has-text("counter_increment")');

    // Click list tools
    await page.click('#list-tools');

    // Verify result display shows tools
    const resultText = await page.locator('#native-result').textContent();
    expect(resultText).toContain('counter_increment');
    expect(resultText).toContain('counter_decrement');
  });

  test('should execute tool', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Add counter tools
    await page.click('#provide-counter-tools');
    await page.waitForSelector('.tool-name:has-text("counter_increment")');

    // Execute first tool
    await page.click('#execute-tool');

    // Wait for result
    await page.waitForTimeout(500);

    const resultText = await page.locator('#native-result').textContent();
    expect(resultText).toContain('Counter');
  });

  test('should unregister tool (native method)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Add counter tools
    await page.click('#provide-counter-tools');
    await page.waitForSelector('.tool-name:has-text("counter_increment")');

    // Unregister tool
    await page.click('#unregister-tool');

    // Wait for event log
    await page.waitForSelector('.log-entry:has-text("unregisterTool")');

    // Tool count should decrease
    const toolCount = await page.locator('#tool-count').textContent();
    expect(toolCount).toContain('2 tools'); // Originally 3, now 2
  });

  test('should clear all tools (native method)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Add both bucket tools
    await page.click('#provide-counter-tools');
    await page.click('#register-timer-tool');
    await page.waitForTimeout(500);

    // Clear all
    await page.click('#clear-context');

    // Wait for event log
    await page.waitForSelector('.log-entry:has-text("clearContext")');

    // All tools should be gone
    const toolCount = await page.locator('#tool-count').textContent();
    expect(toolCount).toContain('0 tools');

    // Empty state should be visible
    await expect(page.locator('.empty-state')).toBeVisible();
  });
});

test.describe('Testing API', () => {
  test('should list tools via testing API', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    await page.click('#provide-counter-tools');
    await page.waitForSelector('.tool-name:has-text("counter_increment")');

    await page.click('#testing-list-tools');

    const resultText = await page.locator('#testing-result').textContent();
    expect(resultText).toContain('counter_increment');
    expect(resultText).toContain('inputSchema'); // Testing API returns stringified schema
  });

  test('should get tool calls', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    await page.click('#provide-counter-tools');
    await page.waitForSelector('.tool-name:has-text("counter_increment")');

    // Execute a tool first
    await page.click('#testing-execute');
    await page.waitForTimeout(500);

    // Get tool calls
    await page.click('#get-tool-calls');

    const resultText = await page.locator('#testing-result').textContent();
    // Should show call history
    expect(resultText).toContain('counter');
  });

  test('should clear tool calls', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    await page.click('#provide-counter-tools');
    await page.waitForSelector('.tool-name:has-text("counter_increment")');

    // Execute and clear
    await page.click('#testing-execute');
    await page.waitForTimeout(500);
    await page.click('#clear-tool-calls');

    const resultText = await page.locator('#testing-result').textContent();
    expect(resultText).toContain('cleared');
  });

  test('should reset testing API', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    await page.click('#reset-testing');

    const resultText = await page.locator('#testing-result').textContent();
    expect(resultText).toContain('reset');
  });
});

test.describe('Tool Executor', () => {
  test('should execute selected tool', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Add calculator tools
    await page.selectOption('#template-select', 'calculator');
    await page.click('#register-code');
    await page.waitForSelector('.tool-name:has-text("calc_add")');

    // Select calc_add tool
    await page.selectOption('#exec-tool-select', 'calc_add');

    // Enter input
    await page.fill('#exec-input', '{"a": 5, "b": 3}');

    // Execute
    await page.click('#exec-button');

    // Wait for result
    await page.waitForTimeout(500);

    const resultText = await page.locator('#exec-result').textContent();
    expect(resultText).toContain('5 + 3 = 8');
  });

  test('should handle tool execution errors', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    await page.selectOption('#template-select', 'calculator');
    await page.click('#register-code');
    await page.waitForSelector('.tool-name:has-text("calc_add")');

    await page.selectOption('#exec-tool-select', 'calc_add');

    // Enter invalid JSON
    await page.fill('#exec-input', 'invalid json');

    await page.click('#exec-button');

    await page.waitForTimeout(500);

    const resultText = await page.locator('#exec-result').textContent();
    expect(resultText).toContain('Error');
  });
});

test.describe('Event Log', () => {
  test('should log events', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Trigger some actions
    await page.click('#provide-counter-tools');

    // Should see event in log
    await expect(page.locator('.log-entry:has-text("Bucket A updated")')).toBeVisible();
  });

  test('should clear event log', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Generate some logs
    await page.click('#provide-counter-tools');

    // Clear log
    await page.click('#clear-log');

    // Log should be empty
    const logEntries = await page.locator('.log-entry').count();
    expect(logEntries).toBe(0);
  });
});

test.describe('Iframe Context Propagation', () => {
  test('should load iframe and show connected status', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Wait for iframe to be ready
    const iframe = page.frameLocator('#test-iframe');
    await iframe.locator('#iframe-status').waitFor({ timeout: 10000 });

    // Check iframe status indicator shows connected
    await page.waitForSelector('#iframe-status-indicator:has-text("Connected")', {
      timeout: 10000,
    });
  });

  test('should register tools in parent context (Bucket A)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Wait for iframe to be ready
    await page.waitForSelector('#iframe-status-indicator:has-text("Connected")', {
      timeout: 10000,
    });

    // Register parent Bucket A tool
    await page.click('#iframe-parent-register-a');

    // Wait for tool to appear in parent tools display
    await page.waitForSelector('#iframe-parent-tools:has-text("parent_greet")', { timeout: 5000 });

    // Check context comparison shows parent only
    const parentOnly = await page.locator('#iframe-compare-parent').textContent();
    expect(parentOnly).toContain('parent_greet');
  });

  test('should register tools in parent context (Bucket B)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Wait for iframe to be ready
    await page.waitForSelector('#iframe-status-indicator:has-text("Connected")', {
      timeout: 10000,
    });

    // Register parent Bucket B tool
    await page.click('#iframe-parent-register-b');

    // Wait for tool to appear
    await page.waitForSelector('#iframe-parent-tools:has-text("parent_time")', { timeout: 5000 });

    // Unregister button should be enabled
    const unregisterBtn = page.locator('#iframe-parent-unregister-b');
    await expect(unregisterBtn).not.toBeDisabled();
  });

  test('should send register command to iframe', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Wait for iframe to be ready
    await page.waitForSelector('#iframe-status-indicator:has-text("Connected")', {
      timeout: 10000,
    });

    // Send register Bucket A command to iframe
    await page.click('#iframe-child-register-a');

    // Wait for iframe tools to update
    await page.waitForSelector('#iframe-child-tools:has-text("iframe_echo")', { timeout: 5000 });

    // Check iframe event log
    const iframeLog = page.locator('#iframe-event-log');
    await expect(iframeLog).toContainText('iframe_echo');
  });

  test('should send register Bucket B command to iframe', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Wait for iframe to be ready
    await page.waitForSelector('#iframe-status-indicator:has-text("Connected")', {
      timeout: 10000,
    });

    // Send register Bucket B command to iframe
    await page.click('#iframe-child-register-b');

    // Wait for iframe tools to update
    await page.waitForSelector('#iframe-child-tools:has-text("iframe_timestamp")', {
      timeout: 5000,
    });

    // Unregister button should be enabled after registration
    const unregisterBtn = page.locator('#iframe-child-unregister-b');
    await expect(unregisterBtn).not.toBeDisabled();
  });

  test('should show context comparison between parent and iframe', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Wait for iframe to be ready
    await page.waitForSelector('#iframe-status-indicator:has-text("Connected")', {
      timeout: 10000,
    });

    // Register tool in parent
    await page.click('#iframe-parent-register-a');
    await page.waitForSelector('#iframe-parent-tools:has-text("parent_greet")', { timeout: 5000 });

    // Register tool in iframe
    await page.click('#iframe-child-register-a');
    await page.waitForSelector('#iframe-child-tools:has-text("iframe_echo")', { timeout: 5000 });

    // Check context comparison
    const parentOnly = await page.locator('#iframe-compare-parent').textContent();
    const childOnly = await page.locator('#iframe-compare-child').textContent();

    expect(parentOnly).toContain('parent_greet');
    expect(childOnly).toContain('iframe_echo');
  });

  test('should unregister parent Bucket B tool', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Wait for iframe to be ready
    await page.waitForSelector('#iframe-status-indicator:has-text("Connected")', {
      timeout: 10000,
    });

    // Register and then unregister
    await page.click('#iframe-parent-register-b');
    await page.waitForSelector('#iframe-parent-tools:has-text("parent_time")', { timeout: 5000 });

    await page.click('#iframe-parent-unregister-b');

    // Tool should be removed
    await expect(page.locator('#iframe-parent-tools:has-text("parent_time")')).not.toBeVisible();

    // Button should be disabled again
    const unregisterBtn = page.locator('#iframe-parent-unregister-b');
    await expect(unregisterBtn).toBeDisabled();
  });

  test('should clear parent context', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Wait for iframe to be ready
    await page.waitForSelector('#iframe-status-indicator:has-text("Connected")', {
      timeout: 10000,
    });

    // Register parent tool
    await page.click('#iframe-parent-register-a');
    await page.waitForSelector('#iframe-parent-tools:has-text("parent_greet")', { timeout: 5000 });

    // Clear context
    await page.click('#iframe-parent-clear');

    // Tool should be removed
    await expect(page.locator('#iframe-parent-tools:has-text("parent_greet")')).not.toBeVisible();

    // Iframe event log should show context cleared
    await expect(page.locator('#iframe-event-log')).toContainText('Context cleared');
  });

  test('should reload iframe', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Wait for iframe to be ready
    await page.waitForSelector('#iframe-status-indicator:has-text("Connected")', {
      timeout: 10000,
    });

    // Register tool in iframe
    await page.click('#iframe-child-register-a');
    await page.waitForSelector('#iframe-child-tools:has-text("iframe_echo")', { timeout: 5000 });

    // Reload iframe
    await page.click('#iframe-reload');

    // Should show loading state briefly
    await page.waitForSelector('#iframe-status-indicator:has-text("Loading")', { timeout: 2000 });

    // Should become connected again
    await page.waitForSelector('#iframe-status-indicator:has-text("Connected")', {
      timeout: 10000,
    });

    // Tools should be cleared after reload
    await expect(page.locator('#iframe-child-tools:has-text("iframe_echo")')).not.toBeVisible();
  });

  test('should clear iframe event log', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Wait for iframe to be ready
    await page.waitForSelector('#iframe-status-indicator:has-text("Connected")', {
      timeout: 10000,
    });

    // Generate some logs
    await page.click('#iframe-parent-register-a');
    await page.waitForTimeout(500);

    // Clear log
    await page.click('#clear-iframe-log');

    // Log should be empty
    const logContent = await page.locator('#iframe-event-log').textContent();
    expect(logContent?.trim()).toBe('');
  });

  test('should log cross-frame events', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.banner.success');

    // Wait for iframe to be ready
    await page.waitForSelector('#iframe-status-indicator:has-text("Connected")', {
      timeout: 10000,
    });

    // Clear any existing logs
    await page.click('#clear-iframe-log');

    // Register tool in parent
    await page.click('#iframe-parent-register-a');
    await page.waitForTimeout(500);

    // Check iframe event log has entry
    const iframeLog = page.locator('#iframe-event-log');
    await expect(iframeLog).toContainText('parent_greet');
  });
});
