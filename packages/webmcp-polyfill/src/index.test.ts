import { expect, it } from 'vitest';
import { installWebMCP } from './index.js';

it('leaves the document untouched when the engine lacks a required API', () => {
  const { withResolvers } = Promise;
  Reflect.deleteProperty(Promise, 'withResolvers');
  try {
    expect(() => installWebMCP()).not.toThrow();
    expect('modelContext' in document).toBe(false);
  } finally {
    Promise.withResolvers = withResolvers;
  }
});

it('installs the upstream object-input API idempotently', async () => {
  installWebMCP();
  const context = document.modelContext;
  expect(context).toBeDefined();

  installWebMCP();
  expect(document.modelContext).toBe(context);

  if (!context) throw new Error('Upstream installer did not provide document.modelContext');
  const controller = new AbortController();
  await context.registerTool(
    {
      name: 'upstream_core_smoke',
      description: 'Exercises object-input execution from the upstream WebMCP polyfill',
      execute: (input) => {
        if (!('value' in input) || !Number.isFinite(input.value)) {
          throw new TypeError('Expected a finite value');
        }
        return Number(input.value) + 1;
      },
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
