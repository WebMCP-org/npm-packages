import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createToolReconciler, type RelayToolDescriptor } from './reconciler.js';

/**
 * Integration tests for the embed tool-sync wiring.
 *
 * embed.ts is a side-effect module that runs on import and depends on
 * document.currentScript (only valid during script parsing). Rather than
 * fighting these constraints with brittle import mocks, we test the
 * integration contract:
 *
 * 1. The reconciler (tested exhaustively in reconciler.test.ts) is the
 *    single source of truth for tool list changes.
 * 2. embed.ts wires event sources → reconciler.scheduleReconcile()
 * 3. embed.ts wires reconciler.onChanged → postMessage to widget
 *
 * Tests below verify the wiring logic that embed.ts performs, using the
 * real reconciler and simulated event sources.
 */

describe('embed integration: event-to-reconciler wiring', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('toolchange event triggers reconcile and notifies on change', async () => {
    const postMessage = vi.fn();
    let tools: RelayToolDescriptor[] = [{ name: 'initial', description: 'Already registered' }];

    const reconciler = createToolReconciler({
      listTools: () => tools,
      onChanged: (t) => postMessage({ type: 'webmcp.tools.changed', tools: t }),
    });

    // Simulate what embed.ts does: bind event → scheduleReconcile
    const toolchangeHandler = () => reconciler.scheduleReconcile();

    // Initial reconcile (embed.ts calls this on startup)
    reconciler.scheduleReconcile();
    await vi.advanceTimersByTimeAsync(1);
    // Non-empty initial list differs from internal "" snapshot — triggers onChanged
    expect(postMessage).toHaveBeenCalledTimes(1);

    // Tool registered — event fires
    tools = [
      { name: 'initial', description: 'Already registered' },
      { name: 'search', description: 'Search the web', inputSchema: { type: 'object' } },
    ];
    toolchangeHandler();
    await vi.advanceTimersByTimeAsync(1);
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'webmcp.tools.changed',
      tools: [
        { name: 'initial', description: 'Already registered' },
        { name: 'search', description: 'Search the web', inputSchema: { type: 'object' } },
      ],
    });
  });

  it('tool unregistered via AbortSignal detected by polling', async () => {
    const postMessage = vi.fn();
    let tools: RelayToolDescriptor[] = [
      { name: 'tool-a', description: 'A' },
      { name: 'tool-b', description: 'B' },
    ];

    const reconciler = createToolReconciler({
      listTools: () => tools,
      onChanged: (t) => postMessage({ type: 'webmcp.tools.changed', tools: t }),
      pollInterval: 2000,
    });

    // Startup
    reconciler.startPolling();
    reconciler.scheduleReconcile();
    await vi.advanceTimersByTimeAsync(1);
    expect(postMessage).toHaveBeenCalledTimes(1);

    // Tool removed (AbortSignal — no event fires)
    tools = [{ name: 'tool-a', description: 'A' }];

    // Poll fires after 2000ms
    await vi.advanceTimersByTimeAsync(2001);
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'webmcp.tools.changed',
      tools: [{ name: 'tool-a', description: 'A' }],
    });

    reconciler.dispose();
  });

  it('description/schema change detected without name change', async () => {
    const postMessage = vi.fn();
    let tools: RelayToolDescriptor[] = [
      { name: 'api', description: 'v1', inputSchema: { type: 'object', properties: {} } },
    ];

    const reconciler = createToolReconciler({
      listTools: () => tools,
      onChanged: (t) => postMessage({ type: 'webmcp.tools.changed', tools: t }),
      pollInterval: 2000,
    });

    reconciler.startPolling();
    reconciler.scheduleReconcile();
    await vi.advanceTimersByTimeAsync(1);
    expect(postMessage).toHaveBeenCalledTimes(1);

    // Same name, different description and schema
    tools = [
      {
        name: 'api',
        description: 'v2',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      },
    ];

    await vi.advanceTimersByTimeAsync(2001);
    expect(postMessage).toHaveBeenCalledTimes(2);

    reconciler.dispose();
  });

  it('debounces multiple scheduleReconcile calls within the same tick', async () => {
    const listTools = vi.fn(() => [{ name: 'x', description: 'd' }] as RelayToolDescriptor[]);
    const postMessage = vi.fn();

    const reconciler = createToolReconciler({
      listTools,
      onChanged: (t) => postMessage({ type: 'webmcp.tools.changed', tools: t }),
    });

    // Multiple events fire in the same tick (before setTimeout resolves)
    reconciler.scheduleReconcile();
    reconciler.scheduleReconcile();
    reconciler.scheduleReconcile();
    await vi.advanceTimersByTimeAsync(1);

    // listTools should only be called once due to debounce
    expect(listTools).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it('non-exclusive subscription: both modelContext and modelContextTesting can trigger reconcile', async () => {
    const postMessage = vi.fn();
    let callCount = 0;
    const tools: RelayToolDescriptor[] = [{ name: 'tool', description: 'test' }];

    const reconciler = createToolReconciler({
      listTools: () => {
        callCount++;
        return tools;
      },
      onChanged: (t) => postMessage({ type: 'webmcp.tools.changed', tools: t }),
    });

    // Simulate two independent event sources (what embed.ts does)
    const mcHandler = () => reconciler.scheduleReconcile();
    const testingHandler = () => reconciler.scheduleReconcile();

    // Both fire in the same tick (as would happen with non-exclusive subscription)
    mcHandler();
    testingHandler();
    await vi.advanceTimersByTimeAsync(1);

    // Debounce ensures only one reconcile
    expect(callCount).toBe(1);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });
});
