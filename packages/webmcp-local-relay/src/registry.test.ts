import { describe, expect, it } from 'vitest';
import type { RelayTool } from './protocol.js';
import { HelloRequiredError, RelayRegistry } from './registry.js';
import type { BrowserToRelayMessage } from './schemas.js';

/**
 * Builds a valid browser `hello` message fixture.
 */
function hello(tabId: string, url: string): Extract<BrowserToRelayMessage, { type: 'hello' }> {
  return {
    type: 'hello',
    tabId,
    url,
    origin: new URL(url).origin,
    title: 'Test Page',
  };
}

/**
 * Builds a minimal valid relay tool fixture.
 */
function tool(definition: { name: string; description?: string }): RelayTool {
  return {
    ...definition,
    inputSchema: { type: 'object', properties: {} },
  };
}

describe('RelayRegistry', () => {
  it('uses just the original tool name when there are no collisions', () => {
    const registry = new RelayRegistry();

    registry.upsertSource('conn-1', hello('tab-1', 'https://docs.example.com/path'));
    registry.registerTools('conn-1', [
      tool({
        name: 'get_user_profile',
        description: 'Read user profile',
      }),
    ]);

    const tools = registry.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe('get_user_profile');
    expect(tools[0]?.sources[0]?.sourceId).toBe('conn-1');
  });

  it('disambiguates with first 4 chars of tabId on collision from different tabs', () => {
    const registry = new RelayRegistry();

    registry.upsertSource('conn-1', hello('aaaa-1234', 'https://foo.example.com'));
    registry.upsertSource('conn-2', hello('bbbb-5678', 'https://foo.example.com'));
    registry.registerTools('conn-1', [tool({ name: 'search', description: 'tab a' })]);
    registry.registerTools('conn-2', [tool({ name: 'search', description: 'tab b' })]);

    const tools = registry.listTools();
    expect(tools).toHaveLength(2);

    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['search_aaaa', 'search_bbbb']);
  });

  it('reverts to short name when collision resolves after disconnect', () => {
    const registry = new RelayRegistry();

    registry.upsertSource('conn-1', hello('aaaa-1234', 'https://example.com'));
    registry.upsertSource('conn-2', hello('bbbb-5678', 'https://example.com'));
    registry.registerTools('conn-1', [tool({ name: 'action' })]);
    registry.registerTools('conn-2', [tool({ name: 'action' })]);

    expect(registry.listTools()).toHaveLength(2);
    expect(registry.listTools().every((t) => t.name !== 'action')).toBe(true);

    registry.removeConnection('conn-2');

    const tools = registry.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe('action');
  });

  it('keeps the newest provider for the same tab-scoped tool name', () => {
    let time = 1000;
    const registry = new RelayRegistry(() => time);

    registry.upsertSource('conn-1', hello('tab-stable', 'https://github.com/a'));
    registry.registerTools('conn-1', [tool({ name: 'open_issue', description: 'v1' })]);

    time = 2000;

    registry.upsertSource('conn-2', hello('tab-stable', 'https://github.com/a'));
    registry.registerTools('conn-2', [tool({ name: 'open_issue', description: 'v2' })]);

    const tools = registry.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe('open_issue');
    expect(tools[0]?.description).toBe('v2');
    expect(tools[0]?.sources.map((s) => s.sourceId)).toEqual(['conn-2', 'conn-1']);
  });

  it('resolves invocation by explicit request tab id when provided', () => {
    const registry = new RelayRegistry();

    registry.upsertSource('conn-1', hello('tab-a', 'https://foo.example.com'));
    registry.upsertSource('conn-2', hello('tab-b', 'https://foo.example.com'));
    registry.registerTools('conn-1', [tool({ name: 'search', description: 'tab a' })]);
    registry.registerTools('conn-2', [tool({ name: 'search', description: 'tab b' })]);

    const toolForB = registry.listTools().find((t) => t.sources[0]?.tabId === 'tab-b');
    expect(toolForB).toBeTruthy();
    if (!toolForB) {
      throw new Error('Expected a tool for tab-b');
    }

    const resolved = registry.resolveInvocation({
      toolName: toolForB.name,
      requestTabId: 'tab-b',
    });

    expect(resolved?.connectionId).toBe('conn-2');
  });

  it('removes tools when a source disconnects', () => {
    const registry = new RelayRegistry();

    registry.upsertSource('conn-1', hello('tab-1', 'https://example.com'));
    registry.registerTools('conn-1', [tool({ name: 'echo', description: 'Echo' })]);
    expect(registry.listTools()).toHaveLength(1);

    registry.removeConnection('conn-1');
    expect(registry.listTools()).toHaveLength(0);
    expect(registry.listSources()).toHaveLength(0);
  });

  it('throws when registering tools before hello', () => {
    const registry = new RelayRegistry();
    expect(() => registry.registerTools('conn-unknown', [tool({ name: 'foo' })])).toThrow(
      HelloRequiredError
    );
  });

  it('resolves invocation by explicit sourceId (connectionId)', () => {
    let time = 1000;
    const registry = new RelayRegistry(() => time);

    registry.upsertSource('conn-1', hello('aaaa-1234', 'https://example.com'));
    registry.registerTools('conn-1', [tool({ name: 'action', description: 'v1' })]);

    time = 2000;
    registry.upsertSource('conn-2', hello('bbbb-5678', 'https://example.com'));
    registry.registerTools('conn-2', [tool({ name: 'action', description: 'v2' })]);

    const toolForA = registry.listTools().find((t) => t.sources[0]?.tabId === 'aaaa-1234');
    expect(toolForA).toBeTruthy();
    if (!toolForA) {
      throw new Error('Expected a tool for tab aaaa-1234');
    }

    const resolved = registry.resolveInvocation({
      toolName: toolForA.name,
      sourceId: 'conn-1',
    });

    expect(resolved?.connectionId).toBe('conn-1');
  });

  it('resolves invocation to most-recent provider by default', () => {
    let time = 1000;
    const registry = new RelayRegistry(() => time);

    registry.upsertSource('conn-1', hello('tab-x', 'https://same.example.com'));
    registry.registerTools('conn-1', [tool({ name: 'do_thing' })]);

    time = 2000;
    registry.upsertSource('conn-2', hello('tab-x', 'https://same.example.com'));
    registry.registerTools('conn-2', [tool({ name: 'do_thing' })]);

    const tools = registry.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe('do_thing');

    const resolved = registry.resolveInvocation({
      toolName: 'do_thing',
    });

    expect(resolved?.connectionId).toBe('conn-2');
  });

  it('returns null for resolveInvocation with non-existent sourceId', () => {
    const registry = new RelayRegistry();

    registry.upsertSource('conn-1', hello('tab-1', 'https://example.com'));
    registry.registerTools('conn-1', [tool({ name: 'tool_a' })]);

    const tools = registry.listTools();
    const toolName = tools[0]?.name;
    expect(toolName).toBe('tool_a');

    const resolved = registry.resolveInvocation({
      toolName: toolName as string,
      sourceId: 'nonexistent',
    });

    expect(resolved).toBeNull();
  });

  it('touchConnection is a no-op for non-existent connections', () => {
    const registry = new RelayRegistry();
    registry.touchConnection('nonexistent-connection');
    expect(registry.listSources()).toHaveLength(0);
  });

  it('resolves invocation by sourceId falling back to tabId match', () => {
    const registry = new RelayRegistry();

    registry.upsertSource('conn-1', hello('shared-tab', 'https://example.com'));
    registry.registerTools('conn-1', [tool({ name: 'action', description: 'do something' })]);

    const resolved = registry.resolveInvocation({
      toolName: 'action',
      sourceId: 'shared-tab',
    });

    expect(resolved?.connectionId).toBe('conn-1');
  });

  it('returns null for resolveInvocation with non-matching requestTabId', () => {
    const registry = new RelayRegistry();

    registry.upsertSource('conn-1', hello('tab-1', 'https://example.com'));
    registry.registerTools('conn-1', [tool({ name: 'tool_a' })]);

    const resolved = registry.resolveInvocation({
      toolName: 'tool_a',
      requestTabId: 'nonexistent-tab',
    });

    expect(resolved).toBeNull();
  });

  it('returns null for resolveInvocation with non-existent tool name', () => {
    const registry = new RelayRegistry();

    registry.upsertSource('conn-1', hello('tab-1', 'https://example.com'));
    registry.registerTools('conn-1', [tool({ name: 'tool_a' })]);

    const resolved = registry.resolveInvocation({
      toolName: 'nonexistent_tool',
    });

    expect(resolved).toBeNull();
  });

  it('upsertSource preserves existing metadata when new hello has partial data', () => {
    const registry = new RelayRegistry();

    registry.upsertSource('conn-1', {
      type: 'hello',
      tabId: 'tab-1',
      url: 'https://example.com/page',
      origin: 'https://example.com',
      title: 'Original Title',
    });

    registry.upsertSource('conn-1', {
      type: 'hello',
      tabId: 'tab-1',
    });

    registry.registerTools('conn-1', [tool({ name: 'tool_a' })]);
    const sources = registry.listSources();
    expect(sources[0]?.title).toBe('Original Title');
    expect(sources[0]?.origin).toBe('https://example.com');
  });

  it('removeConnection is safe for non-existent connections', () => {
    const registry = new RelayRegistry();
    registry.removeConnection('nonexistent');
    expect(registry.listTools()).toHaveLength(0);
  });

  it('sorts listSources by most recently seen first', () => {
    let time = 1000;
    const registry = new RelayRegistry(() => time);

    registry.upsertSource('conn-1', hello('tab-1', 'https://a.example.com'));
    registry.registerTools('conn-1', [tool({ name: 'tool_a' })]);

    time = 2000;
    registry.upsertSource('conn-2', hello('tab-2', 'https://b.example.com'));
    registry.registerTools('conn-2', [tool({ name: 'tool_b' })]);

    const sources = registry.listSources();
    expect(sources).toHaveLength(2);
    expect(sources[0]?.sourceId).toBe('conn-2');
    expect(sources[1]?.sourceId).toBe('conn-1');

    // Touch conn-1 to make it more recent
    time = 3000;
    registry.touchConnection('conn-1');

    const sourcesAfter = registry.listSources();
    expect(sourcesAfter[0]?.sourceId).toBe('conn-1');
    expect(sourcesAfter[1]?.sourceId).toBe('conn-2');
  });

  it('sorts listSources by sourceId when lastSeenAt is equal', () => {
    const registry = new RelayRegistry(() => 1000);

    registry.upsertSource('conn-b', hello('tab-b', 'https://example.com'));
    registry.registerTools('conn-b', [tool({ name: 'tool_b' })]);

    registry.upsertSource('conn-a', hello('tab-a', 'https://example.com'));
    registry.registerTools('conn-a', [tool({ name: 'tool_a' })]);

    const sources = registry.listSources();
    expect(sources).toHaveLength(2);
    // Same timestamp — compareRecency(b, a, bId, aId) descending by id
    expect(sources[0]?.sourceId).toBe('conn-b');
    expect(sources[1]?.sourceId).toBe('conn-a');
  });

  it('filters out sources with zero tools from listSources', () => {
    const registry = new RelayRegistry();

    registry.upsertSource('conn-1', hello('tab-1', 'https://example.com'));

    expect(registry.listSources()).toHaveLength(0);

    registry.registerTools('conn-1', [tool({ name: 'tool_a' })]);
    expect(registry.listSources()).toHaveLength(1);
  });
});
