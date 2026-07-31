import { expect, test } from '@playwright/test';

test.describe('MCPIframeElement E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the host page
    await page.goto('/mcp-iframe-host.html');

    // Wait for the iframe to connect
    await page.waitForSelector('[data-status="ready"]', { timeout: 10000 });
  });

  test('should connect to iframe MCP server', async ({ page }) => {
    // Verify connection status
    const status = page.locator('#connection-status');
    await expect(status).toHaveAttribute('data-status', 'ready');
    await expect(status).toContainText('Connected');
  });

  test('should reuse one internal iframe after the element is reattached', async ({ page }) => {
    const iframeCount = await page.evaluate(async () => {
      const element = window.mcpIframeHost.getMcpIframe();
      const parent = element.parentElement;
      if (!parent) throw new Error('mcp-iframe parent is unavailable');

      element.remove();
      const ready = new Promise<void>((resolve) => {
        element.addEventListener('mcp-iframe-ready', () => resolve(), { once: true });
      });
      parent.appendChild(element);
      await ready;

      return element.shadowRoot?.querySelectorAll('iframe').length ?? 0;
    });

    expect(iframeCount).toBe(1);
  });

  test('should establish one connection for each iframe source load', async ({ page }) => {
    const readyEventCount = await page.evaluate(async () => {
      const element = window.mcpIframeHost.getMcpIframe();
      let readyEvents = 0;
      let resolveFirstReady: (() => void) | undefined;
      const firstReady = new Promise<void>((resolve) => {
        resolveFirstReady = resolve;
      });
      element.addEventListener('mcp-iframe-ready', () => {
        readyEvents++;
        resolveFirstReady?.();
        resolveFirstReady = undefined;
      });

      const source = new URL(element.getAttribute('src') ?? '/iframe-child.html', location.href);
      source.searchParams.set('reload', String(Date.now()));
      element.setAttribute('target-origin', location.origin);
      element.setAttribute('src', source.href);

      await firstReady;
      await new Promise((resolve) => setTimeout(resolve, 500));
      return readyEvents;
    });

    expect(readyEventCount).toBe(1);
  });

  test('should drain parent tool teardown before re-registering after a source load', async ({
    page,
  }) => {
    const events = await page.evaluate(async () => {
      const modelContext = document.modelContext as unknown as {
        registerTool(tool: unknown, options?: unknown): Promise<void>;
        syncNativeTools(): Promise<number>;
      };
      const originalRegisterTool = modelContext.registerTool.bind(modelContext);
      const originalSyncNativeTools = modelContext.syncNativeTools.bind(modelContext);
      const lifecycleEvents: string[] = [];
      let trackReconnect = false;

      modelContext.registerTool = async (tool, options) => {
        if (trackReconnect) lifecycleEvents.push('register');
        await originalRegisterTool(tool, options);
      };
      modelContext.syncNativeTools = async () => {
        if (trackReconnect) lifecycleEvents.push('sync');
        return originalSyncNativeTools();
      };

      const element = window.mcpIframeHost.getMcpIframe();
      const ready = new Promise<void>((resolve) => {
        element.addEventListener('mcp-iframe-ready', () => resolve(), { once: true });
      });
      const source = new URL(element.getAttribute('src') ?? '/iframe-child.html', location.href);
      source.searchParams.set('native-sync', String(Date.now()));
      trackReconnect = true;
      element.setAttribute('src', source.href);
      await ready;

      return lifecycleEvents;
    });

    expect(events[0]).toBe('sync');
    expect(events).toContain('register');
  });

  test('should cancel a pending reconnect when the element is removed', async ({ page }) => {
    const retryWarnings: string[] = [];
    page.on('console', (message) => {
      if (message.text().includes('iframe.contentWindow not available, will retry')) {
        retryWarnings.push(message.text());
      }
    });

    const state = await page.evaluate(async () => {
      const element = window.mcpIframeHost.getMcpIframe() as unknown as {
        client: unknown;
        ready: boolean;
        exposedTools: string[];
        setAttribute: Element['setAttribute'];
        remove: Element['remove'];
      };
      element.setAttribute('target-origin', location.origin);
      element.remove();
      await new Promise((resolve) => setTimeout(resolve, 500));

      return {
        hasClient: element.client !== null,
        ready: element.ready,
        tools: element.exposedTools,
      };
    });

    expect(state).toEqual({ hasClient: false, ready: false, tools: [] });
    expect(retryWarnings).toEqual([]);
  });

  test('should clear parent registrations when the child closes its MCP session', async ({
    page,
  }) => {
    await page.evaluate(() => window.mcpIframeHost.stopChildRuntime());

    await expect
      .poll(() =>
        page.evaluate(() => {
          const element = window.mcpIframeHost.getMcpIframe();
          return {
            hasClient: element.client !== null,
            ready: element.ready,
            tools: element.exposedTools,
            resources: element.exposedResources,
            prompts: element.exposedPrompts,
          };
        })
      )
      .toEqual({
        hasClient: false,
        ready: false,
        tools: [],
        resources: [],
        prompts: [],
      });

    await expect
      .poll(() => page.evaluate(() => window.mcpIframeHost.getParentTool('add')))
      .toBeUndefined();
  });

  test('should expose tools from iframe', async ({ page }) => {
    // Check exposed tools
    const toolsEl = page.locator('#exposed-tools');
    await expect(toolsEl).toHaveAttribute('data-count', '3');

    // Verify tool names are prefixed
    const toolsText = await toolsEl.textContent();
    expect(toolsText).toContain('child-iframe_add');
    expect(toolsText).toContain('child-iframe_multiply');
    expect(toolsText).toContain('child-iframe_greet');
  });

  test('should preserve strict tool metadata on the parent descriptor', async ({ page }) => {
    const tool = (await page.evaluate(() => window.mcpIframeHost.getParentTool('add'))) as {
      title?: string;
      annotations?: { readOnlyHint?: boolean };
    };

    expect(tool.title).toBe('Add numbers');
    expect(tool.annotations).toMatchObject({ readOnlyHint: true });
  });

  test('should bypass cached list responses when refreshing', async ({ page }) => {
    const cacheModes = await page.evaluate(async () => {
      type ListMethod = (params?: unknown, options?: { cacheMode?: string }) => Promise<unknown>;
      const element = window.mcpIframeHost.getMcpIframe() as unknown as {
        client: Record<string, ListMethod> | null;
        refresh: () => Promise<void>;
      };
      const client = element.client;
      if (!client) throw new Error('Iframe MCP client is unavailable');

      const methods = [
        'listTools',
        'listResources',
        'listResourceTemplates',
        'listPrompts',
      ] as const;
      const originals = new Map<string, ListMethod>();
      const modes: Record<string, string | undefined> = {};

      for (const method of methods) {
        const original = client[method];
        if (!original) throw new Error(`Missing client method: ${method}`);
        originals.set(method, original);
        client[method] = (params, options) => {
          modes[method] = options?.cacheMode;
          return original.call(client, params, options);
        };
      }

      try {
        await element.refresh();
      } finally {
        for (const [method, original] of originals) {
          client[method] = original;
        }
      }
      return modes;
    });

    expect(cacheModes).toEqual({
      listTools: 'refresh',
      listResources: 'refresh',
      listResourceTemplates: 'refresh',
      listPrompts: 'refresh',
    });
  });

  test('should call add tool and get result', async ({ page }) => {
    // Click the add button
    await page.click('#test-add');

    // Wait for result
    await page.waitForSelector('#tool-result[data-result]', { timeout: 5000 });

    // Verify result
    const resultEl = page.locator('#tool-result');
    const result = await resultEl.getAttribute('data-result');
    expect(result).toBe('8'); // 5 + 3 = 8
  });

  test('should call multiply tool and get result', async ({ page }) => {
    // Click the multiply button
    await page.click('#test-multiply');

    // Wait for result
    await page.waitForSelector('#tool-result[data-result]', { timeout: 5000 });

    // Verify result
    const resultEl = page.locator('#tool-result');
    const result = await resultEl.getAttribute('data-result');
    expect(result).toBe('28'); // 4 * 7 = 28
  });

  test('should call greet tool and get result', async ({ page }) => {
    // Click the greet button
    await page.click('#test-greet');

    // Wait for result
    await page.waitForSelector('#tool-result[data-result]', { timeout: 5000 });

    // Verify result
    const resultEl = page.locator('#tool-result');
    const result = await resultEl.getAttribute('data-result');
    expect(result).toBe('Hello, World!');
  });

  test('should verify tools are callable via modelContext', async ({ page }) => {
    // Use page.evaluate to call the tool programmatically
    const result = await page.evaluate(async () => {
      return await window.mcpIframeHost.callTool('add', { a: 10, b: 20 });
    });

    // Verify the result structure
    expect(result).toHaveProperty('content');
    const content = (result as { content: Array<{ type: string; text: string }> }).content;
    const firstContent = content[0];
    expect(firstContent).toBeDefined();
    if (!firstContent) {
      throw new Error('Tool response content was empty');
    }
    expect(firstContent.type).toBe('text');
    expect(firstContent.text).toBe('30');
  });

  test('should expose valid parent resource URIs and forward reads to the iframe', async ({
    page,
  }) => {
    const exposedUri = await page.evaluate(
      () => window.mcpIframeHost.getMcpIframe().exposedResources[0]
    );
    expect(exposedUri).toBeDefined();

    const wrapperUri = new URL(exposedUri!);
    expect(wrapperUri.protocol).toBe('mcp-iframe:');
    expect(wrapperUri.searchParams.get('source')).toBe('child-iframe_');
    expect(wrapperUri.searchParams.get('uri')).toBe('iframe://config');

    const result = (await page.evaluate(() =>
      window.mcpIframeHost.readResource('iframe://config')
    )) as { contents: Array<{ uri: string; text?: string }> };

    expect(result.contents[0]?.uri).toBe('iframe://config');
    expect(JSON.parse(result.contents[0]?.text ?? '{}')).toEqual({
      version: '1.0.0',
      name: 'iframe-child',
    });
  });

  test('should expose resource templates and resolve reads against the child URI', async ({
    page,
  }) => {
    const templateUri = await page.evaluate(() =>
      window.mcpIframeHost.getMcpIframe().exposedResources.find((uri) => uri.includes('{userId}'))
    );
    expect(templateUri).toBeDefined();

    const wrapperTemplate = new URL(templateUri!);
    expect(wrapperTemplate.protocol).toBe('mcp-iframe:');
    expect(wrapperTemplate.searchParams.get('source')).toBe('child-iframe_');
    expect(wrapperTemplate.searchParams.get('uri')).toBe('iframe://users/{userId}');

    const result = (await page.evaluate(
      (uri) => window.mcpIframeHost.readResource(uri),
      templateUri!.replace('{userId}', '42')
    )) as { contents: Array<{ uri: string; text?: string }> };

    expect(result.contents[0]?.uri).toBe('iframe://users/42');
    expect(JSON.parse(result.contents[0]?.text ?? '{}')).toEqual({
      userId: '42',
      source: 'iframe-child',
    });
  });

  test('should automatically mirror child list changes without a manual refresh', async ({
    page,
  }) => {
    const registrationErrors: string[] = [];
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        message.text().includes('[MCPIframe] Failed to register tool')
      ) {
        registrationErrors.push(message.text());
      }
    });

    await page.evaluate(() => window.mcpIframeHost.addChildDynamicItem('resource'));
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.mcpIframeHost
            .getMcpIframe()
            .exposedResources.some(
              (uri) => new URL(uri).searchParams.get('uri') === 'iframe://dynamic'
            )
        )
      )
      .toBe(true);

    await page.evaluate(() => window.mcpIframeHost.addChildDynamicItem('prompt'));
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.mcpIframeHost.getMcpIframe().exposedPrompts.includes('child-iframe_dynamic')
        )
      )
      .toBe(true);

    await page.evaluate(() => window.mcpIframeHost.addChildDynamicItem('tool'));
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.mcpIframeHost.getMcpIframe().exposedTools.includes('child-iframe_dynamic')
        )
      )
      .toBe(true);

    // Removing all three in one turn exercises overlapping list_changed refreshes.
    await page.evaluate(() => window.mcpIframeHost.removeChildDynamicItems());
    await expect
      .poll(() =>
        page.evaluate(() => ({
          hasTool: window.mcpIframeHost
            .getMcpIframe()
            .exposedTools.includes('child-iframe_dynamic'),
          hasResource: window.mcpIframeHost
            .getMcpIframe()
            .exposedResources.some(
              (uri) => new URL(uri).searchParams.get('uri') === 'iframe://dynamic'
            ),
          hasPrompt: window.mcpIframeHost
            .getMcpIframe()
            .exposedPrompts.includes('child-iframe_dynamic'),
        }))
      )
      .toEqual({ hasTool: false, hasResource: false, hasPrompt: false });
    expect(registrationErrors).toEqual([]);
  });
});

test.describe('MCPIframeElement connection lifecycle', () => {
  test('should let the latest channel replace an in-flight reconnect', async ({ page }) => {
    await page.goto('/mcp-iframe-host.html');
    await page.waitForSelector('[data-status="ready"]', { timeout: 10000 });
    await page.evaluate(() => {
      window.mcpIframeHost.getMcpIframe().setAttribute('channel', 'unreachable-channel');
    });
    await page.waitForFunction(
      () => {
        const element = window.mcpIframeHost?.getMcpIframe() as unknown as
          | { client: unknown; ready: boolean }
          | undefined;
        return element?.client !== null && element?.ready === false;
      },
      undefined,
      { timeout: 5000 }
    );

    const reconnected = await page.evaluate(async () => {
      const element = window.mcpIframeHost.getMcpIframe();
      const ready = new Promise<boolean>((resolve) => {
        element.addEventListener('mcp-iframe-ready', () => resolve(true), { once: true });
        setTimeout(() => resolve(false), 1000);
      });
      element.setAttribute('channel', 'mcp-iframe');
      return ready;
    });

    expect(reconnected).toBe(true);
  });

  test('should let the latest source load replace an in-flight connection', async ({ page }) => {
    await page.goto('/mcp-iframe-host.html');
    await page.waitForSelector('[data-status="ready"]', { timeout: 10000 });
    await page.evaluate(() => {
      window.mcpIframeHost.getMcpIframe().setAttribute('channel', 'unreachable-channel');
    });
    await page.waitForFunction(
      () => {
        const element = window.mcpIframeHost?.getMcpIframe() as unknown as
          | { client: unknown; ready: boolean }
          | undefined;
        return element?.client !== null && element?.ready === false;
      },
      undefined,
      { timeout: 5000 }
    );

    const reconnected = await page.evaluate(async () => {
      const element = window.mcpIframeHost.getMcpIframe();
      const ready = new Promise<boolean>((resolve) => {
        element.addEventListener('mcp-iframe-ready', () => resolve(true), { once: true });
        setTimeout(() => resolve(false), 5000);
      });
      const source = new URL(element.getAttribute('src') ?? '/iframe-child.html', location.href);
      source.searchParams.set('supersede', String(Date.now()));
      element.setAttribute('channel', 'mcp-iframe');
      element.setAttribute('src', source.href);
      return ready;
    });

    expect(reconnected).toBe(true);
    await expect
      .poll(() => page.evaluate(() => window.mcpIframeHost.getMcpIframe().exposedTools))
      .toEqual(['child-iframe_add', 'child-iframe_multiply', 'child-iframe_greet']);
  });
});

test.describe('MCP Iframe Client E2E Tests', () => {
  test('should connect and call tool via MCP client', async ({ page }) => {
    await page.goto('/mcp-iframe-client.html');
    await page.waitForSelector('#client-status[data-status="pass"]', { timeout: 15000 });

    const status = page.locator('#client-status');
    await expect(status).toHaveAttribute('data-status', 'pass');

    const tools = page.locator('#client-tools');
    await expect(tools).toContainText('add');

    const result = page.locator('#client-result');
    await expect(result).toHaveAttribute('data-result', '5');
  });
});
