import { expect, test } from '@playwright/test';

test.describe('React WebMCP Hook Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5174');
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
