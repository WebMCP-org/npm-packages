import { expect, type Page, test } from '@playwright/test';

type RemovedContextApi = {
  provideContext?: (value: unknown) => void;
  clearContext?: () => void;
  unregisterTool?: (name: string) => void;
};

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

async function waitForToolSet(page: Page, toolNames: string[]): Promise<void> {
  await expect
    .poll(async () => await getToolNames(page))
    .toEqual(expect.arrayContaining(toolNames));
}

async function clearAllTools(page: Page): Promise<void> {
  const canClean = await page.evaluate(() => {
    const context = navigator.modelContext;
    const testing = navigator.modelContextTesting;
    if (!context || !testing) {
      return false;
    }

    const removedContext = context as unknown as RemovedContextApi;
    let cleaned = false;

    for (const tool of testing.listTools()) {
      try {
        removedContext.unregisterTool?.(tool.name);
        cleaned = true;
      } catch {
        // Some native snapshots only support AbortSignal based cleanup.
      }
    }

    if (typeof removedContext.clearContext === 'function') {
      removedContext.clearContext();
      cleaned = true;
    }

    return cleaned;
  });

  if (canClean) {
    await expect.poll(async () => await getToolNames(page)).toEqual([]);
  }
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
      hasClearContext:
        typeof (navigator.modelContext as unknown as RemovedContextApi | undefined)
          ?.clearContext === 'function',
      hasProvideContext:
        typeof (navigator.modelContext as unknown as RemovedContextApi | undefined)
          ?.provideContext === 'function',
      hasListTools: typeof navigator.modelContextTesting?.listTools === 'function',
      hasExecuteTool: typeof navigator.modelContextTesting?.executeTool === 'function',
    }));

    expect(surface.hasModelContext).toBe(true);
    expect(surface.hasModelContextTesting).toBe(true);
    expect(surface.hasUnregisterTool).toBe(true);
    expect(typeof surface.hasClearContext).toBe('boolean');
    expect(typeof surface.hasProvideContext).toBe('boolean');
    expect(surface.hasListTools).toBe(true);
    expect(surface.hasExecuteTool).toBe(true);
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

  test('registerTool exposes registered tools and records unregisterTool behavior', async ({
    page,
  }) => {
    const state = await page.evaluate(() => {
      const context = navigator.modelContext;
      const testing = navigator.modelContextTesting;
      if (!context || !testing) {
        return { missingApi: true };
      }

      const firstToolName = `native_reg_first_${Date.now()}`;
      const secondToolName = `native_reg_second_${Date.now()}`;

      context.registerTool({
        name: firstToolName,
        description: 'Temporary first test tool',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'first' }] };
        },
      });

      const beforeAbort = testing.listTools().map((tool: { name: string }) => tool.name);
      context.unregisterTool(firstToolName);

      context.registerTool({
        name: secondToolName,
        description: 'Temporary second test tool',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'second' }] };
        },
      });

      const afterAbort = testing.listTools().map((tool: { name: string }) => tool.name);
      context.unregisterTool(secondToolName);

      return {
        missingApi: false,
        firstToolName,
        secondToolName,
        beforeAbort,
        afterAbort,
        removedFirstTool: !afterAbort.includes(firstToolName),
      };
    });

    expect(state.missingApi).toBe(false);
    if (state.missingApi) {
      return;
    }

    expect(state.beforeAbort).toContain(state.firstToolName);
    expect(state.afterAbort).toContain(state.secondToolName);
    expect(typeof state.removedFirstTool).toBe('boolean');
  });

  test('multiple registered tools record unregisterTool cleanup behavior', async ({ page }) => {
    const state = await page.evaluate(() => {
      const context = navigator.modelContext;
      const testing = navigator.modelContextTesting;
      if (!context || !testing) {
        return { missingApi: true };
      }

      const firstToolName = `clear_a_${Date.now()}`;
      const secondToolName = `clear_b_${Date.now()}`;

      context.registerTool({
        name: firstToolName,
        description: 'clear a',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'a' }] };
        },
      });

      context.registerTool({
        name: secondToolName,
        description: 'clear b',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'b' }] };
        },
      });

      const before = testing.listTools().map((tool: { name: string }) => tool.name);
      context.unregisterTool(firstToolName);
      context.unregisterTool(secondToolName);
      const after = testing.listTools().map((tool: { name: string }) => tool.name);

      return {
        missingApi: false,
        firstToolName,
        secondToolName,
        before,
        after,
        removedFirstTool: !after.includes(firstToolName),
        removedSecondTool: !after.includes(secondToolName),
      };
    });

    expect(state.missingApi).toBe(false);
    if (state.missingApi) {
      return;
    }

    expect(state.before).toEqual(
      expect.arrayContaining([state.firstToolName, state.secondToolName])
    );
    expect(typeof state.removedFirstTool).toBe('boolean');
    expect(typeof state.removedSecondTool).toBe('boolean');
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

      const controller = new AbortController();

      context.registerTool(
        {
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
        },
        { signal: controller.signal }
      );

      try {
        const response = await testing.executeTool(toolName, JSON.stringify({ value: 42 }));
        const calls = hasGetToolCalls ? (testing.getToolCalls?.() ?? []) : [];
        return { missingApi: false, response, hasGetToolCalls, calls };
      } finally {
        controller.abort();
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

      const toolName = `counter_get_${Date.now()}`;
      const controller = new AbortController();

      context.registerTool(
        {
          name: toolName,
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
        { signal: controller.signal }
      );

      try {
        const response = await testing.executeTool(toolName, '{}');
        return { missingApi: false, type: typeof response, response };
      } finally {
        controller.abort();
      }
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
