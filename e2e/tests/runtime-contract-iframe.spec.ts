import { expect, test } from '@playwright/test';
import {
  callClientTool,
  callClientToolForError,
  DYNAMIC_TOOL_NAME,
  expectBaseTools,
  firstTextContent,
  getRuntimeIframeFrame,
  listClientToolNames,
  readFrameInvocations,
  registerDynamicToolInFrame,
  resetFrameInvocations,
  unregisterDynamicToolInFrame,
  waitForIframeRuntimePage,
} from './runtime-contract.helpers.js';

test.describe('Runtime Contract - Iframe Transport', () => {
  test.beforeEach(async ({ page }) => {
    await waitForIframeRuntimePage(page);
  });

  test('discovers the canonical base tool set through the iframe MCP client', async ({ page }) => {
    const toolNames = await listClientToolNames(page);
    expectBaseTools(toolNames);
  });

  test('calls a registered iframe tool and records the invocation in the child runtime', async ({
    page,
  }) => {
    const frame = getRuntimeIframeFrame(page);
    await resetFrameInvocations(frame);

    const result = await callClientTool(page, 'sum', { a: 7, b: 5 });
    expect(firstTextContent(result as { content?: Array<{ type?: string; text?: string }> })).toBe(
      'sum:12'
    );

    await expect
      .poll(async () => await readFrameInvocations(frame))
      .toEqual([
        {
          name: 'sum',
          arguments: { a: 7, b: 5 },
        },
      ]);
  });

  test('propagates dynamic registration from the iframe runtime to the parent client', async ({
    page,
  }) => {
    const frame = getRuntimeIframeFrame(page);
    await expect(registerDynamicToolInFrame(frame)).resolves.toBe(true);

    await expect.poll(async () => await listClientToolNames(page)).toContain(DYNAMIC_TOOL_NAME);

    const result = await callClientTool(page, DYNAMIC_TOOL_NAME, { value: 'iframe' });
    expect(firstTextContent(result as { content?: Array<{ type?: string; text?: string }> })).toBe(
      'dynamic:iframe'
    );
  });

  test('removes an unregistered iframe tool from discovery and later calls fail', async ({
    page,
  }) => {
    const frame = getRuntimeIframeFrame(page);
    await registerDynamicToolInFrame(frame);
    await expect.poll(async () => await listClientToolNames(page)).toContain(DYNAMIC_TOOL_NAME);

    await expect(unregisterDynamicToolInFrame(frame)).resolves.toBe(true);
    await expect.poll(async () => await listClientToolNames(page)).not.toContain(DYNAMIC_TOOL_NAME);

    const errorMessage = await callClientToolForError(page, DYNAMIC_TOOL_NAME, { value: 'gone' });
    expect(errorMessage).toContain(DYNAMIC_TOOL_NAME);
  });

  test('propagates iframe runtime errors to the parent client', async ({ page }) => {
    const frame = getRuntimeIframeFrame(page);
    await resetFrameInvocations(frame);

    const errorMessage = await callClientToolForError(page, 'always_fail', { reason: 'iframe' });
    expect(errorMessage).toContain('always_fail:iframe');

    await expect
      .poll(async () => await readFrameInvocations(frame))
      .toEqual([
        {
          name: 'always_fail',
          arguments: { reason: 'iframe' },
        },
      ]);
  });
});
