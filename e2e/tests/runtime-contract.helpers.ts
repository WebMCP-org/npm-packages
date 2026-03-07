import type { TextContent } from '@mcp-b/webmcp-types';
import { expect, type Frame, type Page } from '@playwright/test';
import {
  DYNAMIC_TOOL_NAME,
  firstTextContent,
  getCanonicalToolNames,
} from '../runtime-contract/core.js';

export { DYNAMIC_TOOL_NAME, firstTextContent, getCanonicalToolNames };

export async function waitForRuntimePage(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('#runtime-status')).toHaveAttribute('data-status', 'ready', {
    timeout: 15000,
  });
  await expect(page.locator('#client-status')).toHaveAttribute('data-status', 'ready', {
    timeout: 15000,
  });
}

export async function waitForIframeRuntimePage(page: Page): Promise<Frame> {
  await page.goto('/runtime-contract-iframe-client.html');
  await expect(page.locator('#iframe-client-status')).toHaveAttribute('data-status', 'ready', {
    timeout: 15000,
  });

  const frame = getRuntimeIframeFrame(page);
  await expect(
    page.frameLocator('#runtime-contract-iframe').locator('#iframe-runtime-status')
  ).toHaveAttribute('data-status', 'ready', { timeout: 15000 });
  return frame;
}

export function getRuntimeIframeFrame(page: Page): Frame {
  const frame = page.frame({ url: /runtime-contract-iframe-child\.html$/ });
  if (!frame) {
    throw new Error('Runtime contract iframe child frame was not found');
  }
  return frame;
}

export async function listClientToolNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const tools = await window.mcpClient?.listTools();
    return tools?.tools.map((tool) => tool.name).sort() ?? [];
  });
}

export async function callClientTool(
  page: Page,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  return page.evaluate(
    async ({ toolName, toolArgs }) => {
      return await window.mcpClient?.callTool({
        name: toolName,
        arguments: toolArgs,
      });
    },
    { toolName: name, toolArgs: args }
  );
}

export async function callClientToolForError(
  page: Page,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  return page.evaluate(
    async ({ toolName, toolArgs }) => {
      try {
        const result = await window.mcpClient?.callTool({
          name: toolName,
          arguments: toolArgs,
        });

        if (result?.isError && Array.isArray(result.content)) {
          const firstText = result.content.find(
            (item): item is TextContent => item?.type === 'text'
          );
          return firstText ? firstText.text : JSON.stringify(result);
        }

        return '';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    { toolName: name, toolArgs: args }
  );
}

export async function resetInvocations(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__WEBMCP_E2E__?.resetInvocations();
  });
}

export async function readInvocations(
  page: Page
): Promise<Array<{ name: string; arguments: Record<string, unknown> }>> {
  return page.evaluate(() => window.__WEBMCP_E2E__?.readInvocations() ?? []);
}

export async function resetFrameInvocations(frame: Frame): Promise<void> {
  await frame.evaluate(() => {
    window.__WEBMCP_E2E__?.resetInvocations();
  });
}

export async function readFrameInvocations(
  frame: Frame
): Promise<Array<{ name: string; arguments: Record<string, unknown> }>> {
  return frame.evaluate(() => window.__WEBMCP_E2E__?.readInvocations() ?? []);
}

export async function registerDynamicToolInPage(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__WEBMCP_E2E__?.registerDynamicTool() ?? false);
}

export async function unregisterDynamicToolInPage(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__WEBMCP_E2E__?.unregisterDynamicTool() ?? false);
}

export async function registerDynamicToolInFrame(frame: Frame): Promise<boolean> {
  return frame.evaluate(() => window.__WEBMCP_E2E__?.registerDynamicTool() ?? false);
}

export async function unregisterDynamicToolInFrame(frame: Frame): Promise<boolean> {
  return frame.evaluate(() => window.__WEBMCP_E2E__?.unregisterDynamicTool() ?? false);
}

export function expectBaseTools(toolNames: string[]) {
  expect(toolNames).toEqual(expect.arrayContaining(getCanonicalToolNames(false)));
  expect(toolNames).toHaveLength(getCanonicalToolNames(false).length);
}
