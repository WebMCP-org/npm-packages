import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupWebModelContext, initializeWebModelContext } from './global.js';

function flushMicrotasks(): Promise<void> {
  return Promise.resolve();
}

describe('Web Model Context Core Polyfill', () => {
  beforeEach(() => {
    cleanupWebModelContext();
    initializeWebModelContext();
  });

  afterEach(() => {
    cleanupWebModelContext();
  });

  it('installs navigator.modelContext and navigator.modelContextTesting', () => {
    expect(navigator.modelContext).toBeDefined();
    expect(navigator.modelContextTesting).toBeDefined();
  });

  it('registers and executes a tool with JSON Schema validation', async () => {
    navigator.modelContext.registerTool({
      name: 'add',
      description: 'Add two numbers',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' },
        },
        required: ['a', 'b'],
      },
      async execute({ a, b }) {
        return {
          content: [{ type: 'text', text: String((a as number) + (b as number)) }],
        };
      },
    });

    const result = await navigator.modelContext.callTool({
      name: 'add',
      arguments: { a: 2, b: 3 },
    });

    expect(result.content[0]).toEqual({ type: 'text', text: '5' });
  });

  it('returns a registration handle that unregisters the tool', () => {
    const registration = navigator.modelContext.registerTool({
      name: 'temporary',
      description: 'Temporary tool',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'ok' }] };
      },
    });

    expect(navigator.modelContext.listTools().map((tool) => tool.name)).toContain('temporary');
    registration.unregister();
    expect(navigator.modelContext.listTools().map((tool) => tool.name)).not.toContain('temporary');
  });

  it('throws when input validation fails', async () => {
    navigator.modelContext.registerTool({
      name: 'requires_number',
      description: 'Requires number input',
      inputSchema: {
        type: 'object',
        properties: {
          count: { type: 'number' },
        },
        required: ['count'],
      },
      async execute() {
        return { content: [{ type: 'text', text: 'ok' }] };
      },
    });

    await expect(
      navigator.modelContext.callTool({
        name: 'requires_number',
        arguments: { count: 'wrong-type' as unknown as number },
      })
    ).rejects.toThrow(/Validation failed/i);
  });

  it('supports toolcall event interception', async () => {
    navigator.modelContext.registerTool({
      name: 'intercepted',
      description: 'Can be intercepted',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'execute-path' }] };
      },
    });

    navigator.modelContext.addEventListener('toolcall', (event) => {
      if (event.name === 'intercepted') {
        event.respondWith({ content: [{ type: 'text', text: 'event-path' }] });
      }
    });

    const result = await navigator.modelContext.callTool({
      name: 'intercepted',
      arguments: {},
    });

    expect(result.content[0]).toEqual({ type: 'text', text: 'event-path' });
  });

  it('emits toolschanged with microtask batching', async () => {
    const callback = vi.fn();
    navigator.modelContext.addEventListener('toolschanged', callback);

    navigator.modelContext.registerTool({
      name: 'tool_1',
      description: 'tool 1',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'one' }] };
      },
    });

    navigator.modelContext.registerTool({
      name: 'tool_2',
      description: 'tool 2',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'two' }] };
      },
    });

    await flushMicrotasks();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('replaces base tools on provideContext calls', () => {
    navigator.modelContext.provideContext({
      tools: [
        {
          name: 'base_one',
          description: 'base one',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'one' }] };
          },
        },
      ],
    });

    expect(navigator.modelContext.listTools().map((tool) => tool.name)).toContain('base_one');

    navigator.modelContext.provideContext({
      tools: [
        {
          name: 'base_two',
          description: 'base two',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'two' }] };
          },
        },
      ],
    });

    const names = navigator.modelContext.listTools().map((tool) => tool.name);
    expect(names).toContain('base_two');
    expect(names).not.toContain('base_one');
  });

  it('validates structuredContent against outputSchema when provided', async () => {
    navigator.modelContext.registerTool({
      name: 'structured',
      description: 'Structured output tool',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {
        type: 'object',
        properties: {
          total: { type: 'number' },
        },
        required: ['total'],
      },
      async execute() {
        return {
          content: [{ type: 'text', text: 'ok' }],
          structuredContent: { total: 'wrong-type' as unknown as number },
        };
      },
    });

    await expect(
      navigator.modelContext.callTool({
        name: 'structured',
        arguments: {},
      })
    ).rejects.toThrow(/Output validation failed/i);
  });

  it('clears all tools on clearContext', () => {
    navigator.modelContext.registerTool({
      name: 'temp',
      description: 'Temporary tool',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'tmp' }] };
      },
    });

    expect(navigator.modelContext.listTools()).toHaveLength(1);
    navigator.modelContext.clearContext();
    expect(navigator.modelContext.listTools()).toHaveLength(0);
  });
});
