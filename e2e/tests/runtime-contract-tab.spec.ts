import { expect, test } from '@playwright/test';
import {
  callClientTool,
  callClientToolForError,
  DYNAMIC_TOOL_NAME,
  expectBaseTools,
  firstTextContent,
  listClientToolNames,
  readInvocations,
  registerDynamicToolInPage,
  resetInvocations,
  unregisterDynamicToolInPage,
  waitForRuntimePage,
} from './runtime-contract.helpers.js';

test.describe('Runtime Contract - Tab Transport', () => {
  test.beforeEach(async ({ page }) => {
    await waitForRuntimePage(page, '/runtime-contract.html');
  });

  test('discovers the canonical base tool set through the real MCP client', async ({ page }) => {
    const toolNames = await listClientToolNames(page);
    expectBaseTools(toolNames);
  });

  test('calls a registered tool and records the invocation', async ({ page }) => {
    await resetInvocations(page);

    const result = await callClientTool(page, 'sum', { a: 4, b: 6 });
    expect(firstTextContent(result as { content?: Array<{ type?: string; text?: string }> })).toBe(
      'sum:10'
    );

    await expect
      .poll(async () => await readInvocations(page))
      .toEqual([
        {
          name: 'sum',
          arguments: { a: 4, b: 6 },
        },
      ]);
  });

  test('propagates dynamic registration to the connected client without restart', async ({
    page,
  }) => {
    await expect(registerDynamicToolInPage(page)).resolves.toBe(true);

    await expect.poll(async () => await listClientToolNames(page)).toContain(DYNAMIC_TOOL_NAME);

    const result = await callClientTool(page, DYNAMIC_TOOL_NAME, { value: 'hello' });
    expect(firstTextContent(result as { content?: Array<{ type?: string; text?: string }> })).toBe(
      'dynamic:hello'
    );
  });

  test('removes an unregistered tool from discovery and subsequent calls fail', async ({
    page,
  }) => {
    await registerDynamicToolInPage(page);
    await expect.poll(async () => await listClientToolNames(page)).toContain(DYNAMIC_TOOL_NAME);

    await expect(unregisterDynamicToolInPage(page)).resolves.toBe(true);
    await expect.poll(async () => await listClientToolNames(page)).not.toContain(DYNAMIC_TOOL_NAME);

    const errorMessage = await callClientToolForError(page, DYNAMIC_TOOL_NAME, { value: 'late' });
    expect(errorMessage).toContain(DYNAMIC_TOOL_NAME);
  });

  test('propagates runtime errors from tool execution to the caller', async ({ page }) => {
    await resetInvocations(page);

    const errorMessage = await callClientToolForError(page, 'always_fail', { reason: 'expected' });
    expect(errorMessage).toContain('always_fail:expected');

    await expect
      .poll(async () => await readInvocations(page))
      .toEqual([
        {
          name: 'always_fail',
          arguments: { reason: 'expected' },
        },
      ]);
  });
});
