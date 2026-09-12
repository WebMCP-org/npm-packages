import { cleanupWebModelContext, initializeWebModelContext } from '@mcp-b/global';
import { TabClientTransport } from '@mcp-b/transports';
import { cleanupWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import type { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';
import { Client } from '@modelcontextprotocol/client';
import { Component, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook } from 'vitest-browser-react';
import { ConsentGuard } from './consent-broker.js';
import { ConsentBrokerProvider } from './ConsentBrokerProvider.js';
import type { ConsentMetadata } from './consent-types.js';
import { getBrowserMcpServer } from './model-context.js';
import { useGuardedWebMCP } from './useGuardedWebMCP.js';

let server: BrowserMcpServer;
let client: Client;

beforeEach(async () => {
  cleanupWebModelContext();
  cleanupWebMCPPolyfill();
  const channelId = `guarded-webmcp-${crypto.randomUUID()}`;
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
    { name: 'guarded-webmcp-client', version: '1.0.0' },
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

const lowRiskConsent: ConsentMetadata = {
  scope: ['read:deployments'],
  reversible: true,
  riskLevel: 'low',
  requiresApproval: false,
  idempotent: true,
};

const highRiskConsent: ConsentMetadata = {
  scope: ['write:rollback'],
  reversible: false,
  riskLevel: 'high',
  requiresApproval: true,
};

function provider(broker: ConsentGuard) {
  return function Provider({ children }: { children: ReactNode }) {
    return <ConsentBrokerProvider broker={broker}>{children}</ConsentBrokerProvider>;
  };
}

function trackPendingIds(broker: ConsentGuard) {
  const ids: string[] = [];
  broker.subscribe((pending) => {
    ids.length = 0;
    ids.push(...pending.map((request) => request.id));
  });
  return ids;
}

class ErrorCatcher extends Component<
  { children: ReactNode; onError: (error: Error) => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

describe('useGuardedWebMCP', () => {
  it('throws when rendered outside ConsentBrokerProvider', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const errors: Error[] = [];

    function Outside() {
      useGuardedWebMCP({
        name: 'unguarded_outside',
        description: 'Should not register',
        consent: lowRiskConsent,
        execute: async () => ({ ok: true }),
      });
      return null;
    }

    await render(
      <ErrorCatcher
        onError={(error) => {
          errors.push(error);
        }}
      >
        <Outside />
      </ErrorCatcher>
    );

    await vi.waitFor(() => {
      expect(errors.some((error) => error.message.includes('useConsentBroker'))).toBe(true);
    });
  });

  it('auto-approves when requiresApproval is false, records the decision, and skips broker.request', async () => {
    const execute = vi.fn().mockResolvedValue({ status: 'healthy' });
    const broker = new ConsentGuard();
    const requestSpy = vi.spyOn(broker, 'request');
    const recordSpy = vi.spyOn(broker, 'recordDecision');

    const hook = await renderHook(
      () =>
        useGuardedWebMCP({
          name: 'getServiceHealth',
          description: 'Get service health',
          inputSchema: { type: 'object' as const, properties: {} },
          consent: lowRiskConsent,
          execute,
        }),
      { wrapper: provider(broker) }
    );

    let result: Awaited<ReturnType<typeof client.callTool>> | undefined;
    await hook.act(async () => {
      result = await client.callTool({ name: 'getServiceHealth' });
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(requestSpy).not.toHaveBeenCalled();
    expect(recordSpy).toHaveBeenCalledOnce();
    expect(recordSpy).toHaveBeenCalledWith(
      {
        toolName: 'getServiceHealth',
        origin: window.location.origin,
        args: {},
        consent: lowRiskConsent,
      },
      { approved: true, reason: 'user' }
    );
    expect(result).toMatchObject({
      structuredContent: { status: 'healthy' },
    });
  });

  it('omits inputSchema when none is provided and still maps consent annotations', async () => {
    const broker = new ConsentGuard();
    await renderHook(
      () =>
        useGuardedWebMCP({
          name: 'pingHealth',
          description: 'Ping health',
          consent: lowRiskConsent,
          execute: async () => ({ ok: true }),
        }),
      { wrapper: provider(broker) }
    );

    const listed = await client.listTools();
    const tool = listed.tools.find((candidate) => candidate.name === 'pingHealth');
    expect(tool).toMatchObject({
      name: 'pingHealth',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    });
  });

  it('registers high-risk annotations and only calls execute after approval', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true });
    const broker = new ConsentGuard();
    const pendingIds = trackPendingIds(broker);

    await renderHook(
      () =>
        useGuardedWebMCP({
          name: 'rollbackDeployment',
          description: 'Rollback a deployment',
          inputSchema: {
            type: 'object' as const,
            properties: { deploymentId: { type: 'string' as const } },
          },
          consent: highRiskConsent,
          execute,
        }),
      { wrapper: provider(broker) }
    );

    const listed = await client.listTools();
    expect(listed.tools.find((tool) => tool.name === 'rollbackDeployment')).toMatchObject({
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    });

    const resultPromise = client.callTool({
      name: 'rollbackDeployment',
      arguments: { deploymentId: 'd-1' },
    });
    expect(execute).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(pendingIds).toHaveLength(1));

    await broker.decide(pendingIds[0]!, true);
    const result = await resultPromise;

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({ deploymentId: 'd-1' });
    expect(result).toMatchObject({ structuredContent: { success: true } });
  });

  it('returns an MCP error result when the broker denies', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true });
    const broker = new ConsentGuard();
    const pendingIds = trackPendingIds(broker);

    await renderHook(
      () =>
        useGuardedWebMCP({
          name: 'rollbackDeployment',
          description: 'Rollback a deployment',
          consent: highRiskConsent,
          execute,
        }),
      { wrapper: provider(broker) }
    );

    let result: Awaited<ReturnType<typeof client.callTool>> | undefined;
    const resultPromise = client
      .callTool({ name: 'rollbackDeployment', arguments: {} })
      .then((value) => {
        result = value;
        return value;
      });

    await vi.waitFor(() => expect(pendingIds).toHaveLength(1));
    await broker.decide(pendingIds[0]!, false);
    await resultPromise;

    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Action denied by user (user).' }],
    });
    expect(result?.structuredContent).toBeUndefined();
  });

  it('returns an MCP error result when the broker auto-denies on timeout', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true });
    const broker = new ConsentGuard(50);

    const hook = await renderHook(
      () =>
        useGuardedWebMCP({
          name: 'rollbackDeployment',
          description: 'Rollback a deployment',
          consent: highRiskConsent,
          execute,
        }),
      { wrapper: provider(broker) }
    );

    let result: Awaited<ReturnType<typeof client.callTool>> | undefined;
    await hook.act(async () => {
      result = await client.callTool({ name: 'rollbackDeployment', arguments: {} });
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Action denied by user (timeout).' }],
    });
    expect(result?.structuredContent).toBeUndefined();
  });

  it('does not register or invoke execute when enabled is false', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const broker = new ConsentGuard();

    await renderHook(
      () =>
        useGuardedWebMCP({
          name: 'disabledGuardedTool',
          description: 'Should stay unregistered',
          consent: lowRiskConsent,
          enabled: false,
          execute,
        }),
      { wrapper: provider(broker) }
    );

    const listed = await client.listTools();
    expect(listed.tools.find((tool) => tool.name === 'disabledGuardedTool')).toBeUndefined();

    await expect(client.callTool({ name: 'disabledGuardedTool', arguments: {} })).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  it('evaluates a requiresApproval predicate per invocation', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const broker = new ConsentGuard();
    const pendingIds = trackPendingIds(broker);
    const requestSpy = vi.spyOn(broker, 'request');
    const consent: ConsentMetadata = {
      scope: ['write:rollback'],
      reversible: false,
      riskLevel: 'high',
      requiresApproval: (args: unknown) => Boolean((args as { force?: boolean }).force),
    };

    const hook = await renderHook(
      () =>
        useGuardedWebMCP({
          name: 'conditionalRollback',
          description: 'Rollback only when forced',
          inputSchema: {
            type: 'object' as const,
            properties: { force: { type: 'boolean' as const } },
          },
          consent,
          execute,
        }),
      { wrapper: provider(broker) }
    );

    await hook.act(async () => {
      await client.callTool({ name: 'conditionalRollback', arguments: { force: false } });
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(requestSpy).not.toHaveBeenCalled();

    const forced = client.callTool({
      name: 'conditionalRollback',
      arguments: { force: true },
    });
    await vi.waitFor(() => expect(pendingIds).toHaveLength(1));
    await broker.decide(pendingIds[0]!, true);
    await forced;

    expect(requestSpy).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenLastCalledWith({ force: true });
  });

  it('warns in development when consent is passed as an unmemoized object literal', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const broker = new ConsentGuard();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const hook = await renderHook(
      ({ consent }: { consent: ConsentMetadata }) =>
        useGuardedWebMCP({
          name: 'unstableConsentTool',
          description: 'A tool whose consent object is a fresh literal each render',
          consent,
          execute,
        }),
      {
        initialProps: { consent: { ...lowRiskConsent } },
        wrapper: provider(broker),
      }
    );

    expect(warnSpy).not.toHaveBeenCalled();

    // Re-render with a brand-new object of identical contents — the exact
    // footgun the warning exists to catch.
    await hook.rerender({ consent: { ...lowRiskConsent } });

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toContain('unstableConsentTool');
    expect(warnSpy.mock.calls[0]?.[0]).toContain('new object');
  });

  it('does not re-register the tool when re-rendered without changing consent contents', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const broker = new ConsentGuard();
    const registerSpy = vi.spyOn(server, 'registerTool');

    const hook = await renderHook(
      ({ consent }: { consent: ConsentMetadata }) =>
        useGuardedWebMCP({
          name: 'stableGuardedTool',
          description: 'A tool that stays stable across re-renders',
          consent,
          execute,
        }),
      {
        initialProps: { consent: lowRiskConsent },
        wrapper: provider(broker),
      }
    );

    const initialCalls = registerSpy.mock.calls.filter(
      ([tool]) => tool.name === 'stableGuardedTool'
    ).length;
    expect(initialCalls).toBe(1);

    // Re-rendering with identical reference should not re-register
    await hook.rerender({ consent: lowRiskConsent });
    const afterSameRef = registerSpy.mock.calls.filter(
      ([tool]) => tool.name === 'stableGuardedTool'
    ).length;
    expect(afterSameRef).toBe(1);

    // Re-rendering with a new object containing identical contents should not re-register
    await hook.rerender({ consent: { ...lowRiskConsent } });
    const afterNewRefSameContent = registerSpy.mock.calls.filter(
      ([tool]) => tool.name === 'stableGuardedTool'
    ).length;
    expect(afterNewRefSameContent).toBe(1);
  });
});
