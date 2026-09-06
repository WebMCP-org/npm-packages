import { cleanupWebMCPPolyfill, initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from 'vitest-browser-react/pure';
import { useWebMCP, useWebMCPTool } from './useWebMCP.js';

beforeEach(() => initializeWebMCPPolyfill());
afterEach(async () => {
  await cleanup();
  cleanupWebMCPPolyfill();
  vi.restoreAllMocks();
});

it('keeps MCP formatting and local rejection in the registration-only adapter', async () => {
  const failure = new Error('Agent-safe failure');
  const register = vi.spyOn(document.modelContext, 'registerTool');
  const hook = await renderHook(() =>
    useWebMCPTool({
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
  expect(descriptor).not.toHaveProperty('isErrorResponse');
});

it('classifies returned MCP error envelopes for agents while local values remain data', async () => {
  const response = { content: [{ type: 'text', text: 'Try again' }], isError: true };
  const register = vi.spyOn(document.modelContext, 'registerTool');
  const hook = await renderHook(() =>
    useWebMCP({
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
  expect(hook.result.current.state.executionCount).toBe(0);
  expect(hook.result.current.state.error).toBeInstanceOf(Error);
  expect(hook.result.current.state.lastResult).toBeNull();
  await hook.act(async () => {
    await expect(hook.result.current.execute({})).resolves.toBe(response);
  });
  expect(hook.result.current.state.executionCount).toBe(1);
  expect(hook.result.current.state.error).toBeNull();
  expect(hook.result.current.state.lastResult).toBe(response);
});
