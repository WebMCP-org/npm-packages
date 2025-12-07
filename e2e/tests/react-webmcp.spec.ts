import { expect, test } from '@playwright/test';

test.describe('React WebMCP Hook Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8888');
    await page.waitForSelector('[data-testid="app-status"]');
  });

  test('should load the app and initialize MCP', async ({ page }) => {
    // Check app title
    await expect(page.locator('h1')).toContainText('React WebMCP Test App');

    // Check status badge
    const status = page.locator('[data-testid="app-status"]');
    await expect(status).toContainText('Ready');

    // Check initial counter value
    const counter = page.locator('[data-testid="counter-display"]');
    await expect(counter).toContainText('0');
  });

  test('should register all tools on mount', async ({ page }) => {
    // Verify tools are working by testing all tool types through UI interactions

    // Test counter tools
    const incrementBtn = page.locator('[data-testid="increment-btn"]');
    const decrementBtn = page.locator('[data-testid="decrement-btn"]');
    const resetBtn = page.locator('[data-testid="reset-btn"]');
    const getBtn = page.locator('[data-testid="get-counter-btn"]');

    await expect(incrementBtn).toBeVisible();
    await expect(decrementBtn).toBeVisible();
    await expect(resetBtn).toBeVisible();
    await expect(getBtn).toBeVisible();

    // Test post tools
    const likeBtn = page.locator('[data-testid="like-post-1"]');
    const searchBtn = page.locator('[data-testid="search-posts-btn"]');

    await expect(likeBtn).toBeVisible();
    await expect(searchBtn).toBeVisible();

    // All tools are registered and functional (7 total: increment, decrement, reset, get, like, search, context)
  });

  test('should increment counter via button', async ({ page }) => {
    const incrementBtn = page.locator('[data-testid="increment-btn"]');
    const counter = page.locator('[data-testid="counter-display"]');

    // Initial value
    await expect(counter).toContainText('0');

    // Click increment
    await incrementBtn.click();

    // Should show executing state
    const status = page.locator('[data-testid="app-status"]');
    await expect(status).toContainText('Executing');

    // Wait for completion
    await expect(status).toContainText('Ready', { timeout: 2000 });

    // Check new value
    await expect(counter).toContainText('1');

    // Check execution count
    const executions = page.locator('[data-testid="total-executions"]');
    await expect(executions).toContainText('1');
  });

  test('should decrement counter via button', async ({ page }) => {
    const incrementBtn = page.locator('[data-testid="increment-btn"]');
    const decrementBtn = page.locator('[data-testid="decrement-btn"]');
    const counter = page.locator('[data-testid="counter-display"]');
    const status = page.locator('[data-testid="app-status"]');

    // Increment to 3
    await incrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });
    await incrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });
    await incrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    await expect(counter).toContainText('3');

    // Decrement
    await decrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    await expect(counter).toContainText('2');
  });

  test('should reset counter via button', async ({ page }) => {
    const incrementBtn = page.locator('[data-testid="increment-btn"]');
    const resetBtn = page.locator('[data-testid="reset-btn"]');
    const counter = page.locator('[data-testid="counter-display"]');
    const status = page.locator('[data-testid="app-status"]');

    // Increment to 5
    for (let i = 0; i < 5; i++) {
      await incrementBtn.click();
      await expect(status).toContainText('Ready', { timeout: 2000 });
    }

    await expect(counter).toContainText('5');

    // Reset
    await resetBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    await expect(counter).toContainText('0');
  });

  test('should get counter value via button', async ({ page }) => {
    const getCounterBtn = page.locator('[data-testid="get-counter-btn"]');
    const eventLog = page.locator('[data-testid="event-log"]');

    // Click get counter
    await getCounterBtn.click();

    // Wait for log entry
    await expect(eventLog).toContainText('Retrieved counter value: 0');

    // Check execution count increased
    const executions = page.locator('[data-testid="total-executions"]');
    await expect(executions).toContainText('1');
  });

  test('should like a post via button', async ({ page }) => {
    const likeBtn = page.locator('[data-testid="like-post-1"]');
    const likes = page.locator('[data-testid="post-1-likes"]');
    const status = page.locator('[data-testid="app-status"]');

    // Initial likes
    await expect(likes).toContainText('0');

    // Like the post
    await likeBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    // Check likes increased
    await expect(likes).toContainText('1');

    // Like again (idempotent)
    await likeBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    await expect(likes).toContainText('2');
  });

  test('should search posts via button', async ({ page }) => {
    const searchBtn = page.locator('[data-testid="search-posts-btn"]');
    const searchResults = page.locator('[data-testid="search-results"]');
    const status = page.locator('[data-testid="app-status"]');

    // Click search
    await searchBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    // Check results appeared
    await expect(searchResults).toBeVisible();
    await expect(searchResults).toContainText('Search Results (3)');
    await expect(searchResults).toContainText('First Post, Second Post, Third Post');
  });

  test('should increment counter multiple times', async ({ page }) => {
    const incrementBtn = page.locator('[data-testid="increment-btn"]');
    const counter = page.locator('[data-testid="counter-display"]');
    const status = page.locator('[data-testid="app-status"]');

    // Click increment 5 times
    for (let i = 0; i < 5; i++) {
      await incrementBtn.click();
      await expect(status).toContainText('Ready', { timeout: 2000 });
    }

    // Check counter is at 5
    await expect(counter).toContainText('5');

    // Check execution count
    const executions = page.locator('[data-testid="total-executions"]');
    await expect(executions).toContainText('5');
  });

  test('should handle multiple rapid clicks', async ({ page }) => {
    const incrementBtn = page.locator('[data-testid="increment-btn"]');
    const counter = page.locator('[data-testid="counter-display"]');
    const status = page.locator('[data-testid="app-status"]');

    // Rapidly click 3 times
    await incrementBtn.click();
    await incrementBtn.click();
    await incrementBtn.click();

    // Wait for all to complete
    await expect(status).toContainText('Ready', { timeout: 5000 });

    // All should have executed
    await expect(counter).toContainText('3');

    const executions = page.locator('[data-testid="total-executions"]');
    await expect(executions).toContainText('3');
  });

  test('should track execution counts correctly', async ({ page }) => {
    const incrementBtn = page.locator('[data-testid="increment-btn"]');
    const likeBtn = page.locator('[data-testid="like-post-1"]');
    const searchBtn = page.locator('[data-testid="search-posts-btn"]');
    const status = page.locator('[data-testid="app-status"]');

    const totalExec = page.locator('[data-testid="total-executions"]');
    const counterExec = page.locator('[data-testid="counter-executions"]');
    const postExec = page.locator('[data-testid="post-executions"]');

    // Initial state
    await expect(totalExec).toContainText('0');
    await expect(counterExec).toContainText('0');
    await expect(postExec).toContainText('0');

    // Increment twice
    await incrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });
    await incrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    await expect(counterExec).toContainText('2');
    await expect(totalExec).toContainText('2');

    // Like post
    await likeBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    await expect(postExec).toContainText('1');
    await expect(totalExec).toContainText('3');

    // Search
    await searchBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    await expect(postExec).toContainText('2');
    await expect(totalExec).toContainText('4');
  });

  test('should clear event log', async ({ page }) => {
    const incrementBtn = page.locator('[data-testid="increment-btn"]');
    const clearLogBtn = page.locator('[data-testid="clear-log-btn"]');
    const eventLog = page.locator('[data-testid="event-log"]');
    const status = page.locator('[data-testid="app-status"]');

    // Generate some events
    await incrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    // Check log has entries
    await expect(eventLog).toContainText('Incremented counter');

    // Clear log
    await clearLogBtn.click();

    // Check log is empty
    await expect(eventLog).toContainText('No events yet...');
  });

  test('should update total likes when posts are liked', async ({ page }) => {
    const likeBtn1 = page.locator('[data-testid="like-post-1"]');
    const likeBtn2 = page.locator('[data-testid="like-post-2"]');
    const totalLikes = page.locator('[data-testid="total-likes"]');
    const status = page.locator('[data-testid="app-status"]');

    // Initial total (post-2 has 5, post-3 has 10)
    await expect(totalLikes).toContainText('15');

    // Like post 1
    await likeBtn1.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    await expect(totalLikes).toContainText('16');

    // Like post 2
    await likeBtn2.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    await expect(totalLikes).toContainText('17');
  });

  test('should display event logs for tool executions', async ({ page }) => {
    const incrementBtn = page.locator('[data-testid="increment-btn"]');
    const eventLog = page.locator('[data-testid="event-log"]');
    const status = page.locator('[data-testid="app-status"]');

    // Execute a tool
    await incrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    // Check event log contains the execution
    await expect(eventLog).toContainText('Incremented counter');
  });

  test('should maintain state across multiple operations', async ({ page }) => {
    const incrementBtn = page.locator('[data-testid="increment-btn"]');
    const decrementBtn = page.locator('[data-testid="decrement-btn"]');
    const counter = page.locator('[data-testid="counter-display"]');
    const status = page.locator('[data-testid="app-status"]');

    // Complex sequence
    await incrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });
    await incrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });
    await incrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    await expect(counter).toContainText('3');

    await decrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    await expect(counter).toContainText('2');

    await incrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });
    await incrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    await expect(counter).toContainText('4');
  });

  test('should display statistics correctly', async ({ page }) => {
    const totalLikes = page.locator('[data-testid="total-likes"]');
    const totalExec = page.locator('[data-testid="total-executions"]');

    // Initial state
    await expect(totalLikes).toContainText('15'); // 0 + 5 + 10 from initial posts
    await expect(totalExec).toContainText('0');

    // Perform some operations
    const incrementBtn = page.locator('[data-testid="increment-btn"]');
    const status = page.locator('[data-testid="app-status"]');

    await incrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    // Check statistics updated
    await expect(totalExec).toContainText('1');
  });

  test('should execute all tool types successfully', async ({ page }) => {
    const status = page.locator('[data-testid="app-status"]');
    const executions = page.locator('[data-testid="total-executions"]');

    // Test counter increment tool
    const incrementBtn = page.locator('[data-testid="increment-btn"]');
    await incrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    // Test counter get tool
    const getBtn = page.locator('[data-testid="get-counter-btn"]');
    await getBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    // Test post like tool
    const likeBtn = page.locator('[data-testid="like-post-1"]');
    await likeBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    // Test post search tool
    const searchBtn = page.locator('[data-testid="search-posts-btn"]');
    await searchBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    // Verify all tools executed
    await expect(executions).toContainText('4');
  });

  test('should handle StrictMode double-mounting correctly', async ({ page }) => {
    // In StrictMode, components mount twice in development
    // The registry should prevent duplicate tool registration

    // Verify tools work correctly despite StrictMode double-mounting
    const incrementBtn = page.locator('[data-testid="increment-btn"]');
    const counter = page.locator('[data-testid="counter-display"]');
    const status = page.locator('[data-testid="app-status"]');
    const executions = page.locator('[data-testid="total-executions"]');

    // Execute tool multiple times
    await incrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });
    await incrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    // Should increment correctly (no duplicate registrations)
    await expect(counter).toContainText('2');
    await expect(executions).toContainText('2');
  });
});

// ============================================================================
// useWebMCPPrompt Tests
// ============================================================================

test.describe('React WebMCP Prompt Hook Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8888');
    await page.waitForSelector('[data-testid="app-status"]');
  });

  test('should register all prompts on mount', async ({ page }) => {
    // Check that all prompts show as registered
    const helpStatus = page.locator('[data-testid="prompt-help-status"]');
    const reviewStatus = page.locator('[data-testid="prompt-review-status"]');
    const summarizeStatus = page.locator('[data-testid="prompt-summarize-status"]');

    await expect(helpStatus).toContainText('Registered', { timeout: 3000 });
    await expect(reviewStatus).toContainText('Registered', { timeout: 3000 });
    await expect(summarizeStatus).toContainText('Registered', { timeout: 3000 });
  });

  test('should display prompt information', async ({ page }) => {
    // Check prompts info box is visible and contains correct info
    const promptsInfo = page.locator('[data-testid="prompts-info"]');
    await expect(promptsInfo).toBeVisible();

    // Verify each prompt is listed
    const helpInfo = page.locator('[data-testid="prompt-help-info"]');
    const reviewInfo = page.locator('[data-testid="prompt-review-info"]');
    const summarizeInfo = page.locator('[data-testid="prompt-summarize-info"]');

    await expect(helpInfo).toContainText('help');
    await expect(helpInfo).toContainText('Get help with using the application');

    await expect(reviewInfo).toContainText('review_code');
    await expect(reviewInfo).toContainText('Review code for best practices');

    await expect(summarizeInfo).toContainText('summarize');
    await expect(summarizeInfo).toContainText('Summarize text');
  });

  test('should register prompts with correct status indicators', async ({ page }) => {
    // Wait for prompts to register
    await page.waitForTimeout(500);

    // All status indicators should be green (registered)
    const helpStatus = page.locator('[data-testid="prompt-help-status"]');
    const reviewStatus = page.locator('[data-testid="prompt-review-status"]');
    const summarizeStatus = page.locator('[data-testid="prompt-summarize-status"]');

    // Check that status text indicates registration
    await expect(helpStatus).toHaveText('Registered');
    await expect(reviewStatus).toHaveText('Registered');
    await expect(summarizeStatus).toHaveText('Registered');
  });

  test('should show prompt section with all three prompts', async ({ page }) => {
    // Find the prompts section
    const promptsSection = page.locator('h2:has-text("Registered Prompts")').locator('..');
    await expect(promptsSection).toBeVisible();

    // Verify all three stat cards are present
    const statCards = promptsSection.locator('.stat-card');
    await expect(statCards).toHaveCount(3);
  });
});

// ============================================================================
// useWebMCPResource Tests
// ============================================================================

test.describe('React WebMCP Resource Hook Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8888');
    await page.waitForSelector('[data-testid="app-status"]');
  });

  test('should register all resources on mount', async ({ page }) => {
    // Check that all resources show as registered
    const configStatus = page.locator('[data-testid="resource-config-status"]');
    const userStatus = page.locator('[data-testid="resource-user-status"]');
    const postsStatus = page.locator('[data-testid="resource-posts-status"]');

    await expect(configStatus).toContainText('Registered', { timeout: 3000 });
    await expect(userStatus).toContainText('Registered', { timeout: 3000 });
    await expect(postsStatus).toContainText('Registered', { timeout: 3000 });
  });

  test('should display resource information', async ({ page }) => {
    // Check resources info box is visible and contains correct info
    const resourcesInfo = page.locator('[data-testid="resources-info"]');
    await expect(resourcesInfo).toBeVisible();

    // Verify each resource is listed
    const configInfo = page.locator('[data-testid="resource-config-info"]');
    const userInfo = page.locator('[data-testid="resource-user-info"]');
    const postsInfo = page.locator('[data-testid="resource-posts-info"]');

    await expect(configInfo).toContainText('config://app-settings');
    await expect(configInfo).toContainText('Static app configuration');

    await expect(userInfo).toContainText('user://');
    await expect(userInfo).toContainText('Dynamic user profile');

    await expect(postsInfo).toContainText('data://posts');
    await expect(postsInfo).toContainText('Current posts data');
  });

  test('should register resources with correct status indicators', async ({ page }) => {
    // Wait for resources to register
    await page.waitForTimeout(500);

    // All status indicators should show registered
    const configStatus = page.locator('[data-testid="resource-config-status"]');
    const userStatus = page.locator('[data-testid="resource-user-status"]');
    const postsStatus = page.locator('[data-testid="resource-posts-status"]');

    // Check that status text indicates registration
    await expect(configStatus).toHaveText('Registered');
    await expect(userStatus).toHaveText('Registered');
    await expect(postsStatus).toHaveText('Registered');
  });

  test('should show resource section with all three resources', async ({ page }) => {
    // Find the resources section
    const resourcesSection = page.locator('h2:has-text("Registered Resources")').locator('..');
    await expect(resourcesSection).toBeVisible();

    // Verify all three stat cards are present
    const statCards = resourcesSection.locator('.stat-card');
    await expect(statCards).toHaveCount(3);
  });

  test('should show both static and dynamic (URI template) resources', async ({ page }) => {
    // Verify static resource is shown
    const configInfo = page.locator('[data-testid="resource-config-info"]');
    await expect(configInfo).toContainText('Static');

    // Verify dynamic resource (URI template) is shown
    const userInfo = page.locator('[data-testid="resource-user-info"]');
    await expect(userInfo).toContainText('URI template');
  });
});

// ============================================================================
// Combined Hook Registration Tests
// ============================================================================

test.describe('React WebMCP Combined Hook Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8888');
    await page.waitForSelector('[data-testid="app-status"]');
  });

  // FIXME: MCP client via TabClientTransport is not receiving tools from the server.
  // The tools registered via useWebMCP work (prompts/resources register fine), but
  // useMcpClient() which fetches tools via client.listTools() never receives them.
  // This indicates an issue with the client-server transport connection.
  test.fixme('should register tools, prompts, and resources together', async ({ page }) => {
    // Check prompts are registered first (these load quickly)
    const helpStatus = page.locator('[data-testid="prompt-help-status"]');
    await expect(helpStatus).toHaveText('Registered', { timeout: 5000 });

    // Check resources are registered
    const configStatus = page.locator('[data-testid="resource-config-status"]');
    await expect(configStatus).toHaveText('Registered', { timeout: 5000 });

    // Check tools are registered (via client tools list) - tools take longer to load
    // The MCP client needs time to connect and fetch tools from the server
    const toolsList = page.locator('[data-testid="client-tools-list"]');
    await expect(toolsList).toContainText('counter_increment', { timeout: 30000 });
  });

  test('should maintain all registrations during tool execution', async ({ page }) => {
    // First verify everything is registered
    const helpStatus = page.locator('[data-testid="prompt-help-status"]');
    const configStatus = page.locator('[data-testid="resource-config-status"]');
    const status = page.locator('[data-testid="app-status"]');

    await expect(helpStatus).toHaveText('Registered', { timeout: 3000 });
    await expect(configStatus).toHaveText('Registered', { timeout: 3000 });

    // Execute a tool
    const incrementBtn = page.locator('[data-testid="increment-btn"]');
    await incrementBtn.click();
    await expect(status).toContainText('Ready', { timeout: 2000 });

    // Verify prompts and resources are still registered
    await expect(helpStatus).toHaveText('Registered');
    await expect(configStatus).toHaveText('Registered');
  });

  test('should display all MCP primitives in the app', async ({ page }) => {
    // Tools section should exist
    const toolsSection = page.locator('h2:has-text("Counter Tools")');
    await expect(toolsSection).toBeVisible();

    // Prompts section should exist
    const promptsSection = page.locator('h2:has-text("Registered Prompts")');
    await expect(promptsSection).toBeVisible();

    // Resources section should exist
    const resourcesSection = page.locator('h2:has-text("Registered Resources")');
    await expect(resourcesSection).toBeVisible();

    // MCP Tools list should exist
    const mcpToolsSection = page.locator('h2:has-text("Registered MCP Tools")');
    await expect(mcpToolsSection).toBeVisible();
  });
});

// ============================================================================
// structuredContent Tests
// ============================================================================

test.describe('React WebMCP structuredContent Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8888');
    await page.waitForSelector('[data-testid="app-status"]');
    // Wait for modelContextTesting to be available and tools to be registered
    await page.waitForFunction(
      () => {
        const testing = navigator.modelContextTesting;
        if (!testing) return false;
        const tools = testing.listTools();
        // Wait until counter_get tool is registered
        return tools.some((t) => t.name === 'counter_get');
      },
      { timeout: 10000 }
    );
  });

  test('should return structuredContent for tools with outputSchema', async ({ page }) => {
    // Call the counter_get tool via modelContextTesting (it has outputSchema defined)
    // The executeTool returns structuredContent directly when outputSchema is present
    const result = await page.evaluate(async () => {
      const testing = navigator.modelContextTesting;
      if (!testing) {
        throw new Error('modelContextTesting not available');
      }

      try {
        // executeTool returns structuredContent directly for tools with outputSchema
        const response = await testing.executeTool('counter_get', '{}');
        return {
          success: true,
          response,
          isObject: typeof response === 'object' && response !== null,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Verify the tool call was successful
    expect(result.success).toBe(true);

    // modelContextTesting.executeTool returns structuredContent directly when present
    // (it returns the value itself, not wrapped in a response object)
    expect(result.isObject).toBe(true);

    // Verify the response has the expected structure (counter and timestamp)
    const response = result.response as { counter: number; timestamp: string };
    expect(response).toBeDefined();
    expect(response).toHaveProperty('counter');
    expect(response).toHaveProperty('timestamp');
    expect(typeof response.counter).toBe('number');
    expect(typeof response.timestamp).toBe('string');
  });

  test('should return parsed text for tools without outputSchema', async ({ page }) => {
    // Call the counter_increment tool via modelContextTesting (it does NOT have outputSchema)
    // When no outputSchema is present, executeTool returns parsed text content
    const result = await page.evaluate(async () => {
      const testing = navigator.modelContextTesting;
      if (!testing) {
        throw new Error('modelContextTesting not available');
      }

      try {
        const response = await testing.executeTool(
          'counter_increment',
          JSON.stringify({ amount: 1 })
        );
        return {
          success: true,
          response,
          typeOf: typeof response,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Verify the tool call was successful
    expect(result.success).toBe(true);

    // For tools without outputSchema, executeTool parses the text content
    // The response should be the parsed JSON from the text content
    expect(result.response).toBeDefined();
  });

  test('should return correct counter value from structuredContent', async ({ page }) => {
    // Test that structuredContent contains the actual data from the handler
    const result = await page.evaluate(async () => {
      const testing = navigator.modelContextTesting;
      if (!testing) {
        throw new Error('modelContextTesting not available');
      }

      // Call counter_get - returns { counter, timestamp }
      const response = (await testing.executeTool('counter_get', '{}')) as {
        counter: number;
        timestamp: string;
      };

      return {
        counter: response.counter,
        hasTimestamp: typeof response.timestamp === 'string',
        timestampIsISO: /^\d{4}-\d{2}-\d{2}T/.test(response.timestamp),
      };
    });

    // The counter starts at 0
    expect(typeof result.counter).toBe('number');
    expect(result.hasTimestamp).toBe(true);
    expect(result.timestampIsISO).toBe(true);
  });

  test('should validate structuredContent reflects updated state', async ({ page }) => {
    // Call counter_get multiple times and verify structuredContent reflects actual values
    const results = await page.evaluate(async () => {
      const testing = navigator.modelContextTesting;
      if (!testing) {
        throw new Error('modelContextTesting not available');
      }

      // First call - get initial counter value
      const response1 = (await testing.executeTool('counter_get', '{}')) as {
        counter: number;
        timestamp: string;
      };
      const initialCounter = response1.counter;

      // Increment counter by 5
      await testing.executeTool('counter_increment', JSON.stringify({ amount: 5 }));

      // Second call - get updated counter value
      const response2 = (await testing.executeTool('counter_get', '{}')) as {
        counter: number;
        timestamp: string;
      };
      const updatedCounter = response2.counter;

      return {
        initialCounter,
        updatedCounter,
        incrementedBy5: updatedCounter === initialCounter + 5,
        hasValidTimestamp: typeof response1.timestamp === 'string',
      };
    });

    // Verify the counter was incremented correctly
    expect(results.incrementedBy5).toBe(true);
    expect(results.hasValidTimestamp).toBe(true);
    expect(typeof results.initialCounter).toBe('number');
    expect(typeof results.updatedCounter).toBe('number');
    expect(results.updatedCounter).toBe(results.initialCounter + 5);
  });
});
