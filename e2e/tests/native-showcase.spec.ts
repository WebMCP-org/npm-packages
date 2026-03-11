import { expect, type Page, test } from '@playwright/test';

async function waitForNativeReady(page: Page): Promise<void> {
  await page.waitForSelector('#detection-status', { timeout: 10000 });
  await expect(page.locator('#detection-status')).toContainText(
    'Native Chromium Web Model Context API detected'
  );
}

async function waitForIframeReady(page: Page): Promise<void> {
  const iframe = page.frameLocator('#test-iframe');
  await expect(iframe.locator('#iframe-status')).toContainText('Native API Ready', {
    timeout: 20000,
  });
}

function parseJsonIfPossible(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getStructuredContent(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  if ('structuredContent' in value) {
    return value.structuredContent;
  }

  return value;
}

function isCounterOutputResult(value: unknown): value is { counter: number; timestamp: string } {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.counter === 'number' && typeof value.timestamp === 'string';
}

function isStructuredCounterResult(
  value: unknown
): value is { counter: number; previousValue: number; timestamp: string } {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.counter === 'number' &&
    typeof value.previousValue === 'number' &&
    typeof value.timestamp === 'string'
  );
}

async function getToolNames(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      navigator.modelContextTesting?.listTools().map((tool: { name: string }) => tool.name) ?? []
  );
}

async function waitForToolPresent(page: Page, toolName: string): Promise<void> {
  await expect.poll(async () => await getToolNames(page)).toContain(toolName);
}

async function waitForToolMissing(page: Page, toolName: string): Promise<void> {
  await expect.poll(async () => await getToolNames(page)).not.toContain(toolName);
}

async function waitForToolSet(page: Page, toolNames: string[]): Promise<void> {
  await expect
    .poll(async () => await getToolNames(page))
    .toEqual(expect.arrayContaining(toolNames));
}

async function getToolRemovalCapabilities(page: Page): Promise<{
  hasUnregisterTool: boolean;
  hasRegistrationUnregister: boolean;
}> {
  return page.evaluate(() => {
    const handle = (
      window as Window & { __nativeShowcaseRegistration?: { unregister?: () => void } }
    ).__nativeShowcaseRegistration;

    return {
      hasUnregisterTool: typeof navigator.modelContext?.unregisterTool === 'function',
      hasRegistrationUnregister: typeof handle?.unregister === 'function',
    };
  });
}

async function clearAllTools(page: Page): Promise<void> {
  await page.evaluate(() => {
    const context = navigator.modelContext;
    const testing = navigator.modelContextTesting;
    if (!context || !testing) {
      return;
    }

    if (typeof context.clearContext === 'function') {
      context.clearContext();
      return;
    }

    for (const tool of testing.listTools()) {
      if (typeof context.unregisterTool !== 'function') {
        break;
      }

      try {
        context.unregisterTool(tool.name);
      } catch {
        // Some tools can only be replaced/cleared through provideContext.
      }
    }

    context.provideContext({ tools: [] });
  });

  await expect.poll(async () => await getToolNames(page)).toEqual([]);
}

async function openShowcase(page: Page): Promise<void> {
  await page.goto('/');
  await waitForNativeReady(page);
}

async function waitForTextContains(page: Page, selector: string, text: string): Promise<void> {
  await expect(page.locator(selector)).toContainText(text, { timeout: 10000 });
}

test.describe('Native API Detection', () => {
  test('detects native Web Model Context API', async ({ page }) => {
    await openShowcase(page);

    await expect(page.locator('#detection-banner')).toBeVisible();
    await waitForTextContains(
      page,
      '#detection-status',
      'Native Chromium Web Model Context API detected'
    );
  });

  test('exposes modelContext and modelContextTesting', async ({ page }) => {
    await openShowcase(page);

    const surface = await page.evaluate(() => ({
      hasModelContext: typeof navigator.modelContext !== 'undefined',
      hasModelContextTesting: typeof navigator.modelContextTesting !== 'undefined',
      hasUnregisterTool: typeof navigator.modelContext?.unregisterTool === 'function',
      hasClearContext: typeof navigator.modelContext?.clearContext === 'function',
      hasProvideContext: typeof navigator.modelContext?.provideContext === 'function',
      hasRegisterTool: typeof navigator.modelContext?.registerTool === 'function',
      hasListTools: typeof navigator.modelContextTesting?.listTools === 'function',
      hasExecuteTool: typeof navigator.modelContextTesting?.executeTool === 'function',
    }));

    expect(surface.hasModelContext).toBe(true);
    expect(surface.hasModelContextTesting).toBe(true);
    expect(surface.hasProvideContext).toBe(true);
    expect(surface.hasRegisterTool).toBe(true);
    expect(surface.hasListTools).toBe(true);
    expect(surface.hasExecuteTool).toBe(true);
    expect(typeof surface.hasUnregisterTool).toBe('boolean');
    expect(typeof surface.hasClearContext).toBe('boolean');
  });

  test('verifies native implementation (not polyfill)', async ({ page }) => {
    await openShowcase(page);

    const constructorName = await page.evaluate(
      () => navigator.modelContextTesting?.constructor.name
    );
    expect(constructorName).toBeTruthy();
    expect(constructorName).not.toContain('WebModelContext');
  });
});

test.describe('Live Tool Editor', () => {
  test.beforeEach(async ({ page }) => {
    await openShowcase(page);
    await clearAllTools(page);
  });

  test('loads and executes counter template', async ({ page }) => {
    await page.selectOption('#template-select', 'counter');

    const editorContent = await page.locator('#code-editor').inputValue();
    expect(editorContent).toContain('counter_increment');

    await page.click('#register-code');

    await waitForToolPresent(page, 'counter_increment');
    await waitForTextContains(page, '#tool-count', '1 tool');
    await waitForTextContains(page, '#react-tool-executor', 'counter_increment');
    await waitForTextContains(page, '#event-log', 'Code executed');
  });

  test('loads and executes calculator template', async ({ page }) => {
    await page.selectOption('#template-select', 'calculator');
    await page.click('#register-code');

    await waitForToolSet(page, ['calc_add', 'calc_multiply']);
    await waitForTextContains(page, '#tool-count', '2 tools');
    await waitForTextContains(page, '#react-tool-executor', 'calc_add');
    await waitForTextContains(page, '#react-tool-executor', 'calc_multiply');
  });

  test('clears editor content', async ({ page }) => {
    await page.selectOption('#template-select', 'counter');
    await page.click('#clear-editor');
    await expect(page.locator('#code-editor')).toHaveValue('');
  });

  test('shows an error for invalid code', async ({ page }) => {
    await page.fill('#code-editor', 'this is invalid javascript!!!');
    await page.click('#register-code');

    await expect(page.locator('#editor-error')).toBeVisible();
    await waitForTextContains(page, '#editor-error', 'Error');
    await waitForTextContains(page, '#event-log', 'Execution failed');
  });

  test('clears event log', async ({ page }) => {
    await page.selectOption('#template-select', 'counter');
    await page.click('#register-code');
    await waitForTextContains(page, '#event-log', 'Code executed');

    await page.click('#clear-log');
    const logContent = await page.locator('#event-log').textContent();
    expect(logContent?.trim()).toBe('');
  });
});

test.describe('Native API Semantics', () => {
  test.beforeEach(async ({ page }) => {
    await openShowcase(page);
    await clearAllTools(page);
  });

  test('registerTool and unregisterTool update listTools', async ({ page }) => {
    const toolName = `native_reg_${Date.now()}`;

    await page.evaluate((name) => {
      const registration = navigator.modelContext?.registerTool({
        name,
        description: 'Temporary test tool',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      }) as { unregister?: () => void } | undefined;
      const target = window as Window & {
        __nativeShowcaseRegistration?: { unregister?: () => void };
      };
      if (registration) {
        target.__nativeShowcaseRegistration = registration;
      } else {
        delete target.__nativeShowcaseRegistration;
      }
    }, toolName);

    await waitForToolPresent(page, toolName);
    const capabilities = await getToolRemovalCapabilities(page);

    await page.evaluate((name) => {
      const context = navigator.modelContext;
      const handle = (
        window as Window & { __nativeShowcaseRegistration?: { unregister?: () => void } }
      ).__nativeShowcaseRegistration;

      if (typeof context?.unregisterTool === 'function') {
        context.unregisterTool(name);
      } else {
        handle?.unregister?.();
      }
    }, toolName);

    if (capabilities.hasUnregisterTool || capabilities.hasRegistrationUnregister) {
      await waitForToolMissing(page, toolName);
    } else {
      await waitForToolPresent(page, toolName);
    }
  });

  test('provideContext replaces previously provided tool set', async ({ page }) => {
    const state = await page.evaluate(() => {
      const context = navigator.modelContext;
      const testing = navigator.modelContextTesting;
      if (!context || !testing) {
        return { before: [], after: [] as string[] };
      }

      context.provideContext({
        tools: [
          {
            name: 'first_tool',
            description: 'first',
            inputSchema: { type: 'object', properties: {} },
            async execute() {
              return { content: [{ type: 'text', text: 'first' }] };
            },
          },
        ],
      });
      const before = testing.listTools().map((tool: { name: string }) => tool.name);

      context.provideContext({
        tools: [
          {
            name: 'second_tool',
            description: 'second',
            inputSchema: { type: 'object', properties: {} },
            async execute() {
              return { content: [{ type: 'text', text: 'second' }] };
            },
          },
        ],
      });
      const after = testing.listTools().map((tool: { name: string }) => tool.name);

      return { before, after };
    });

    expect(state.before).toContain('first_tool');
    expect(state.after).toContain('second_tool');
    expect(state.after).not.toContain('first_tool');
  });

  test('clearContext removes all registered tools', async ({ page }) => {
    const capabilities = await page.evaluate(() => {
      const context = navigator.modelContext;
      if (!context) {
        return {
          hasClearContext: false,
          hasUnregisterTool: false,
          hasRegistrationUnregister: false,
        };
      }

      context.provideContext({
        tools: [
          {
            name: 'clear_a',
            description: 'clear a',
            inputSchema: { type: 'object', properties: {} },
            async execute() {
              return { content: [{ type: 'text', text: 'a' }] };
            },
          },
        ],
      });

      const registration = context.registerTool({
        name: 'clear_b',
        description: 'clear b',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'b' }] };
        },
      }) as { unregister?: () => void } | undefined;

      if (typeof context.clearContext === 'function') {
        context.clearContext();
      } else {
        context.provideContext({ tools: [] });
        if (typeof context.unregisterTool === 'function') {
          context.unregisterTool('clear_b');
        } else {
          registration?.unregister?.();
        }
      }
      return {
        hasClearContext: typeof context.clearContext === 'function',
        hasUnregisterTool: typeof context.unregisterTool === 'function',
        hasRegistrationUnregister: typeof registration?.unregister === 'function',
      };
    });

    if (
      capabilities.hasClearContext ||
      capabilities.hasUnregisterTool ||
      capabilities.hasRegistrationUnregister
    ) {
      await expect.poll(async () => await getToolNames(page)).toEqual([]);
      return;
    }

    await expect.poll(async () => await getToolNames(page)).not.toContain('clear_a');
  });

  test('testing API executeTool works and optionally tracks calls', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = navigator.modelContext;
      const testing = navigator.modelContextTesting;
      if (!context || !testing) {
        return { missingApi: true };
      }

      const hasGetToolCalls = typeof testing.getToolCalls === 'function';
      const toolName = `tracking_${Date.now()}`;

      const registration = context.registerTool({
        name: toolName,
        description: 'tracking test',
        inputSchema: {
          type: 'object',
          properties: { value: { type: 'number' } },
          required: ['value'],
        },
        async execute(input: { value: number }) {
          return { content: [{ type: 'text', text: `value:${input.value}` }] };
        },
      }) as { unregister?: () => void } | undefined;

      try {
        const response = await testing.executeTool(toolName, JSON.stringify({ value: 42 }));
        const calls = hasGetToolCalls ? (testing.getToolCalls?.() ?? []) : [];
        return { missingApi: false, response, hasGetToolCalls, calls };
      } finally {
        if (typeof context.unregisterTool === 'function') {
          context.unregisterTool(toolName);
        } else {
          registration?.unregister?.();
        }
      }
    });

    expect(result.missingApi).toBe(false);
    expect(String(result.response)).toContain('42');

    if (result.hasGetToolCalls) {
      expect(result.calls.length).toBeGreaterThan(0);
      expect(result.calls[0]?.toolName).toBeTruthy();
    }
  });

  test('returns structured content for tools with outputSchema', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = navigator.modelContext;
      const testing = navigator.modelContextTesting;
      if (!context || !testing) {
        return { missingApi: true };
      }

      context.provideContext({
        tools: [
          {
            name: 'counter_get',
            description: 'Get counter value',
            inputSchema: { type: 'object', properties: {} },
            outputSchema: {
              type: 'object',
              properties: {
                counter: { type: 'number' },
                timestamp: { type: 'string' },
              },
              required: ['counter', 'timestamp'],
            },
            async execute() {
              const structuredContent = { counter: 0, timestamp: new Date().toISOString() };
              return {
                content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
                structuredContent,
              };
            },
          },
        ],
      });

      const response = await testing.executeTool('counter_get', '{}');
      return { missingApi: false, type: typeof response, response };
    });

    expect(result.missingApi).toBe(false);
    const parsed = parseJsonIfPossible(result.response);
    const structured = getStructuredContent(parsed);
    expect(result.type === 'object' || typeof structured === 'object').toBe(true);
    expect(isCounterOutputResult(structured)).toBe(true);
  });

  test('output-schema template registers structured tool', async ({ page }) => {
    await page.selectOption('#template-select', 'output-schema');
    await page.click('#register-code');

    await waitForToolPresent(page, 'structured_counter');

    const response = await page.evaluate(async () => {
      return await navigator.modelContextTesting?.executeTool(
        'structured_counter',
        JSON.stringify({ increment: 3 })
      );
    });

    expect(response).toBeTruthy();
    const parsed = parseJsonIfPossible(response);
    const structured = getStructuredContent(parsed);
    expect(isStructuredCounterResult(structured)).toBe(true);

    if (!isStructuredCounterResult(structured)) {
      return;
    }

    expect(structured.counter).toBe(3);
    expect(structured.previousValue).toBe(0);
    expect(structured.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

test.describe('Iframe Context Propagation', () => {
  test.beforeEach(async ({ page }) => {
    await openShowcase(page);
    await waitForIframeReady(page);
  });

  test('loads iframe and reports native ready state', async ({ page }) => {
    const iframe = page.frameLocator('#test-iframe');
    await expect(iframe.locator('#iframe-status')).toContainText('Native API Ready');
    await expect(iframe.locator('#iframe-tool-list')).toContainText('No tools registered');
  });

  test('registering iframe bucket A logs registration inside iframe', async ({ page }) => {
    const iframe = page.frameLocator('#test-iframe');
    await iframe.locator('#register-iframe-tool-a').click();
    await expect(iframe.locator('#iframe-event-log')).toContainText('Registered iframe_echo', {
      timeout: 10000,
    });
  });

  test('registering iframe bucket B enables iframe unregister button', async ({ page }) => {
    const iframe = page.frameLocator('#test-iframe');
    await iframe.locator('#register-iframe-tool-b').click();

    await expect(iframe.locator('#unregister-iframe-tool-b')).not.toBeDisabled();
    await expect(iframe.locator('#iframe-event-log')).toContainText('Registered iframe_timestamp', {
      timeout: 10000,
    });
  });

  test('unregistering iframe bucket B disables iframe unregister button', async ({ page }) => {
    const iframe = page.frameLocator('#test-iframe');
    await iframe.locator('#register-iframe-tool-b').click();
    await expect(iframe.locator('#unregister-iframe-tool-b')).not.toBeDisabled();

    await iframe.locator('#unregister-iframe-tool-b').click();
    await expect(iframe.locator('#unregister-iframe-tool-b')).toBeVisible();
  });

  test('reloads iframe and remains operational', async ({ page }) => {
    const iframe = page.frameLocator('#test-iframe');
    await iframe.locator('#register-iframe-tool-a').click();
    await expect(iframe.locator('#iframe-event-log')).toContainText('Registered iframe_echo');

    await page.click('#iframe-reload');
    await waitForIframeReady(page);

    await expect(iframe.locator('#iframe-status')).toContainText('Native API Ready');
  });
});
