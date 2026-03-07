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
    await waitForRuntimePage(page, '/runtime-contract.html');
  });

  test('discovers the canonical base tool set through browser APIs', async ({ page }) => {
    const toolNames = await listNativeToolNames(page);
    expect(toolNames).toEqual(expect.arrayContaining(getCanonicalToolNames(false)));
    expect(toolNames).toHaveLength(getCanonicalToolNames(false).length);
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

  test('propagates runtime-thrown errors through the browser API caller', async ({ page }) => {
    await resetInvocations(page);

    const errorMessage = await executeNativeToolError(page, 'always_fail', { reason: 'native' });
    expect(errorMessage).toContain('always_fail:native');

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
