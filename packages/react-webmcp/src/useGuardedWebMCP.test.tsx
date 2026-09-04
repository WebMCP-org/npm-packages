import { cleanupWebModelContext, initializeWebModelContext } from '@mcp-b/global';
import { TabClientTransport } from '@mcp-b/transports';
import { cleanupWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import type { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';
import { Client } from '@modelcontextprotocol/client';
import { Component, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook } from 'vitest-browser-react';
import { ConsentBroker } from './consent-broker.js';
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
};

const highRiskConsent: ConsentMetadata = {
  scope: ['write:rollback'],
  reversible: false,
  riskLevel: 'high',
  requiresApproval: true,
};

function provider(broker: ConsentBroker) {
  return function Provider({ children }: { children: ReactNode }) {
    return <ConsentBrokerProvider broker={broker}>{children}</ConsentBrokerProvider>;
  };
}

function trackPendingIds(broker: ConsentBroker) {
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
    const broker = new ConsentBroker();
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
    const broker = new ConsentBroker();
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
    const broker = new ConsentBroker();
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

    broker.decide(pendingIds[0]!, true);
    const result = await resultPromise;

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({ deploymentId: 'd-1' });
    expect(result).toMatchObject({ structuredContent: { success: true } });
  });

  it('returns a structured denial when the broker denies', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true });
    const broker = new ConsentBroker();
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
    broker.decide(pendingIds[0]!, false);
    await resultPromise;

    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      structuredContent: {
        success: false,
        error: 'Action denied by user (user).',
      },
    });
  });

  it('returns a timeout denial when the broker auto-denies', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true });
    const broker = new ConsentBroker(50);

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
      structuredContent: {
        success: false,
        error: 'Action denied by user (timeout).',
      },
    });
  });

  it('evaluates a requiresApproval predicate per invocation', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const broker = new ConsentBroker();
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
    broker.decide(pendingIds[0]!, true);
    await forced;

    expect(requestSpy).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenLastCalledWith({ force: true });
  });
});
