import { cleanupWebModelContext, initializeWebModelContext } from '@mcp-b/global';
import { cleanupWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import type { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';
import { TabClientTransport } from '@mcp-b/transports';
import { Client } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from 'vitest-browser-react';
import { getBrowserMcpServer } from './model-context.js';
import { ConsentBroker } from './consent-broker.js';
import { ConsentBrokerProvider } from './ConsentBrokerProvider.js';
import { useGuardedWebMCP } from './useGuardedWebMCP.js';
import type { ConsentMetadata } from './consent-types.js';

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

describe('useGuardedWebMCP', () => {
  it('low-risk tool with requiresApproval=false calls execute directly, never touches broker', async () => {
    const execute = vi.fn().mockResolvedValue({ status: 'healthy' });
    const broker = new ConsentBroker();
    const requestSpy = vi.spyOn(broker, 'request');

    await renderHook(
      () =>
        useGuardedWebMCP({
          name: 'getServiceHealth',
          description: 'Get service health',
          inputSchema: { type: 'object' as const, properties: {} },
          consent: lowRiskConsent,
          execute,
        }),
      {
        wrapper: ({ children }) => (
          <ConsentBrokerProvider broker={broker}>{children}</ConsentBrokerProvider>
        ),
      }
    );

    // Call the registered tool via MCP client
    await hook_act(async () => {
      await client.callTool({ name: 'getServiceHealth' });
    });

    expect(execute).toHaveBeenCalledOnce();
    // broker.request should NOT have been called since requiresApproval=false
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('high-risk tool calls broker.request and only calls execute after approval', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true });
    const broker = new ConsentBroker();
    let pendingId = '';
    broker.subscribe((pending) => {
      if (pending.length > 0) pendingId = pending[0]!.id;
    });
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
      {
        wrapper: ({ children }) => (
          <ConsentBrokerProvider broker={broker}>{children}</ConsentBrokerProvider>
        ),
      }
    );

    const tools = await server.getTools();
    expect(tools.some((tool) => tool.name === 'rollbackDeployment')).toBe(true);

    const resultPromise = client.callTool({
      name: 'rollbackDeployment',
      arguments: { deploymentId: 'd-1' },
    });
    expect(execute).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(pendingId).not.toBe(''));

    broker.decide(pendingId, true);
    await resultPromise;

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({ deploymentId: 'd-1' });
  });

  it('high-risk tool returns denial response when broker denies', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true });
    const broker = new ConsentBroker();

    let capturedId = '';
    broker.subscribe((pending) => {
      if (pending.length > 0 && capturedId === '') capturedId = pending[0]!.id;
    });

    const decisionPromise = broker.request({
      toolName: 'rollbackDeployment',
      origin: window.location.origin,
      args: {},
      consent: highRiskConsent,
    });

    expect(capturedId).not.toBe('');

    // User denies
    broker.decide(capturedId, false);
    const decision = await decisionPromise;

    expect(decision.approved).toBe(false);
    expect(decision.reason).toBe('user');
    // execute should NOT be called
    expect(execute).not.toHaveBeenCalled();
  });
});

/** Helper to run async work inside renderHook's act. */
async function hook_act(fn: () => Promise<void>) {
  await fn();
}
