import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanupWebModelContext, initializeWebModelContext } from './global.js';
import { createTestHelper } from './testing.js';

describe('@mcp-b/webmcp-polyfill/testing', () => {
  beforeEach(() => {
    cleanupWebModelContext();
    initializeWebModelContext();
    navigator.modelContext.clearContext();
    createTestHelper().reset();
  });

  afterEach(() => {
    cleanupWebModelContext();
  });

  it('executes tools using object args', async () => {
    navigator.modelContext.registerTool({
      name: 'echo',
      description: 'Echo tool',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
        required: ['message'],
      },
      async execute({ message }) {
        return { content: [{ type: 'text', text: `Echo: ${String(message)}` }] };
      },
    });

    const helper = createTestHelper();
    const result = await helper.executeTool('echo', { message: 'hello' });

    expect(result).toBe('Echo: hello');
  });

  it('records calls and supports mock responses', async () => {
    navigator.modelContext.registerTool({
      name: 'mockable',
      description: 'Mockable tool',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'real' }] };
      },
    });

    const helper = createTestHelper();

    await helper.executeTool('mockable', {});
    expect(helper.getToolCalls()).toHaveLength(1);

    helper.setMockToolResponse('mockable', {
      content: [{ type: 'text', text: 'mocked' }],
    });

    await expect(helper.executeTool('mockable', {})).resolves.toBe('mocked');

    helper.clearMockToolResponse('mockable');
    await expect(helper.executeTool('mockable', {})).resolves.toBe('real');
  });

  it('throws when testing api is unavailable', () => {
    cleanupWebModelContext();

    expect(() => createTestHelper()).toThrow(/modelContextTesting is not available/i);
  });
});
