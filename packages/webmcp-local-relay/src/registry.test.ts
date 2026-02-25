import { describe, expect, it } from 'vitest';
import { HelloRequiredError, RelayRegistry } from './registry.js';
import type { BrowserToRelayMessage } from './schemas.js';

function hello(tabId: string, url: string): Extract<BrowserToRelayMessage, { type: 'hello' }> {
  return {
    type: 'hello',
    tabId,
    url,
    origin: new URL(url).origin,
    title: 'Test Page',
  };
}

describe('RelayRegistry', () => {
  it('registers tools with deterministic namespaced tool IDs', () => {
    const registry = new RelayRegistry();

    registry.upsertSource('conn-1', hello('tab-1', 'https://docs.example.com/path'));
    registry.registerTools('conn-1', [
      {
        name: 'get-user_profile',
        description: 'Read user profile',
      },
    ]);

    const tools = registry.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe('webmcp_docs_example_com_tabtab_1_get_user_profile');
    expect(tools[0]?.sources[0]?.sourceId).toBe('conn-1');
  });

  it('keeps the newest provider for the same tab-scoped tool name', () => {
    let time = 1000;
    const registry = new RelayRegistry(() => time);

    registry.upsertSource('conn-1', hello('tab-stable', 'https://github.com/a'));
    registry.registerTools('conn-1', [{ name: 'open_issue', description: 'v1' }]);

    time = 2000;

    registry.upsertSource('conn-2', hello('tab-stable', 'https://github.com/a'));
    registry.registerTools('conn-2', [{ name: 'open_issue', description: 'v2' }]);

    const tools = registry.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]?.description).toBe('v2');
    expect(tools[0]?.sources.map((s) => s.sourceId)).toEqual(['conn-2', 'conn-1']);
  });

  it('resolves invocation by explicit request tab id when provided', () => {
    const registry = new RelayRegistry();

    registry.upsertSource('conn-1', hello('tab-a', 'https://foo.example.com'));
    registry.upsertSource('conn-2', hello('tab-b', 'https://foo.example.com'));
    registry.registerTools('conn-1', [{ name: 'search', description: 'tab a' }]);
    registry.registerTools('conn-2', [{ name: 'search', description: 'tab b' }]);

    const toolName = registry
      .listTools()
      .find((tool) => tool.name.includes('tabtab_b_search'))?.name;
    expect(toolName).toBeTruthy();
    if (!toolName) {
      throw new Error('Expected toolName to be resolved');
    }

    const resolved = registry.resolveInvocation({
      toolName,
      requestTabId: 'tab-b',
    });

    expect(resolved?.connectionId).toBe('conn-2');
  });

  it('removes tools when a source disconnects', () => {
    const registry = new RelayRegistry();

    registry.upsertSource('conn-1', hello('tab-1', 'https://example.com'));
    registry.registerTools('conn-1', [{ name: 'echo', description: 'Echo' }]);
    expect(registry.listTools()).toHaveLength(1);

    registry.removeConnection('conn-1');
    expect(registry.listTools()).toHaveLength(0);
    expect(registry.listSources()).toHaveLength(0);
  });

  it('throws when registering tools before hello', () => {
    const registry = new RelayRegistry();
    expect(() => registry.registerTools('conn-unknown', [{ name: 'foo' }])).toThrow(
      HelloRequiredError
    );
  });

  it('resolves invocation by explicit sourceId (connectionId)', () => {
    let time = 1000;
    const registry = new RelayRegistry(() => time);

    registry.upsertSource('conn-1', hello('tab-a', 'https://example.com'));
    registry.registerTools('conn-1', [{ name: 'action', description: 'v1' }]);

    time = 2000;
    registry.upsertSource('conn-2', hello('tab-b', 'https://example.com'));
    registry.registerTools('conn-2', [{ name: 'action', description: 'v2' }]);

    const tools = registry.listTools();
    const toolForTabA = tools.find((t) => t.name.includes('tabtab_a'));
    if (!toolForTabA) {
      throw new Error('Expected toolForTabA to be found');
    }

    const resolved = registry.resolveInvocation({
      toolName: toolForTabA.name,
      sourceId: 'conn-1',
    });

    expect(resolved?.connectionId).toBe('conn-1');
  });

  it('resolves invocation to most-recent provider by default', () => {
    let time = 1000;
    const registry = new RelayRegistry(() => time);

    registry.upsertSource('conn-1', hello('tab-x', 'https://same.example.com'));
    registry.registerTools('conn-1', [{ name: 'do_thing' }]);

    time = 2000;
    registry.upsertSource('conn-2', hello('tab-x', 'https://same.example.com'));
    registry.registerTools('conn-2', [{ name: 'do_thing' }]);

    const tools = registry.listTools();
    expect(tools).toHaveLength(1);

    const toolName = tools[0]?.name;
    expect(toolName).toBeTruthy();

    const resolved = registry.resolveInvocation({
      toolName: toolName as string,
    });

    expect(resolved?.connectionId).toBe('conn-2');
  });

  it('returns null for resolveInvocation with non-existent sourceId', () => {
    const registry = new RelayRegistry();

    registry.upsertSource('conn-1', hello('tab-1', 'https://example.com'));
    registry.registerTools('conn-1', [{ name: 'tool_a' }]);

    const tools = registry.listTools();
    const toolName = tools[0]?.name;
    expect(toolName).toBeTruthy();

    const resolved = registry.resolveInvocation({
      toolName: toolName as string,
      sourceId: 'nonexistent',
    });

    expect(resolved).toBeNull();
  });

  it('filters out sources with zero tools from listSources', () => {
    const registry = new RelayRegistry();

    registry.upsertSource('conn-1', hello('tab-1', 'https://example.com'));
    // No tools registered

    expect(registry.listSources()).toHaveLength(0);

    registry.registerTools('conn-1', [{ name: 'tool_a' }]);
    expect(registry.listSources()).toHaveLength(1);
  });
});
