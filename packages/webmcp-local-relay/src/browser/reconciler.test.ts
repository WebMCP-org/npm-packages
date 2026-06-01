// packages/webmcp-local-relay/src/browser/reconciler.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSnapshot,
  createToolReconciler,
  stableStringify,
  type RelayToolDescriptor,
} from './reconciler.js';

describe('stableStringify', () => {
  it('sorts object keys recursively', () => {
    const obj = { b: 1, a: { d: 2, c: 3 } };
    expect(stableStringify(obj)).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('handles arrays without reordering', () => {
    expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
  });

  it('handles null and primitives', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify('hello')).toBe('"hello"');
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify(true)).toBe('true');
  });
});

describe('createSnapshot', () => {
  it('sorts tools by name', () => {
    const tools: RelayToolDescriptor[] = [
      { name: 'zeta', description: 'z' },
      { name: 'alpha', description: 'a' },
    ];
    const snapshot = createSnapshot(tools);
    expect(snapshot.indexOf('alpha')).toBeLessThan(snapshot.indexOf('zeta'));
  });

  it('produces identical output for same tools in different order', () => {
    const a: RelayToolDescriptor[] = [
      { name: 'foo', description: 'f', inputSchema: { type: 'object' } },
      { name: 'bar', description: 'b' },
    ];
    const b: RelayToolDescriptor[] = [
      { name: 'bar', description: 'b' },
      { name: 'foo', description: 'f', inputSchema: { type: 'object' } },
    ];
    expect(createSnapshot(a)).toBe(createSnapshot(b));
  });

  it('differs when description changes', () => {
    const v1: RelayToolDescriptor[] = [{ name: 'tool', description: 'v1' }];
    const v2: RelayToolDescriptor[] = [{ name: 'tool', description: 'v2' }];
    expect(createSnapshot(v1)).not.toBe(createSnapshot(v2));
  });

  it('differs when inputSchema changes', () => {
    const v1: RelayToolDescriptor[] = [
      { name: 'tool', inputSchema: { type: 'object', properties: { a: { type: 'string' } } } },
    ];
    const v2: RelayToolDescriptor[] = [
      { name: 'tool', inputSchema: { type: 'object', properties: { a: { type: 'number' } } } },
    ];
    expect(createSnapshot(v1)).not.toBe(createSnapshot(v2));
  });
});

describe('createToolReconciler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('triggers onChanged when tools change', async () => {
    const onChanged = vi.fn();
    const tools: RelayToolDescriptor[] = [{ name: 'test', description: 'desc' }];

    const r = createToolReconciler({ listTools: () => tools, onChanged });
    r.scheduleReconcile();
    await vi.advanceTimersByTimeAsync(0);

    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith(tools);
  });

  it('does not trigger onChanged when tools are unchanged', async () => {
    const onChanged = vi.fn();
    const tools: RelayToolDescriptor[] = [{ name: 'test', description: 'desc' }];

    const r = createToolReconciler({ listTools: () => tools, onChanged });
    r.scheduleReconcile();
    await vi.advanceTimersByTimeAsync(0);
    expect(onChanged).toHaveBeenCalledTimes(1);

    r.scheduleReconcile();
    await vi.advanceTimersByTimeAsync(0);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('triggers onChanged when only description changes', async () => {
    const onChanged = vi.fn();
    let tools: RelayToolDescriptor[] = [{ name: 'foo', description: 'v1' }];

    const r = createToolReconciler({ listTools: () => tools, onChanged });
    r.scheduleReconcile();
    await vi.advanceTimersByTimeAsync(0);
    expect(onChanged).toHaveBeenCalledTimes(1);

    tools = [{ name: 'foo', description: 'v2' }];
    r.scheduleReconcile();
    await vi.advanceTimersByTimeAsync(0);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('triggers onChanged when only inputSchema changes', async () => {
    const onChanged = vi.fn();
    let tools: RelayToolDescriptor[] = [
      { name: 'foo', inputSchema: { type: 'object', properties: { x: { type: 'string' } } } },
    ];

    const r = createToolReconciler({ listTools: () => tools, onChanged });
    r.scheduleReconcile();
    await vi.advanceTimersByTimeAsync(0);
    expect(onChanged).toHaveBeenCalledTimes(1);

    tools = [
      { name: 'foo', inputSchema: { type: 'object', properties: { x: { type: 'number' } } } },
    ];
    r.scheduleReconcile();
    await vi.advanceTimersByTimeAsync(0);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('does not trigger when tool order changes', async () => {
    const onChanged = vi.fn();
    let tools: RelayToolDescriptor[] = [
      { name: 'b', description: 'B' },
      { name: 'a', description: 'A' },
    ];

    const r = createToolReconciler({ listTools: () => tools, onChanged });
    r.scheduleReconcile();
    await vi.advanceTimersByTimeAsync(0);
    expect(onChanged).toHaveBeenCalledTimes(1);

    tools = [
      { name: 'a', description: 'A' },
      { name: 'b', description: 'B' },
    ];
    r.scheduleReconcile();
    await vi.advanceTimersByTimeAsync(0);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('debounces multiple scheduleReconcile calls in the same tick', async () => {
    const listTools = vi.fn(() => [{ name: 'x', description: 'd' }] as RelayToolDescriptor[]);
    const onChanged = vi.fn();

    const r = createToolReconciler({ listTools, onChanged });
    r.scheduleReconcile();
    r.scheduleReconcile();
    r.scheduleReconcile();
    await vi.advanceTimersByTimeAsync(0);

    expect(listTools).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('startPolling triggers scheduleReconcile at the configured interval', async () => {
    const onChanged = vi.fn();
    let tools: RelayToolDescriptor[] = [];

    const r = createToolReconciler({ listTools: () => tools, onChanged, pollInterval: 500 });
    r.startPolling();

    // First poll fires at 500ms; +1ms to flush the setTimeout(0) inside scheduleReconcile
    tools = [{ name: 'new-tool', description: 'added' }];
    await vi.advanceTimersByTimeAsync(501);
    expect(onChanged).toHaveBeenCalledTimes(1);

    // Second poll at 1000ms - no change
    await vi.advanceTimersByTimeAsync(501);
    expect(onChanged).toHaveBeenCalledTimes(1);

    r.dispose();
  });

  it('dispose stops polling', async () => {
    const listTools = vi.fn(() => [] as RelayToolDescriptor[]);
    const onChanged = vi.fn();

    const r = createToolReconciler({ listTools, onChanged, pollInterval: 100 });
    r.startPolling();
    r.dispose();

    await vi.advanceTimersByTimeAsync(500);
    expect(listTools).not.toHaveBeenCalled();
  });

  it('handles async listTools', async () => {
    const onChanged = vi.fn();
    const tools: RelayToolDescriptor[] = [{ name: 'async-tool', description: 'async' }];
    const listTools = () => Promise.resolve(tools);

    const r = createToolReconciler({ listTools, onChanged });
    r.scheduleReconcile();
    await vi.advanceTimersByTimeAsync(0);
    // flush microtask for the Promise
    await Promise.resolve();

    expect(onChanged).toHaveBeenCalledWith(tools);
  });

  it('does not crash or notify when listTools throws', async () => {
    const onChanged = vi.fn();
    const listTools = () => {
      throw new Error('fail');
    };

    const r = createToolReconciler({ listTools, onChanged });
    r.scheduleReconcile();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(onChanged).not.toHaveBeenCalled();
  });
});
