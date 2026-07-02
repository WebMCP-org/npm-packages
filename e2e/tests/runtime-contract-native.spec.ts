import { expect, type Page, test } from '@playwright/test';
import {
  DYNAMIC_TOOL_NAME,
  getCanonicalToolNames,
  readInvocations,
  registerDynamicToolInPage,
  resetInvocations,
  unregisterDynamicToolInPage,
  waitForRuntimePage,
} from './runtime-contract.helpers.js';

async function listNativeToolNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    return (
      navigator.modelContextTesting
        ?.listTools()
        .map((tool) => tool.name)
        .sort() ?? []
    );
  });
}

async function executeNativeToolText(
  page: Page,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  return page.evaluate(
    async ({ toolName, toolArgs }) => {
      const result = await navigator.modelContextTesting?.executeTool(
        toolName,
        JSON.stringify(toolArgs)
      );
      if (typeof result !== 'string') {
        const candidate = result as { content?: Array<{ text?: string }> } | null | undefined;
        const content = Array.isArray(candidate?.content) ? candidate.content : [];
        return typeof content[0]?.text === 'string' ? content[0].text : JSON.stringify(result);
      }

      try {
        const parsed = JSON.parse(result) as { content?: Array<{ text?: string }> };
        return typeof parsed.content?.[0]?.text === 'string' ? parsed.content[0].text : result;
      } catch {
        return result;
      }
    },
    { toolName: name, toolArgs: args }
  );
}

async function executeNativeToolError(
  page: Page,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  return page.evaluate(
    async ({ toolName, toolArgs }) => {
      try {
        await navigator.modelContextTesting?.executeTool(toolName, JSON.stringify(toolArgs));
        return '';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    { toolName: name, toolArgs: args }
  );
}

test.describe('Runtime Contract - Browser API Caller', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const target = window as Window & {
        __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
        __WEBMCP_RAW_MODEL_CONTEXT_TESTING__?: Navigator['modelContextTesting'];
      };
      target.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ = document.modelContext;
      target.__WEBMCP_RAW_MODEL_CONTEXT_TESTING__ = navigator.modelContextTesting;
    });
    await waitForRuntimePage(page, '/runtime-contract.html');
  });

  test('runs against native modelContextTesting instead of the polyfill shim', async ({ page }) => {
    const runtime = await page.evaluate(() => {
      const testing = navigator.modelContextTesting as
        | (Navigator['modelContextTesting'] & {
            __isWebMCPPolyfill?: boolean;
            reset?: unknown;
            getToolCalls?: unknown;
          })
        | undefined;
      const rawModelContext = (
        window as Window & {
          __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: {
            __isWebMCPPolyfill?: boolean;
            __isBrowserMcpServer?: boolean;
          };
        }
      ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      const modelContext = document.modelContext as unknown as {
        __isWebMCPPolyfill?: boolean;
        __isBrowserMcpServer?: boolean;
      };

      return {
        hasDocumentModelContext: typeof document.modelContext !== 'undefined',
        documentNavigatorSameInstance: document.modelContext === navigator.modelContext,
        hasRawDocumentModelContext: typeof rawModelContext !== 'undefined',
        testingConstructorName: testing?.constructor.name ?? '',
        testingHasPolyfillMarker: testing?.__isWebMCPPolyfill === true,
        rawModelContextHasPolyfillMarker: rawModelContext?.__isWebMCPPolyfill === true,
        rawModelContextHasBrowserServerMarker: rawModelContext?.__isBrowserMcpServer === true,
        modelContextHasPolyfillMarker: modelContext.__isWebMCPPolyfill === true,
        testingHasPolyfillReset: typeof testing?.reset === 'function',
        testingHasPolyfillCallLog: typeof testing?.getToolCalls === 'function',
      };
    });

    expect(runtime.hasDocumentModelContext).toBe(true);
    expect(runtime.documentNavigatorSameInstance).toBe(true);
    expect(runtime.hasRawDocumentModelContext).toBe(true);
    expect(runtime.testingConstructorName).toBeTruthy();
    expect(runtime.testingConstructorName).not.toBe('PolyfillTestingShim');
    expect(runtime.testingHasPolyfillMarker).toBe(false);
    expect(runtime.rawModelContextHasPolyfillMarker).toBe(false);
    expect(runtime.rawModelContextHasBrowserServerMarker).toBe(false);
    expect(runtime.modelContextHasPolyfillMarker).toBe(false);
    expect(runtime.testingHasPolyfillReset).toBe(false);
    expect(runtime.testingHasPolyfillCallLog).toBe(false);
  });

  test('discovers the canonical base tool set through browser APIs', async ({ page }) => {
    const toolNames = await listNativeToolNames(page);
    expect(toolNames).toEqual(expect.arrayContaining(getCanonicalToolNames(false)));
    expect(toolNames).toHaveLength(getCanonicalToolNames(false).length);
  });

  test('supports producer getTools and executeTool shape on document.modelContext', async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const modelContext = (
        window as Window & {
          __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
        }
      ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      if (!modelContext) {
        return { missingRawModelContext: true, missingSumTool: false, toolsArePromise: false };
      }
      const toolsPromise = modelContext.getTools();
      const tools = await toolsPromise;
      const sumTool = tools.find((tool) => tool.name === 'sum');
      if (!sumTool) {
        return { missingRawModelContext: false, missingSumTool: true, toolsArePromise: false };
      }

      const execution = await modelContext.executeTool(sumTool, JSON.stringify({ a: 4, b: 7 }));

      return {
        missingRawModelContext: false,
        missingSumTool: false,
        toolsArePromise: typeof toolsPromise.then === 'function',
        toolInfo: {
          name: sumTool.name,
          title: sumTool.title,
          description: sumTool.description,
          inputSchemaType: typeof sumTool.inputSchema,
          originType: typeof sumTool.origin,
          hasWindow: typeof sumTool.window === 'object',
        },
        execution,
      };
    });

    expect(result.missingRawModelContext).toBe(false);
    expect(result.missingSumTool).toBe(false);
    expect(result.toolsArePromise).toBe(true);
    expect(result.toolInfo).toMatchObject({
      name: 'sum',
      inputSchemaType: 'string',
      originType: 'string',
      hasWindow: true,
    });
    expect(result.execution).toContain('sum:11');
  });

  test('executes a registered tool through modelContextTesting and records the invocation', async ({
    page,
  }) => {
    await resetInvocations(page);

    const text = await executeNativeToolText(page, 'sum', { a: 8, b: 1 });
    expect(text).toBe('sum:9');

    await expect
      .poll(async () => await readInvocations(page))
      .toEqual([
        {
          name: 'sum',
          arguments: { a: 8, b: 1 },
        },
      ]);
  });

  test('reflects dynamic registration changes through the browser API surface', async ({
    page,
  }) => {
    await expect(registerDynamicToolInPage(page)).resolves.toBe(true);
    await expect.poll(async () => await listNativeToolNames(page)).toContain(DYNAMIC_TOOL_NAME);

    const text = await executeNativeToolText(page, DYNAMIC_TOOL_NAME, { value: 'browser-api' });
    expect(text).toBe('dynamic:browser-api');
  });

  test('stops exposing unregistered tools and later execution fails', async ({ page }) => {
    await registerDynamicToolInPage(page);
    await expect.poll(async () => await listNativeToolNames(page)).toContain(DYNAMIC_TOOL_NAME);

    await expect(unregisterDynamicToolInPage(page)).resolves.toBe(true);
    await expect.poll(async () => await listNativeToolNames(page)).not.toContain(DYNAMIC_TOOL_NAME);

    const errorMessage = await executeNativeToolError(page, DYNAMIC_TOOL_NAME, { value: 'gone' });
    expect(errorMessage).toContain(DYNAMIC_TOOL_NAME);
  });

  test('propagates runtime-thrown errors through the browser API caller', async ({
    page,
  }, testInfo) => {
    await resetInvocations(page);

    const errorMessage = await executeNativeToolError(page, 'always_fail', { reason: 'native' });
    if (testInfo.project.name === 'chrome-m152-webmcp' || testInfo.project.name === 'chromium') {
      // Current native Chrome builds normalize thrown tool errors into a generic failure string.
      expect(errorMessage).toMatch(/always_fail:native|invocation failed/i);
    } else {
      expect(errorMessage).toContain('always_fail:native');
    }

    await expect
      .poll(async () => await readInvocations(page))
      .toEqual([
        {
          name: 'always_fail',
          arguments: { reason: 'native' },
        },
      ]);
  });
});
