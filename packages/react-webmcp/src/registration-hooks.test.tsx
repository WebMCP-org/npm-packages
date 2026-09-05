import { cleanupWebModelContext, initializeWebModelContext } from '@mcp-b/global';
import { TabClientTransport } from '@mcp-b/transports';
import { cleanupWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import type { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';
import { Client } from '@modelcontextprotocol/client';
import { Profiler, StrictMode, Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook } from 'vitest-browser-react';
import { getBrowserMcpServer } from './model-context.js';
import type { WebMCPPromptConfig, WebMCPPromptReturn } from './types.js';
import { useWebMCPContext } from './useWebMCPContext.js';
import { useWebMCPPrompt } from './useWebMCPPrompt.js';
import { useWebMCPResource } from './useWebMCPResource.js';

let server: BrowserMcpServer;
let client: Client;

beforeEach(async () => {
  cleanupWebModelContext();
  cleanupWebMCPPolyfill();
  const channelId = `registration-hooks-${crypto.randomUUID()}`;
  initializeWebModelContext({
    installTestingShim: false,
    transport: {
      iframeServer: false,
      tabServer: { channelId, allowedOrigins: [window.location.origin] },
    },
  });
  const context = getBrowserMcpServer();
  if (!context) throw new Error('MCP-B runtime was not initialized');
  server = context;
  client = new Client(
    { name: 'registration-hooks-client', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } }
  );
  await client.connect(new TabClientTransport({ channelId, targetOrigin: window.location.origin }));
});

afterEach(async () => {
  await cleanup();
  await client.close();
  cleanupWebModelContext();
  await server.close();
  cleanupWebMCPPolyfill();
  vi.restoreAllMocks();
});

type RegistrationProps = Pick<WebMCPPromptConfig, 'enabled' | 'description'> & {
  value: string;
};

function usePrompt({ value, ...options }: RegistrationProps = { value: 'first' }) {
  return useWebMCPPrompt({
    ...options,
    name: 'test_prompt',
    argsSchema: {
      type: 'object',
      properties: { subject: { type: 'string' } },
      required: ['subject'],
    } as const,
    get: async ({ subject }) => ({
      messages: [{ role: 'user', content: { type: 'text', text: `${value}:${subject}` } }],
    }),
  });
}

function useResource({ value, ...options }: RegistrationProps = { value: 'first' }) {
  return useWebMCPResource({
    ...options,
    uri: 'data://subject',
    name: 'Test resource',
    read: async (uri) => ({ contents: [{ uri: uri.href, text: `${value}:${uri.host}` }] }),
  });
}

describe.each([
  {
    kind: 'prompt',
    useRegistration: usePrompt,
    registerMethod: 'registerPrompt' as const,
    list: async () => (await client.listPrompts()).prompts,
    invoke: async () =>
      (await client.getPrompt({ name: 'test_prompt', arguments: { subject: 'subject' } }))
        .messages[0]?.content,
  },
  {
    kind: 'resource',
    useRegistration: useResource,
    registerMethod: 'registerResource' as const,
    list: async () => (await client.listResources()).resources,
    invoke: async () => (await client.readResource({ uri: 'data://subject' })).contents[0],
  },
])(
  '$kind registration lifecycle and render budgets',
  ({ useRegistration, registerMethod, list, invoke }) => {
    it('does not register or warn while disabled without a runtime', async () => {
      const register = vi.spyOn(server, registerMethod);
      await client.close();
      cleanupWebModelContext();
      await server.close();
      cleanupWebMCPPolyfill();
      expect(getBrowserMcpServer()).toBeUndefined();
      const warn = vi.spyOn(console, 'warn');
      const hook = await renderHook<RegistrationProps, WebMCPPromptReturn>(useRegistration, {
        initialProps: { enabled: false, value: 'first' },
      });

      await hook.rerender({
        enabled: false,
        value: 'latest',
        description: 'Changed while disabled',
      });

      expect(hook.result.current.isRegistered).toBe(false);
      expect(register).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });

    it('enables, disables, and re-enables with only registration-status commits', async () => {
      const register = vi.spyOn(server, registerMethod);
      const onRender = vi.fn();
      const hook = await renderHook<RegistrationProps, WebMCPPromptReturn>(useRegistration, {
        initialProps: { enabled: false, value: 'first' },
        wrapper: ({ children }) => (
          <Profiler id="registration" onRender={onRender}>
            {children}
          </Profiler>
        ),
      });
      expect(onRender).toHaveBeenCalled();
      expect(hook.result.current.isRegistered).toBe(false);
      expect(await list()).toEqual([]);
      expect(register).not.toHaveBeenCalled();

      for (const enabled of [true, false, true]) {
        onRender.mockClear();
        await hook.rerender({ enabled, value: 'latest' });

        expect(hook.result.current.isRegistered).toBe(enabled);
        expect(await list()).toHaveLength(enabled ? 1 : 0);
        // One prop commit plus at most one registration-status commit, including nested updates.
        expect(onRender.mock.calls.length).toBeLessThanOrEqual(2);
      }
      expect(register).toHaveBeenCalledTimes(2);
      expect(await invoke()).toMatchObject({ text: 'latest:subject' });

      await hook.unmount();
      expect(await list()).toEqual([]);
    });

    it('defaults to enabled and keeps inline schemas and callbacks from adding commits or registration churn', async () => {
      const register = vi.spyOn(server, registerMethod);
      const onRender = vi.fn();
      const hook = await renderHook<RegistrationProps, WebMCPPromptReturn>(useRegistration, {
        initialProps: { value: 'first' },
        wrapper: ({ children }) => (
          <Profiler id="registration" onRender={onRender}>
            {children}
          </Profiler>
        ),
      });
      expect(onRender).toHaveBeenCalled();
      expect(hook.result.current.isRegistered).toBe(true);

      for (const value of ['second', 'third']) {
        onRender.mockClear();
        await hook.rerender({ value });
        expect(await invoke()).toMatchObject({ text: `${value}:subject` });
        expect(onRender).toHaveBeenCalledOnce();
        expect(register).toHaveBeenCalledOnce();
      }

      onRender.mockClear();
      await hook.rerender({ value: 'latest', description: 'Updated metadata' });
      expect(await list()).toMatchObject([{ description: 'Updated metadata' }]);
      expect(await invoke()).toMatchObject({ text: 'latest:subject' });
      expect(register).toHaveBeenCalledTimes(2);
      expect(onRender).toHaveBeenCalledOnce();
    });

    it('keeps committed callbacks and registration when a disabled render suspends', async () => {
      const register = vi.spyOn(server, registerMethod);
      const pending = new Promise<never>(() => {});
      const hook = await renderHook<RegistrationProps & { suspend?: boolean }, WebMCPPromptReturn>(
        ({ suspend, ...props } = { value: 'first' }) => {
          const result = useRegistration(props);
          if (suspend) throw pending;
          return result;
        },
        {
          initialProps: { enabled: true, value: 'committed' },
          wrapper: ({ children }) => <Suspense fallback={null}>{children}</Suspense>,
        }
      );

      await hook.rerender({ enabled: false, value: 'uncommitted', suspend: true });
      expect(await list()).toHaveLength(1);
      expect(await invoke()).toMatchObject({ text: 'committed:subject' });

      await hook.rerender({ enabled: true, value: 'latest' });
      expect(await invoke()).toMatchObject({ text: 'latest:subject' });
      expect(register).toHaveBeenCalledOnce();
    });

    it('cleans up registrations through StrictMode replay, toggles, and unmount', async () => {
      const register = vi.spyOn(server, registerMethod);
      function Registration(props: RegistrationProps) {
        const { isRegistered } = useRegistration(props);
        return <output>{isRegistered ? 'registered' : 'disabled'}</output>;
      }
      const view = await render(
        <StrictMode>
          <Registration enabled value="strict" />
        </StrictMode>
      );
      expect(register.mock.calls.length).toBeGreaterThan(1);
      await expect.element(view.getByRole('status')).toHaveTextContent('registered');
      expect(await list()).toHaveLength(1);
      expect(await invoke()).toMatchObject({ text: 'strict:subject' });

      await view.rerender(
        <StrictMode>
          <Registration enabled={false} value="strict" />
        </StrictMode>
      );
      await expect.element(view.getByRole('status')).toHaveTextContent('disabled');
      expect(await list()).toEqual([]);

      await view.rerender(
        <StrictMode>
          <Registration enabled value="latest" />
        </StrictMode>
      );
      await expect.element(view.getByRole('status')).toHaveTextContent('registered');
      expect(await list()).toHaveLength(1);
      expect(await invoke()).toMatchObject({ text: 'latest:subject' });

      await view.unmount();
      expect(await list()).toEqual([]);
    });
  }
);

it('toggles resource templates through the same enabled option', async () => {
  const hook = await renderHook(
    ({ enabled }: { enabled: boolean } = { enabled: false }) =>
      useWebMCPResource({
        enabled,
        name: 'User profile',
        uri: 'user://{userId}/profile',
        read: async (uri, params) => ({
          contents: [{ uri: uri.href, text: String(params?.userId) }],
        }),
      }),
    { initialProps: { enabled: false } }
  );
  expect((await client.listResourceTemplates()).resourceTemplates).toEqual([]);

  await hook.rerender({ enabled: true });
  expect((await client.listResourceTemplates()).resourceTemplates).toMatchObject([
    { uriTemplate: 'user://{userId}/profile' },
  ]);
  expect((await client.readResource({ uri: 'user://42/profile' })).contents).toMatchObject([
    { text: '42' },
  ]);

  await hook.rerender({ enabled: false });
  expect((await client.listResourceTemplates()).resourceTemplates).toEqual([]);
});

it('forwards context enabled options with bounded commits and stable local controls', async () => {
  const register = vi.spyOn(server, 'registerTool');
  const warn = vi.spyOn(console, 'warn');
  const onRender = vi.fn();
  const hook = await renderHook(
    (
      { enabled, value }: { enabled: boolean; value: string } = { enabled: false, value: 'first' }
    ) => useWebMCPContext('test_context', 'Current value', () => value, { enabled }),
    {
      initialProps: { enabled: false, value: 'first' },
      wrapper: ({ children }) => (
        <Profiler id="context" onRender={onRender}>
          {children}
        </Profiler>
      ),
    }
  );
  expect(onRender).toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
  expect(register).not.toHaveBeenCalled();
  expect((await client.listTools()).tools).toEqual([]);
  const { execute, reset, state } = hook.result.current;

  for (const enabled of [true, false, true]) {
    onRender.mockClear();
    await hook.rerender({ enabled, value: 'latest' });
    await expect.poll(() => hook.result.current.isRegistered).toBe(enabled);
    expect((await client.listTools()).tools).toHaveLength(enabled ? 1 : 0);
    expect(onRender).toHaveBeenCalled();
    expect(onRender.mock.calls.length).toBeLessThanOrEqual(2); // Parent and registration status.
    expect(hook.result.current.state).toBe(state);
    expect(hook.result.current.execute).toBe(execute);
    expect(hook.result.current.reset).toBe(reset);
  }
  expect(register).toHaveBeenCalledTimes(2);

  await hook.act(async () => {
    expect(await client.callTool({ name: 'test_context' })).toMatchObject({
      content: [{ type: 'text', text: 'latest' }],
    });
  });
  expect(hook.result.current.state.executionCount).toBe(1);

  await hook.rerender({ enabled: false, value: 'local' });
  expect(hook.result.current.state.executionCount).toBe(1);
  expect((await client.listTools()).tools).toEqual([]);
  await hook.act(async () => {
    expect(await execute({})).toBe('local');
  });
  expect(hook.result.current.state.executionCount).toBe(2);
  await hook.act(() => {
    reset();
  });
  expect(hook.result.current.state.executionCount).toBe(0);
});
