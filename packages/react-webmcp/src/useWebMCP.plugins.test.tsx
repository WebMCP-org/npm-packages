import { executionState } from '@mcp-b/webmcp-plugins/execution-state';
import { cleanupWebMCPPolyfill, initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from 'vitest-browser-react/pure';
import * as hooks from './index.js';
import { useWebMCP } from './useWebMCP.js';

beforeEach(() => initializeWebMCPPolyfill());
afterEach(async () => {
  await cleanup();
  cleanupWebMCPPolyfill();
  vi.restoreAllMocks();
});

it('keeps MCP formatting and local rejection in the registration-only adapter', async () => {
  expect(hooks).not.toHaveProperty('useWebMCPTool');
  const failure = new Error('Agent-safe failure');
  const register = vi.spyOn(document.modelContext, 'registerTool');
  const hook = await renderHook(() =>
    useWebMCP({
      name: 'registration_only_mcp',
      description: 'Uses MCP delivery',
      execute: ({ fail }) => {
        if (fail) throw failure;
        return 'ok';
      },
    })
  );
  const descriptor = register.mock.calls[0]?.[0];
  if (!descriptor) throw new Error('Tool was not registered');
  await expect(
    descriptor.execute({}, { signal: new AbortController().signal })
  ).resolves.toMatchObject({
    content: [{ type: 'text', text: 'ok' }],
  });
  await expect(
    descriptor.execute({ fail: true }, { signal: new AbortController().signal })
  ).resolves.toEqual({
    content: [{ type: 'text', text: failure.message }],
    isError: true,
  });
  await expect(hook.result.current.execute({ fail: true })).rejects.toBe(failure);
  expect(hook.result.current).not.toHaveProperty('state');
  expect(hook.result.current).not.toHaveProperty('reset');
  expect(descriptor).not.toHaveProperty('isErrorResponse');
});

it('classifies returned MCP error envelopes for agents while local values remain data', async () => {
  const execution = executionState();
  const response = { content: [{ type: 'text', text: 'Try again' }], isError: true };
  const register = vi.spyOn(document.modelContext, 'registerTool');
  const hook = await renderHook(() =>
    useWebMCP({
      plugins: [execution],
      name: 'returned_mcp_error',
      description: 'Reports an MCP failure',
      execute: () => response,
    })
  );
  const descriptor = register.mock.calls[0]?.[0];
  if (!descriptor) throw new Error('Tool was not registered');
  await hook.act(async () => {
    await expect(descriptor.execute({}, { signal: new AbortController().signal })).resolves.toBe(
      response
    );
  });
  expect(execution.getSnapshot().executionCount).toBe(0);
  expect(execution.getSnapshot().error).toBeInstanceOf(Error);
  expect(execution.getSnapshot().lastResult).toBeNull();
  await hook.act(async () => {
    await expect(hook.result.current.execute({})).resolves.toBe(response);
  });
  expect(execution.getSnapshot().executionCount).toBe(1);
  expect(execution.getSnapshot().error).toBeNull();
  expect(execution.getSnapshot().lastResult).toBe(response);
});
