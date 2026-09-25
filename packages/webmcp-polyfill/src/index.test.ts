import type { WebMCP } from 'webmcp-types';
import { expect, it } from 'vitest';
import { initializeWebMCPPolyfill, installWebMCP } from './index.js';

it('exposes the upstream installer and keeps the legacy initializer as an alias', async () => {
  expect(initializeWebMCPPolyfill).toBe(installWebMCP);

  installWebMCP();
  const context = document.modelContext as WebMCP.ModelContext | undefined;
  expect(context).toBeDefined();

  installWebMCP();
  expect(document.modelContext).toBe(context);

  if (!context) throw new Error('Upstream installer did not provide document.modelContext');
  const controller = new AbortController();
  await context.registerTool(
    {
      name: 'upstream_core_smoke',
      description: 'Exercises object-input execution from the upstream WebMCP polyfill',
      execute: (input) => (input as { value: number }).value + 1,
    },
    { signal: controller.signal }
  );
  const tool = (await context.getTools()).find(({ name }) => name === 'upstream_core_smoke');
  if (!tool) throw new Error('Upstream polyfill did not return the registered tool');
  await expect(context.executeTool(tool, { value: 41 })).resolves.toBe('42');

  controller.abort();
  await expect
    .poll(async () => (await context.getTools()).some(({ name }) => name === tool.name))
    .toBe(false);
});
