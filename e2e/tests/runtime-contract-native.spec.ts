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
import type { RuntimeToolArguments } from '../runtime-contract/core.js';

type TextContentResult = { type: 'text'; text: string };
type TextToolResult = { content: TextContentResult[] };

function isTextContent(value: unknown): value is TextContentResult {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'type' in value &&
    value.type === 'text' &&
    'text' in value &&
    typeof value.text === 'string'
  );
}

function isTextToolResult(value: unknown): value is TextToolResult {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'content' in value &&
    Array.isArray(value.content) &&
    value.content.every(isTextContent)
  );
}

function extractToolText(result: string | null): string {
  if (result === null) return '';

  try {
    const parsed: unknown = JSON.parse(result);
    if (isTextToolResult(parsed)) return parsed.content[0]?.text ?? result;
  } catch {
    return result;
  }

  return result;
}

async function listNativeToolNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const modelContext = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
    if (!modelContext) {
      throw new Error('Native document.modelContext is unavailable');
    }

    return (await modelContext.getTools()).map((tool) => tool.name).sort();
  });
}

async function executeNativeToolText(
  page: Page,
  name: string,
  args: RuntimeToolArguments
): Promise<string> {
  const result = await page.evaluate(
    async ({ toolName, toolArgs }) => {
      const modelContext = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      if (!modelContext) {
        throw new Error('Native document.modelContext is unavailable');
      }
      const executeTool = modelContext.executeTool;
      if (typeof executeTool !== 'function') {
        throw new Error('Native executeTool is unavailable');
      }

      const tool = (await modelContext.getTools()).find((candidate) => candidate.name === toolName);
      if (!tool) {
        throw new Error(`Native tool is unavailable: ${toolName}`);
      }

      return executeTool.call(modelContext, tool, toolArgs);
    },
    { toolName: name, toolArgs: args }
  );
  return extractToolText(result);
}

async function executeNativeToolError(
  page: Page,
  name: string,
  args: RuntimeToolArguments
): Promise<string> {
  return page.evaluate(
    async ({ toolName, toolArgs }) => {
      try {
        const modelContext = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
        if (!modelContext) {
          throw new Error('Native document.modelContext is unavailable');
        }

        const tool = (await modelContext.getTools()).find(
          (candidate) => candidate.name === toolName
        );
        if (!tool) {
          throw new Error(`Native tool is unavailable: ${toolName}`);
        }

        const executeTool = modelContext.executeTool;
        if (typeof executeTool !== 'function') throw new Error('Native executeTool is unavailable');
        await executeTool.call(modelContext, tool, toolArgs);
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
      const nativeContext = document.modelContext;
      if (!nativeContext) {
        throw new Error('Native WebMCP must be enabled before the MCP-B runtime starts');
      }
      window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ = nativeContext;
    });
    await waitForRuntimePage(page, '/runtime-contract.html');
    const capturedNativeContext = await page.evaluate(() =>
      Boolean(window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__)
    );
    expect(capturedNativeContext).toBe(true);
  });

  test('wraps the pre-existing native document.modelContext with MCP-B extensions', async ({
    page,
  }) => {
    const runtime = await page.evaluate(() => {
      const rawModelContext = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      const activeModelContext = document.modelContext;

      return {
        hasRawDocumentModelContext: rawModelContext !== undefined,
        rawModelContextHasGetTools: typeof rawModelContext?.getTools === 'function',
        rawModelContextHasExecuteTool: typeof rawModelContext?.executeTool === 'function',
        activeContextWrapsNative: Boolean(
          rawModelContext && activeModelContext !== rawModelContext
        ),
        activeContextHasMcpBExtensions:
          activeModelContext !== undefined &&
          'listTools' in activeModelContext &&
          typeof activeModelContext.listTools === 'function',
      };
    });

    expect(runtime.hasRawDocumentModelContext).toBe(true);
    expect(runtime.rawModelContextHasGetTools).toBe(true);
    expect(runtime.rawModelContextHasExecuteTool).toBe(true);
    expect(runtime.activeContextWrapsNative).toBe(true);
    expect(runtime.activeContextHasMcpBExtensions).toBe(true);
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
      const modelContext = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      if (!modelContext) {
        return { missingRawModelContext: true, missingSumTool: false, toolsArePromise: false };
      }
      const executeTool = modelContext.executeTool;
      if (typeof executeTool !== 'function') {
        return { missingRawModelContext: false, missingSumTool: false, toolsArePromise: false };
      }
      const toolsPromise = modelContext.getTools();
      const tools = await toolsPromise;
      const sumTool = tools.find((tool) => tool.name === 'sum');
      if (!sumTool) {
        return { missingRawModelContext: false, missingSumTool: true, toolsArePromise: false };
      }

      const execution = await executeTool.call(modelContext, sumTool, { a: 4, b: 7 });
      const inputSchema = sumTool.inputSchema;

      return {
        missingRawModelContext: false,
        missingSumTool: false,
        toolsArePromise: typeof toolsPromise.then === 'function',
        toolInfo: {
          name: sumTool.name,
          title: sumTool.title,
          description: sumTool.description,
          inputSchemaIsObject:
            inputSchema !== null && typeof inputSchema === 'object' && !Array.isArray(inputSchema),
          origin: sumTool.origin,
          hasWindow: sumTool.window === window,
        },
        execution,
      };
    });

    expect(result.missingRawModelContext).toBe(false);
    expect(result.missingSumTool).toBe(false);
    expect(result.toolsArePromise).toBe(true);
    expect(result.toolInfo).toMatchObject({
      name: 'sum',
      inputSchemaIsObject: true,
      origin: expect.any(String),
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

    const staleTool = await page.evaluateHandle(async (toolName) => {
      const modelContext = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
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
            const modelContext = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
            if (!modelContext) {
              throw new Error('Native document.modelContext is unavailable');
            }
            const executeTool = modelContext.executeTool;
            if (typeof executeTool !== 'function') {
              throw new Error('Native executeTool is unavailable');
            }
            await executeTool.call(modelContext, tool, toolArgs);
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

  test('propagates runtime-thrown errors through the browser API caller', async ({ page }) => {
    await resetInvocations(page);

    const errorMessage = await executeNativeToolError(page, 'always_fail', { reason: 'native' });
    // Native Chrome normalizes thrown tool errors into a generic failure string.
    expect(errorMessage).toMatch(/always_fail:native|invocation failed/i);

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
