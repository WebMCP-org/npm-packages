import type { ChromeModelContextExtensions, RegisteredTool } from '@mcp-b/webmcp-types';
import { expect, type Page, test } from '@playwright/test';
import {
  DYNAMIC_TOOL_NAME,
  getCanonicalToolNames,
  readInvocations,
  registerDynamicTool,
  resetInvocations,
  unregisterDynamicTool,
  waitForRuntimePage,
} from './runtime-contract.helpers.js';

type NativeModelContext = Pick<NonNullable<Document['modelContext']>, 'getTools'> & {
  executeTool: NonNullable<ChromeModelContextExtensions['executeTool']>;
};

type NativeContextWindow = Window & {
  __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: NativeModelContext;
};

async function listNativeToolNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const modelContext = (window as NativeContextWindow).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
    if (!modelContext) {
      throw new Error('Native document.modelContext is unavailable');
    }

    return (await modelContext.getTools()).map((tool) => tool.name).sort();
  });
}

async function executeNativeToolText(
  page: Page,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  return page.evaluate(
    async ({ toolName, toolArgs }) => {
      const modelContext = (window as NativeContextWindow).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      if (!modelContext) {
        throw new Error('Native document.modelContext is unavailable');
      }

      const tool = (await modelContext.getTools()).find((candidate) => candidate.name === toolName);
      if (!tool) {
        throw new Error(`Native tool is unavailable: ${toolName}`);
      }

      const result = await modelContext.executeTool(tool, JSON.stringify(toolArgs));
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
        const modelContext = (window as NativeContextWindow).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
        if (!modelContext) {
          throw new Error('Native document.modelContext is unavailable');
        }

        const tool = (await modelContext.getTools()).find(
          (candidate) => candidate.name === toolName
        );
        if (!tool) {
          throw new Error(`Native tool is unavailable: ${toolName}`);
        }

        await modelContext.executeTool(tool, JSON.stringify(toolArgs));
        return '';
      } catch (error) {
        return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      }
    },
    { toolName: name, toolArgs: args }
  );
}

test.describe('Runtime Contract - Browser API Caller', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as NativeContextWindow).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ =
        document.modelContext as unknown as NativeModelContext;
    });
    await waitForRuntimePage(page, '/runtime-contract.html');
  });

  test('runs against native document.modelContext instead of the MCP-B polyfill', async ({
    page,
  }) => {
    const runtime = await page.evaluate(() => {
      const rawModelContext = (window as NativeContextWindow)
        .__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ as
        | (NativeModelContext & {
            __isWebMCPPolyfill?: boolean;
            __isBrowserMcpServer?: boolean;
          })
        | undefined;
      const activeModelContext = document.modelContext as unknown as {
        __isWebMCPPolyfill?: boolean;
        __isBrowserMcpServer?: boolean;
      };

      return {
        hasRawDocumentModelContext: typeof rawModelContext !== 'undefined',
        rawModelContextHasGetTools: typeof rawModelContext?.getTools === 'function',
        rawModelContextHasExecuteTool: typeof rawModelContext?.executeTool === 'function',
        rawModelContextHasPolyfillMarker: rawModelContext?.__isWebMCPPolyfill === true,
        rawModelContextHasBrowserServerMarker: rawModelContext?.__isBrowserMcpServer === true,
        activeModelContextHasPolyfillMarker: activeModelContext.__isWebMCPPolyfill === true,
      };
    });

    expect(runtime.hasRawDocumentModelContext).toBe(true);
    expect(runtime.rawModelContextHasGetTools).toBe(true);
    expect(runtime.rawModelContextHasExecuteTool).toBe(true);
    expect(runtime.rawModelContextHasPolyfillMarker).toBe(false);
    expect(runtime.rawModelContextHasBrowserServerMarker).toBe(false);
    expect(runtime.activeModelContextHasPolyfillMarker).toBe(false);
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
      const modelContext = (window as NativeContextWindow).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
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

  test('executes a registered tool through document.modelContext and records the invocation', async ({
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
    await expect(registerDynamicTool(page)).resolves.toBe(true);
    await expect.poll(async () => await listNativeToolNames(page)).toContain(DYNAMIC_TOOL_NAME);

    const text = await executeNativeToolText(page, DYNAMIC_TOOL_NAME, { value: 'browser-api' });
    expect(text).toBe('dynamic:browser-api');
  });

  test('stops exposing unregistered tools and later execution fails', async ({ page }) => {
    await registerDynamicTool(page);
    await expect.poll(async () => await listNativeToolNames(page)).toContain(DYNAMIC_TOOL_NAME);

    const staleTool = await page.evaluateHandle(async (toolName): Promise<RegisteredTool> => {
      const modelContext = (window as NativeContextWindow).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      if (!modelContext) {
        throw new Error('Native document.modelContext is unavailable');
      }

      const tool = (await modelContext.getTools()).find((candidate) => candidate.name === toolName);
      if (!tool) {
        throw new Error(`Native tool is unavailable: ${toolName}`);
      }
      return tool;
    }, DYNAMIC_TOOL_NAME);

    try {
      await expect(unregisterDynamicTool(page)).resolves.toBe(true);
      await expect
        .poll(async () => await listNativeToolNames(page))
        .not.toContain(DYNAMIC_TOOL_NAME);

      const errorMessage = await page.evaluate(
        async ({ tool, toolArgs }) => {
          try {
            const modelContext = (window as NativeContextWindow)
              .__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
            if (!modelContext) {
              throw new Error('Native document.modelContext is unavailable');
            }
            await modelContext.executeTool(tool, JSON.stringify(toolArgs));
            return '';
          } catch (error) {
            return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
          }
        },
        { tool: staleTool, toolArgs: { value: 'gone' } }
      );
      expect(errorMessage).toMatch(/UnknownError|NotFoundError|invocation failed|dynamic_tool/i);
    } finally {
      await staleTool.dispose();
    }
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
