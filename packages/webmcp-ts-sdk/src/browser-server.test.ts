import type { ModelContextCore, ToolDescriptor } from '@mcp-b/webmcp-types';
import { describe, expect, it } from 'vitest';
import { BrowserMcpServer } from './browser-server.js';

function createTool(name: string): ToolDescriptor {
  return {
    name,
    description: `${name} description`,
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({ content: [{ type: 'text', text: name }] }),
  };
}

describe('BrowserMcpServer native context fallback', () => {
  it('replaces and clears mirrored native tools when clearContext is unavailable', () => {
    const registeredTools = new Set<string>();
    const unregisteredTools: string[] = [];
    const native = {
      registerTool: (tool: ToolDescriptor) => {
        registeredTools.add(tool.name);
      },
      unregisterTool: (name: string) => {
        unregisteredTools.push(name);
        registeredTools.delete(name);
      },
    } as Partial<ModelContextCore> as ModelContextCore;

    const server = new BrowserMcpServer({ name: 'test-server', version: '1.0.0' }, { native });

    server.provideContext({ tools: [createTool('alpha')] });
    expect(server.listTools().map((tool) => tool.name)).toEqual(['alpha']);
    expect([...registeredTools]).toEqual(['alpha']);

    server.provideContext({ tools: [createTool('beta')] });
    expect(server.listTools().map((tool) => tool.name)).toEqual(['beta']);
    expect([...registeredTools]).toEqual(['beta']);
    expect(unregisteredTools).toContain('alpha');

    server.clearContext();
    expect(server.listTools()).toEqual([]);
    expect([...registeredTools]).toEqual([]);
    expect(unregisteredTools).toContain('beta');
  });
});
