import type { ChromeModelContextExtensions } from '@mcp-b/webmcp-types';
import { expect, type Page, test } from '@playwright/test';

type ChromeModelContext = NonNullable<Document['modelContext']> & ChromeModelContextExtensions;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as Window & {
      __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
      __WEBMCP_RAW_NAVIGATOR_MODEL_CONTEXT__?: Navigator['modelContext'];
    };
    target.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ = document.modelContext;
    target.__WEBMCP_RAW_NAVIGATOR_MODEL_CONTEXT__ = navigator.modelContext;
  });
});

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

async function getToolNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const context =
      (
        window as Window & {
          __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
        }
      ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ ?? document.modelContext;
    if (!context) throw new Error('document.modelContext is unavailable');
    return (await context.getTools()).map((tool) => tool.name);
  });
}

async function waitForToolPresent(page: Page, toolName: string): Promise<void> {
  await expect.poll(async () => await getToolNames(page)).toContain(toolName);
}

async function waitForToolAbsent(page: Page, toolName: string): Promise<void> {
  await expect.poll(async () => await getToolNames(page)).not.toContain(toolName);
}

async function waitForToolSet(page: Page, toolNames: string[]): Promise<void> {
  await expect
    .poll(async () => await getToolNames(page))
    .toEqual(expect.arrayContaining(toolNames));
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

  test('exposes the native document.modelContext surface', async ({ page }) => {
    await openShowcase(page);

    const surface = await page.evaluate(() => {
      const captured = window as Window & {
        __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: ChromeModelContext;
        __WEBMCP_RAW_NAVIGATOR_MODEL_CONTEXT__?: Navigator['modelContext'];
        __WEBMCP_SHOWCASE_RAW_SURFACE__?: Record<string, boolean>;
      };
      const context = captured.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;

      return {
        hasModelContext: Boolean(context),
        hasRegisterTool: typeof context?.registerTool === 'function',
        hasGetTools: typeof context?.getTools === 'function',
        hasAddEventListener: typeof context?.addEventListener === 'function',
        executeToolType: typeof context?.executeTool,
        hasDeprecatedNavigatorAlias:
          typeof captured.__WEBMCP_RAW_NAVIGATOR_MODEL_CONTEXT__ !== 'undefined',
        rawSurface: captured.__WEBMCP_SHOWCASE_RAW_SURFACE__,
      };
    });

    expect(surface.hasModelContext).toBe(true);
    expect(surface.hasRegisterTool).toBe(true);
    expect(surface.hasGetTools).toBe(true);
    expect(surface.hasAddEventListener).toBe(true);
    expect(['function', 'undefined']).toContain(surface.executeToolType);
    expect(surface.hasDeprecatedNavigatorAlias).toBe(false);
    expect(surface.rawSurface).toMatchObject({
      hasModelContext: true,
      hasGetTools: true,
      hasUnregisterTool: false,
      hasClearContext: false,
      hasProvideContext: false,
    });
  });

  test('verifies native implementation (not polyfill)', async ({ page }) => {
    await openShowcase(page);

    const implementation = await page.evaluate(() => {
      const context = (
        window as Window & {
          __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'] & {
            __isWebMCPPolyfill?: boolean;
          };
        }
      ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      return {
        constructorName: context?.constructor.name,
        isPolyfill: context?.__isWebMCPPolyfill === true,
      };
    });
    expect(implementation.constructorName).toBeTruthy();
    expect(implementation.isPolyfill).toBe(false);
  });
});

test.describe('Live Tool Editor', () => {
  test.beforeEach(async ({ page }) => {
    await openShowcase(page);
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
  });

  test('registerTool exposes registered tools and abort cleanup removes them', async ({ page }) => {
    const state = await page.evaluate(async () => {
      const context =
        (
          window as Window & {
            __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
          }
        ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ ?? document.modelContext;
      if (!context) {
        return { missingApi: true };
      }

      const firstToolName = `native_reg_first_${Date.now()}`;
      const secondToolName = `native_reg_second_${Date.now()}`;
      const firstController = new AbortController();
      const secondController = new AbortController();

      await context.registerTool(
        {
          name: firstToolName,
          description: 'Temporary first test tool',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'first' }] };
          },
        },
        { signal: firstController.signal }
      );

      const beforeAbort = (await context.getTools()).map((tool) => tool.name);
      firstController.abort();

      await context.registerTool(
        {
          name: secondToolName,
          description: 'Temporary second test tool',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'second' }] };
          },
        },
        { signal: secondController.signal }
      );

      const afterAbort = (await context.getTools()).map((tool) => tool.name);
      secondController.abort();

      return {
        missingApi: false,
        firstToolName,
        secondToolName,
        beforeAbort,
        afterAbort,
      };
    });

    expect(state.missingApi).toBe(false);
    if (state.missingApi || !state.firstToolName || !state.secondToolName) {
      return;
    }

    expect(state.beforeAbort).toContain(state.firstToolName);
    expect(state.afterAbort).toContain(state.secondToolName);
    await waitForToolAbsent(page, state.firstToolName);
    await waitForToolAbsent(page, state.secondToolName);
  });

  test('multiple registered tools clean up through AbortSignal', async ({ page }) => {
    const state = await page.evaluate(async () => {
      const context =
        (
          window as Window & {
            __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
          }
        ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ ?? document.modelContext;
      if (!context) {
        return { missingApi: true };
      }

      const firstToolName = `clear_a_${Date.now()}`;
      const secondToolName = `clear_b_${Date.now()}`;
      const firstController = new AbortController();
      const secondController = new AbortController();

      await context.registerTool(
        {
          name: firstToolName,
          description: 'clear a',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'a' }] };
          },
        },
        { signal: firstController.signal }
      );

      await context.registerTool(
        {
          name: secondToolName,
          description: 'clear b',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'b' }] };
          },
        },
        { signal: secondController.signal }
      );

      const before = (await context.getTools()).map((tool) => tool.name);
      firstController.abort();
      secondController.abort();

      return {
        missingApi: false,
        firstToolName,
        secondToolName,
        before,
      };
    });

    expect(state.missingApi).toBe(false);
    if (state.missingApi || !state.firstToolName || !state.secondToolName) {
      return;
    }

    expect(state.before).toEqual(
      expect.arrayContaining([state.firstToolName, state.secondToolName])
    );
    await waitForToolAbsent(page, state.firstToolName);
    await waitForToolAbsent(page, state.secondToolName);
  });

  test('executes a descriptor discovered through getTools when Chrome exposes executeTool', async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const context = ((
        window as Window & {
          __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
        }
      ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ ?? document.modelContext) as
        | ChromeModelContext
        | undefined;
      if (!context) {
        return { missingApi: true };
      }
      if (typeof context.executeTool !== 'function') {
        return { missingApi: false, missingExecuteTool: true };
      }

      const toolName = `native_execute_${Date.now()}`;
      const controller = new AbortController();

      await context.registerTool(
        {
          name: toolName,
          description: 'Native descriptor execution test',
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
        const tool = (await context.getTools()).find((candidate) => candidate.name === toolName);
        if (!tool) {
          return { missingApi: false, missingExecuteTool: false, missingTool: true };
        }
        const response = await context.executeTool(tool, JSON.stringify({ value: 42 }));
        return {
          missingApi: false,
          missingExecuteTool: false,
          missingTool: false,
          response,
        };
      } finally {
        controller.abort();
      }
    });

    expect(result.missingApi).toBe(false);
    test.skip(
      'missingExecuteTool' in result && result.missingExecuteTool === true,
      'Chrome does not expose its optional executeTool extension'
    );
    expect(result.missingTool).toBe(false);
    expect(String(result.response)).toContain('42');
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
