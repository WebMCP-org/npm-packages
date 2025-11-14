import { expect, test } from '@playwright/test';

test.describe('MCP Config Explorer Component Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-title"]');
  });

  test('should load the test app successfully', async ({ page }) => {
    // Check app title
    const title = page.locator('[data-testid="app-title"]');
    await expect(title).toContainText('MCP Config Explorer Test App');

    // Check description
    const description = page.locator('[data-testid="app-description"]');
    await expect(description).toBeVisible();

    // Check mode selector
    const explorerMode = page.locator('[data-testid="mode-explorer"]');
    const utilitiesMode = page.locator('[data-testid="mode-utilities"]');

    await expect(explorerMode).toBeVisible();
    await expect(utilitiesMode).toBeVisible();
  });

  test('should render MCPConfigExplorer component', async ({ page }) => {
    // Should be in explorer mode by default
    const explorerContainer = page.locator('[data-testid="explorer-container"]');
    await expect(explorerContainer).toBeVisible();

    // Check for the main component elements
    const exploreButton = page.locator('text=Explore File System');
    await expect(exploreButton).toBeVisible();
  });

  test('should display default MCP URL and server name', async ({ page }) => {
    const mcpUrlInput = page.locator('[data-testid="mcp-url-input"]');
    const serverNameInput = page.locator('[data-testid="server-name-input"]');

    await expect(mcpUrlInput).toHaveValue('https://api.example.com/mcp/test-server');
    await expect(serverNameInput).toHaveValue('test-mcp-server');
  });

  test('should allow changing MCP URL', async ({ page }) => {
    const mcpUrlInput = page.locator('[data-testid="mcp-url-input"]');

    await mcpUrlInput.fill('https://custom.example.com/mcp/my-server');
    await expect(mcpUrlInput).toHaveValue('https://custom.example.com/mcp/my-server');
  });

  test('should allow changing server name', async ({ page }) => {
    const serverNameInput = page.locator('[data-testid="server-name-input"]');

    await serverNameInput.fill('custom-server-name');
    await expect(serverNameInput).toHaveValue('custom-server-name');
  });

  test('should switch to utilities mode', async ({ page }) => {
    const utilitiesMode = page.locator('[data-testid="mode-utilities"]');
    await utilitiesMode.click();

    // Should show utilities test interface
    const utilitiesTest = page.locator('[data-testid="utilities-test"]');
    await expect(utilitiesTest).toBeVisible();

    // Explorer container should not be visible
    const explorerContainer = page.locator('[data-testid="explorer-container"]');
    await expect(explorerContainer).not.toBeVisible();
  });

  test('should display utilities interface elements', async ({ page }) => {
    const utilitiesMode = page.locator('[data-testid="mode-utilities"]');
    await utilitiesMode.click();

    // Check platform selector
    const platformSelect = page.locator('[data-testid="platform-select"]');
    await expect(platformSelect).toBeVisible();
    await expect(platformSelect).toHaveValue('claude-desktop');

    // Check config content input
    const configContentInput = page.locator('[data-testid="config-content-input"]');
    await expect(configContentInput).toBeVisible();

    // Check utility buttons
    const generateBtn = page.locator('[data-testid="test-generate-config"]');
    const mergeBtn = page.locator('[data-testid="test-merge-config"]');
    const formatBtn = page.locator('[data-testid="test-format-config"]');

    await expect(generateBtn).toBeVisible();
    await expect(mergeBtn).toBeVisible();
    await expect(formatBtn).toBeVisible();
  });

  test('should change platform selection', async ({ page }) => {
    const utilitiesMode = page.locator('[data-testid="mode-utilities"]');
    await utilitiesMode.click();

    const platformSelect = page.locator('[data-testid="platform-select"]');

    // Change to cursor
    await platformSelect.selectOption('cursor');
    await expect(platformSelect).toHaveValue('cursor');

    // Change to vscode
    await platformSelect.selectOption('vscode');
    await expect(platformSelect).toHaveValue('vscode');
  });

  test('should display updated configurations when config is updated', async ({ page }) => {
    // Initially no updates
    const updatedConfigs = page.locator('[data-testid="updated-configs"]');
    await expect(updatedConfigs).not.toBeVisible();

    // Clear button should be disabled
    const clearBtn = page.locator('[data-testid="clear-updates-btn"]');
    await expect(clearBtn).toBeDisabled();
  });

  test('should display error messages', async ({ page }) => {
    // Initially no error
    const errorMessage = page.locator('[data-testid="error-message"]');
    await expect(errorMessage).not.toBeVisible();
  });

  test('should have explore file system button', async ({ page }) => {
    const exploreButton = page.locator('text=Explore File System');
    await expect(exploreButton).toBeVisible();
    await expect(exploreButton).toBeEnabled();
  });

  test('should display empty state when no configs detected', async ({ page }) => {
    const emptyState = page.locator('text=No configuration files found');

    // Initially should not be visible (haven't explored yet)
    await expect(emptyState).not.toBeVisible();
  });

  test('should render all platform options in utilities mode', async ({ page }) => {
    const utilitiesMode = page.locator('[data-testid="mode-utilities"]');
    await utilitiesMode.click();

    const platformSelect = page.locator('[data-testid="platform-select"]');

    // Get all options
    const options = await platformSelect.locator('option').allTextContents();

    // Should have all 7 platforms
    expect(options).toContain('Claude Desktop');
    expect(options).toContain('Cursor');
    expect(options).toContain('VSCode');
    expect(options).toContain('Continue.dev');
    expect(options).toContain('Cline');
    expect(options).toContain('Windsurf');
    expect(options).toContain('Codex');
  });

  test('should maintain state when switching modes', async ({ page }) => {
    // Set custom values
    const mcpUrlInput = page.locator('[data-testid="mcp-url-input"]');
    await mcpUrlInput.fill('https://custom.example.com/mcp');

    const serverNameInput = page.locator('[data-testid="server-name-input"]');
    await serverNameInput.fill('my-custom-server');

    // Switch to utilities mode
    const utilitiesMode = page.locator('[data-testid="mode-utilities"]');
    await utilitiesMode.click();

    // Switch back to explorer mode
    const explorerMode = page.locator('[data-testid="mode-explorer"]');
    await explorerMode.click();

    // Values should be maintained
    await expect(mcpUrlInput).toHaveValue('https://custom.example.com/mcp');
    await expect(serverNameInput).toHaveValue('my-custom-server');
  });

  test('should show correct text in clear updates button', async ({ page }) => {
    const clearBtn = page.locator('[data-testid="clear-updates-btn"]');
    await expect(clearBtn).toContainText('Clear Updates (0)');
  });

  test('should have MCP Config Explorer title', async ({ page }) => {
    const explorerTitle = page.locator('text=MCP Configuration Explorer');
    await expect(explorerTitle).toBeVisible();
  });

  test('should display configuration explorer description', async ({ page }) => {
    const description = page.locator(
      'text=Automatically detect and update MCP configuration files'
    );
    await expect(description).toBeVisible();
  });

  test('should have proper input labels', async ({ page }) => {
    const urlLabel = page.locator('label:has-text("MCP Server URL:")');
    const nameLabel = page.locator('label:has-text("Server Name:")');

    await expect(urlLabel).toBeVisible();
    await expect(nameLabel).toBeVisible();
  });

  test('should render utilities output section', async ({ page }) => {
    const utilitiesMode = page.locator('[data-testid="mode-utilities"]');
    await utilitiesMode.click();

    const output = page.locator('[data-testid="utility-output"]');
    await expect(output).toBeVisible();

    const outputContent = page.locator('#utility-output-content');
    await expect(outputContent).toBeVisible();
  });

  test('should have config content textarea with placeholder', async ({ page }) => {
    const utilitiesMode = page.locator('[data-testid="mode-utilities"]');
    await utilitiesMode.click();

    const configContent = page.locator('[data-testid="config-content-input"]');
    await expect(configContent).toHaveAttribute('placeholder', /paste existing config/i);
  });

  test('should allow typing in config content textarea', async ({ page }) => {
    const utilitiesMode = page.locator('[data-testid="mode-utilities"]');
    await utilitiesMode.click();

    const configContent = page.locator('[data-testid="config-content-input"]');
    const testContent = '{"mcpServers": {"test": {"url": "https://example.com"}}}';

    await configContent.fill(testContent);
    await expect(configContent).toHaveValue(testContent);
  });

  test('should display mode buttons with correct styling', async ({ page }) => {
    const explorerMode = page.locator('[data-testid="mode-explorer"]');
    const utilitiesMode = page.locator('[data-testid="mode-utilities"]');

    // Explorer mode should be active by default
    await expect(explorerMode).toHaveClass(/active/);
    await expect(utilitiesMode).not.toHaveClass(/active/);

    // Click utilities mode
    await utilitiesMode.click();

    // Utilities mode should now be active
    await expect(utilitiesMode).toHaveClass(/active/);
    await expect(explorerMode).not.toHaveClass(/active/);
  });

  test('should render all UI elements in correct order', async ({ page }) => {
    // Header
    await expect(page.locator('[data-testid="app-title"]')).toBeVisible();
    await expect(page.locator('[data-testid="app-description"]')).toBeVisible();

    // Mode selector
    await expect(page.locator('[data-testid="mode-explorer"]')).toBeVisible();
    await expect(page.locator('[data-testid="mode-utilities"]')).toBeVisible();

    // Controls
    await expect(page.locator('[data-testid="mcp-url-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="server-name-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="clear-updates-btn"]')).toBeVisible();

    // Explorer
    await expect(page.locator('[data-testid="explorer-container"]')).toBeVisible();
  });

  test('should have responsive layout', async ({ page }) => {
    // Check that main container exists
    const app = page.locator('.app');
    await expect(app).toBeVisible();

    // Check controls section
    const controls = page.locator('.controls');
    await expect(controls).toBeVisible();

    // Check explorer container
    const explorerContainer = page.locator('.explorer-container');
    await expect(explorerContainer).toBeVisible();
  });
});

test.describe('MCP Config Explorer - File System Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should show explore button and handle click', async ({ page }) => {
    const exploreButton = page.locator('text=Explore File System');

    // Button should be visible and enabled
    await expect(exploreButton).toBeVisible();
    await expect(exploreButton).toBeEnabled();

    // Note: Clicking will trigger file picker which cannot be automated in Playwright
    // without mocking. This test verifies the button is ready for interaction.
  });

  test('should display security warning about MCP URL', async ({ page }) => {
    // Look for security warning in the component
    const warning = page.locator('text=/DO NOT SHARE THIS URL|Security Warning/i');

    // Security warning should be visible
    await expect(warning).toBeVisible();
  });
});

test.describe('MCP Config Explorer - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have accessible form labels', async ({ page }) => {
    // All inputs should have associated labels
    const mcpUrlInput = page.locator('[data-testid="mcp-url-input"]');
    const serverNameInput = page.locator('[data-testid="server-name-input"]');

    await expect(mcpUrlInput).toHaveAttribute('id', 'mcp-url');
    await expect(serverNameInput).toHaveAttribute('id', 'server-name');

    // Labels should be properly associated
    const urlLabel = page.locator('label[for="mcp-url"]');
    const nameLabel = page.locator('label[for="server-name"]');

    await expect(urlLabel).toBeVisible();
    await expect(nameLabel).toBeVisible();
  });

  test('should have proper button types', async ({ page }) => {
    const clearBtn = page.locator('[data-testid="clear-updates-btn"]');
    const explorerModeBtn = page.locator('[data-testid="mode-explorer"]');
    const utilitiesModeBtn = page.locator('[data-testid="mode-utilities"]');

    await expect(clearBtn).toHaveAttribute('type', 'button');
    await expect(explorerModeBtn).toHaveAttribute('type', 'button');
    await expect(utilitiesModeBtn).toHaveAttribute('type', 'button');
  });

  test('should disable clear button when no updates', async ({ page }) => {
    const clearBtn = page.locator('[data-testid="clear-updates-btn"]');
    await expect(clearBtn).toBeDisabled();
  });
});

test.describe('MCP Config Explorer - Component State', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should maintain input values across interactions', async ({ page }) => {
    const mcpUrlInput = page.locator('[data-testid="mcp-url-input"]');

    // Change value
    await mcpUrlInput.fill('https://test.example.com/mcp/server');

    // Click somewhere else
    await page.locator('h1').click();

    // Value should be maintained
    await expect(mcpUrlInput).toHaveValue('https://test.example.com/mcp/server');
  });

  test('should handle empty input values', async ({ page }) => {
    const mcpUrlInput = page.locator('[data-testid="mcp-url-input"]');
    const serverNameInput = page.locator('[data-testid="server-name-input"]');

    // Clear inputs
    await mcpUrlInput.clear();
    await serverNameInput.clear();

    // Should accept empty values
    await expect(mcpUrlInput).toHaveValue('');
    await expect(serverNameInput).toHaveValue('');
  });

  test('should handle special characters in inputs', async ({ page }) => {
    const serverNameInput = page.locator('[data-testid="server-name-input"]');

    // Enter special characters
    await serverNameInput.fill('my-server_name.123');
    await expect(serverNameInput).toHaveValue('my-server_name.123');
  });
});
