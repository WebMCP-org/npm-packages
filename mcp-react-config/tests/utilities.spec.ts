import { expect, test } from '@playwright/test';

test.describe('MCP Config Explorer - Utilities', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Switch to utilities mode
    const utilitiesMode = page.locator('[data-testid="mode-utilities"]');
    await utilitiesMode.click();
  });

  test('should display all platform options', async ({ page }) => {
    const platformSelect = page.locator('[data-testid="platform-select"]');

    // Get all options
    const options = await platformSelect.locator('option').all();
    expect(options.length).toBeGreaterThanOrEqual(7);

    // Verify specific platforms
    const optionTexts = await Promise.all(options.map((opt) => opt.textContent()));
    expect(optionTexts).toContain('Claude Desktop');
    expect(optionTexts).toContain('Cursor');
    expect(optionTexts).toContain('VSCode');
    expect(optionTexts).toContain('Continue.dev');
    expect(optionTexts).toContain('Cline');
    expect(optionTexts).toContain('Windsurf');
    expect(optionTexts).toContain('Codex');
  });

  test('should handle JSON config content', async ({ page }) => {
    const configContent = page.locator('[data-testid="config-content-input"]');

    const jsonConfig = JSON.stringify(
      {
        mcpServers: {
          existing: {
            url: 'https://existing.example.com',
          },
        },
      },
      null,
      2
    );

    await configContent.fill(jsonConfig);
    await expect(configContent).toHaveValue(jsonConfig);
  });

  test('should handle YAML config content', async ({ page }) => {
    const platformSelect = page.locator('[data-testid="platform-select"]');
    await platformSelect.selectOption('continue-dev');

    const configContent = page.locator('[data-testid="config-content-input"]');

    const yamlConfig = `mcpServers:
  - name: existing-server
    type: streamable-http
    url: https://existing.example.com`;

    await configContent.fill(yamlConfig);
    await expect(configContent).toHaveValue(yamlConfig);
  });

  test('should handle TOML config content', async ({ page }) => {
    const platformSelect = page.locator('[data-testid="platform-select"]');
    await platformSelect.selectOption('codex');

    const configContent = page.locator('[data-testid="config-content-input"]');

    const tomlConfig = `[mcp_servers.existing]
command = "npx"
args = ["-y", "mcp-remote", "https://existing.example.com"]`;

    await configContent.fill(tomlConfig);
    await expect(configContent).toHaveValue(tomlConfig);
  });

  test('should change platform and verify format changes', async ({ page }) => {
    const platformSelect = page.locator('[data-testid="platform-select"]');

    // Test JSON platforms
    for (const platform of ['claude-desktop', 'cursor', 'vscode', 'cline', 'windsurf']) {
      await platformSelect.selectOption(platform);
      await expect(platformSelect).toHaveValue(platform);
    }

    // Test YAML platform
    await platformSelect.selectOption('continue-dev');
    await expect(platformSelect).toHaveValue('continue-dev');

    // Test TOML platform
    await platformSelect.selectOption('codex');
    await expect(platformSelect).toHaveValue('codex');
  });

  test('should have utility buttons ready', async ({ page }) => {
    const generateBtn = page.locator('[data-testid="test-generate-config"]');
    const mergeBtn = page.locator('[data-testid="test-merge-config"]');
    const formatBtn = page.locator('[data-testid="test-format-config"]');

    await expect(generateBtn).toBeEnabled();
    await expect(mergeBtn).toBeEnabled();
    await expect(formatBtn).toBeEnabled();
  });

  test('should display output section', async ({ page }) => {
    const output = page.locator('[data-testid="utility-output"]');
    await expect(output).toBeVisible();

    const outputContent = page.locator('#utility-output-content');
    await expect(outputContent).toBeVisible();
  });

  test('should handle large config content', async ({ page }) => {
    const configContent = page.locator('[data-testid="config-content-input"]');

    // Create a large config
    const largeConfig = {
      mcpServers: {} as Record<string, unknown>,
    };

    for (let i = 0; i < 50; i++) {
      largeConfig.mcpServers[`server-${i}`] = {
        url: `https://server-${i}.example.com`,
        timeout: 30000,
      };
    }

    const configText = JSON.stringify(largeConfig, null, 2);
    await configContent.fill(configText);

    // Verify it was set
    const value = await configContent.inputValue();
    expect(value.length).toBeGreaterThan(1000);
  });

  test('should clear config content', async ({ page }) => {
    const configContent = page.locator('[data-testid="config-content-input"]');

    // Add content
    await configContent.fill('{"test": "content"}');
    await expect(configContent).toHaveValue('{"test": "content"}');

    // Clear
    await configContent.clear();
    await expect(configContent).toHaveValue('');
  });

  test('should maintain platform selection across content changes', async ({ page }) => {
    const platformSelect = page.locator('[data-testid="platform-select"]');
    const configContent = page.locator('[data-testid="config-content-input"]');

    // Select cursor
    await platformSelect.selectOption('cursor');

    // Add content
    await configContent.fill('{"mcpServers": {}}');

    // Platform should still be cursor
    await expect(platformSelect).toHaveValue('cursor');

    // Clear content
    await configContent.clear();

    // Platform should still be cursor
    await expect(platformSelect).toHaveValue('cursor');
  });
});

test.describe('MCP Config Explorer - Platform Configuration Formats', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Switch to utilities mode
    const utilitiesMode = page.locator('[data-testid="mode-utilities"]');
    await utilitiesMode.click();
  });

  test('should support Claude Desktop JSON format', async ({ page }) => {
    const platformSelect = page.locator('[data-testid="platform-select"]');
    await platformSelect.selectOption('claude-desktop');

    const configContent = page.locator('[data-testid="config-content-input"]');
    const config = {
      mcpServers: {
        'test-server': {
          url: 'https://test.example.com/mcp',
        },
      },
    };

    await configContent.fill(JSON.stringify(config, null, 2));
    await expect(configContent).toHaveValue(JSON.stringify(config, null, 2));
  });

  test('should support Cursor JSON format', async ({ page }) => {
    const platformSelect = page.locator('[data-testid="platform-select"]');
    await platformSelect.selectOption('cursor');

    const configContent = page.locator('[data-testid="config-content-input"]');
    const config = {
      mcpServers: {
        webmcp: {
          url: 'https://api.example.com/mcp',
        },
      },
    };

    await configContent.fill(JSON.stringify(config, null, 2));
    await expect(configContent).toHaveValue(JSON.stringify(config, null, 2));
  });

  test('should support VSCode JSON format', async ({ page }) => {
    const platformSelect = page.locator('[data-testid="platform-select"]');
    await platformSelect.selectOption('vscode');

    const configContent = page.locator('[data-testid="config-content-input"]');
    const config = {
      servers: {
        webmcp: {
          type: 'http',
          url: 'https://api.example.com/mcp',
        },
      },
    };

    await configContent.fill(JSON.stringify(config, null, 2));
    await expect(configContent).toHaveValue(JSON.stringify(config, null, 2));
  });

  test('should support Cline streamableHttp format', async ({ page }) => {
    const platformSelect = page.locator('[data-testid="platform-select"]');
    await platformSelect.selectOption('cline');

    const configContent = page.locator('[data-testid="config-content-input"]');
    const config = {
      mcpServers: {
        webmcp: {
          type: 'streamableHttp',
          url: 'https://api.example.com/mcp',
          disabled: false,
        },
      },
    };

    await configContent.fill(JSON.stringify(config, null, 2));
    await expect(configContent).toHaveValue(JSON.stringify(config, null, 2));
  });

  test('should support Windsurf npx command format', async ({ page }) => {
    const platformSelect = page.locator('[data-testid="platform-select"]');
    await platformSelect.selectOption('windsurf');

    const configContent = page.locator('[data-testid="config-content-input"]');
    const config = {
      mcpServers: {
        webmcp: {
          command: 'npx',
          args: ['-y', 'mcp-remote', 'https://api.example.com/mcp'],
        },
      },
    };

    await configContent.fill(JSON.stringify(config, null, 2));
    await expect(configContent).toHaveValue(JSON.stringify(config, null, 2));
  });

  test('should support Continue.dev YAML format', async ({ page }) => {
    const platformSelect = page.locator('[data-testid="platform-select"]');
    await platformSelect.selectOption('continue-dev');

    const configContent = page.locator('[data-testid="config-content-input"]');
    const yamlContent = `mcpServers:
  - name: WebMCP
    type: streamable-http
    url: https://api.example.com/mcp`;

    await configContent.fill(yamlContent);
    await expect(configContent).toHaveValue(yamlContent);
  });

  test('should support Codex TOML format', async ({ page }) => {
    const platformSelect = page.locator('[data-testid="platform-select"]');
    await platformSelect.selectOption('codex');

    const configContent = page.locator('[data-testid="config-content-input"]');
    const tomlContent = `[mcp_servers.webmcp]
command = "npx"
args = ["-y", "mcp-remote", "https://api.example.com/mcp"]`;

    await configContent.fill(tomlContent);
    await expect(configContent).toHaveValue(tomlContent);
  });
});

test.describe('MCP Config Explorer - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should not show error initially', async ({ page }) => {
    const errorMessage = page.locator('[data-testid="error-message"]');
    await expect(errorMessage).not.toBeVisible();
  });

  test('should handle invalid input gracefully', async ({ page }) => {
    const mcpUrlInput = page.locator('[data-testid="mcp-url-input"]');

    // Enter invalid URL (should still accept it - validation happens on use)
    await mcpUrlInput.fill('not-a-valid-url');
    await expect(mcpUrlInput).toHaveValue('not-a-valid-url');
  });

  test('should handle special characters in server name', async ({ page }) => {
    const serverNameInput = page.locator('[data-testid="server-name-input"]');

    // Enter special characters
    await serverNameInput.fill('test@#$%server!');
    await expect(serverNameInput).toHaveValue('test@#$%server!');
  });
});
