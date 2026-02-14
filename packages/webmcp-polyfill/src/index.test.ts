import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupWebMCPPolyfill,
  initializeWebMCPPolyfill,
  initializeWebModelContextPolyfill,
} from './index.js';

describe('@mcp-b/webmcp-polyfill', () => {
  afterEach(() => {
    cleanupWebMCPPolyfill();
  });

  it('exports stable initialization and cleanup functions', () => {
    expect(typeof initializeWebMCPPolyfill).toBe('function');
    expect(typeof initializeWebModelContextPolyfill).toBe('function');
    expect(typeof cleanupWebMCPPolyfill).toBe('function');
  });

  it('installs strict core methods on navigator.modelContext', () => {
    initializeWebMCPPolyfill();

    expect(typeof navigator.modelContext.provideContext).toBe('function');
    expect(typeof navigator.modelContext.clearContext).toBe('function');
    expect(typeof navigator.modelContext.registerTool).toBe('function');
    expect(typeof navigator.modelContext.unregisterTool).toBe('function');
    expect((navigator.modelContext as unknown as { callTool?: unknown }).callTool).toBeUndefined();
  });

  it('registerTool returns undefined and throws on duplicates', () => {
    initializeWebMCPPolyfill();

    const firstResult = navigator.modelContext.registerTool({
      name: 'echo',
      description: 'Echo back input',
      inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
      execute: async (args) => ({ content: [{ type: 'text', text: String(args.message ?? '') }] }),
    });

    expect(firstResult).toBeUndefined();
    expect(() =>
      navigator.modelContext.registerTool({
        name: 'echo',
        description: 'Echo back input again',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({ content: [{ type: 'text', text: 'second' }] }),
      })
    ).toThrow('Tool already registered: echo');
  });

  it('provideContext clears previous dynamic tools', async () => {
    initializeWebMCPPolyfill();

    navigator.modelContext.registerTool({
      name: 'dynamic_tool',
      description: 'Dynamic tool',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: 'dynamic' }] }),
    });

    navigator.modelContext.provideContext({
      tools: [
        {
          name: 'context_tool',
          description: 'Context tool',
          inputSchema: { type: 'object', properties: {} },
          execute: async () => ({ content: [{ type: 'text', text: 'context' }] }),
        },
      ],
    });

    await expect(navigator.modelContextTesting?.executeTool('dynamic_tool', '{}')).rejects.toThrow(
      'Tool not found: dynamic_tool'
    );

    const serialized = await navigator.modelContextTesting?.executeTool('context_tool', '{}');
    expect(serialized).toContain('context');
  });

  it('throws on invalid inputSchema during registration', () => {
    initializeWebMCPPolyfill();

    expect(() =>
      navigator.modelContext.registerTool({
        name: 'invalid_schema_tool',
        description: 'Invalid schema',
        inputSchema: {
          type: 123 as unknown as string,
        },
        execute: async () => ({ content: [{ type: 'text', text: 'never' }] }),
      })
    ).toThrow('Invalid JSON Schema at $: "type" must be a string or string[]');
  });

  it('supports requestUserInteraction and enforces client lifecycle', async () => {
    initializeWebMCPPolyfill();

    let capturedClient: {
      requestUserInteraction: (cb: () => Promise<unknown>) => Promise<unknown>;
    } | null = null;

    navigator.modelContext.registerTool({
      name: 'interaction_tool',
      description: 'Uses requestUserInteraction',
      inputSchema: { type: 'object', properties: {} },
      execute: async (_args, client) => {
        capturedClient = client;
        const result = await client.requestUserInteraction(async () => ({ approved: true }));
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      },
    });

    const serialized = await navigator.modelContextTesting?.executeTool('interaction_tool', '{}');
    expect(serialized).toContain('approved');
    expect(capturedClient).not.toBeNull();

    if (!capturedClient) {
      throw new Error('Expected capturedClient to be set');
    }

    const closedClient = capturedClient as {
      requestUserInteraction: (cb: () => Promise<unknown>) => Promise<unknown>;
    };

    await expect(closedClient.requestUserInteraction(async () => ({ late: true }))).rejects.toThrow(
      'ModelContextClient for tool "interaction_tool" is no longer active'
    );
  });

  it('unregisterTool on unknown names is a no-op', () => {
    initializeWebMCPPolyfill();
    expect(() => navigator.modelContext.unregisterTool('missing')).not.toThrow();
  });

  it('fires registerToolsChangedCallback for registry mutations', async () => {
    initializeWebMCPPolyfill();

    let count = 0;
    navigator.modelContextTesting?.registerToolsChangedCallback(() => {
      count += 1;
    });

    navigator.modelContext.registerTool({
      name: 't1',
      description: 'tool 1',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    });

    navigator.modelContext.unregisterTool('t1');

    navigator.modelContext.provideContext({
      tools: [
        {
          name: 't2',
          description: 'tool 2',
          inputSchema: { type: 'object', properties: {} },
          execute: async () => ({ content: [{ type: 'text', text: 'ok2' }] }),
        },
      ],
    });

    navigator.modelContext.clearContext();

    await Promise.resolve();
    await Promise.resolve();

    expect(count).toBe(4);
  });
});
