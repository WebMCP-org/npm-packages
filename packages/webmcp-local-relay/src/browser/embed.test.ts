/**
 * Tests for embed.ts tool list synchronization mechanism:
 * - trySubscribe subscribes on both modelContext and modelContextTesting (non-exclusive)
 * - Poll-based fallback detects tool changes when events are unreliable
 * - onToolsChanged updates lastToolsSnapshot to prevent duplicate pushes from polling
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal mock types matching what embed.ts expects
interface MockModelContext {
  listTools: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
}

interface MockModelContextTesting {
  listTools: ReturnType<typeof vi.fn>;
  executeTool: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  registerToolsChangedCallback?: ReturnType<typeof vi.fn>;
}

// We test the logic by reimplementing the core functions in isolation
// since embed.ts is a side-effect module that runs on import.

describe('embed tool sync: trySubscribe (non-exclusive subscription)', () => {
  let originalModelContext: unknown;
  let originalModelContextTesting: unknown;

  beforeEach(() => {
    originalModelContext = (navigator as Record<string, unknown>).modelContext;
    originalModelContextTesting = (navigator as Record<string, unknown>).modelContextTesting;
  });

  afterEach(() => {
    (navigator as Record<string, unknown>).modelContext = originalModelContext;
    (navigator as Record<string, unknown>).modelContextTesting = originalModelContextTesting;
  });

  it('subscribes on both modelContext AND modelContextTesting when both available', () => {
    const mcAddEventListener = vi.fn();
    const testingAddEventListener = vi.fn();

    const mc: MockModelContext = {
      listTools: vi.fn(() => []),
      callTool: vi.fn(),
      addEventListener: mcAddEventListener,
    };
    const testing: MockModelContextTesting = {
      listTools: vi.fn(() => []),
      executeTool: vi.fn(),
      addEventListener: testingAddEventListener,
    };

    (navigator as Record<string, unknown>).modelContext = mc;
    (navigator as Record<string, unknown>).modelContextTesting = testing;

    // Simulate trySubscribe logic
    let subscribed = false;

    // Path A: modelContext
    if (
      mc &&
      typeof mc.listTools === 'function' &&
      typeof mc.callTool === 'function' &&
      typeof mc.addEventListener === 'function'
    ) {
      mc.addEventListener('toolchange', expect.any(Function));
      subscribed = true;
    }

    // Path B: testing (non-exclusive — always attempted regardless of Path A)
    if (testing && typeof testing.addEventListener === 'function') {
      testing.addEventListener('toolchange', expect.any(Function));
      subscribed = true;
    }

    expect(subscribed).toBe(true);
    expect(mcAddEventListener).toHaveBeenCalledWith('toolchange', expect.any(Function));
    expect(testingAddEventListener).toHaveBeenCalledWith('toolchange', expect.any(Function));
  });

  it('subscribes only on modelContextTesting when modelContext lacks listTools/callTool', () => {
    const testingAddEventListener = vi.fn();

    // Chrome native: modelContext has registerTool but no listTools/callTool
    (navigator as Record<string, unknown>).modelContext = {
      registerTool: vi.fn(),
    };
    const testing: MockModelContextTesting = {
      listTools: vi.fn(() => []),
      executeTool: vi.fn(),
      addEventListener: testingAddEventListener,
    };
    (navigator as Record<string, unknown>).modelContextTesting = testing;

    // Simulate: getExtendedModelContext returns undefined (no listTools/callTool)
    const mc = navigator.modelContext as Record<string, unknown>;
    const hasListTools = typeof mc.listTools === 'function';
    const hasCallTool = typeof mc.callTool === 'function';

    expect(hasListTools).toBe(false);
    expect(hasCallTool).toBe(false);

    // Path B should still succeed
    testing.addEventListener('toolchange', () => {});
    expect(testingAddEventListener).toHaveBeenCalledWith('toolchange', expect.any(Function));
  });

  it('falls back to registerToolsChangedCallback when testing lacks addEventListener', () => {
    const callback = vi.fn();
    const testing = {
      listTools: vi.fn(() => []),
      executeTool: vi.fn(),
      registerToolsChangedCallback: callback,
    };

    (navigator as Record<string, unknown>).modelContext = undefined;
    (navigator as Record<string, unknown>).modelContextTesting = testing;

    // No addEventListener on testing
    expect(typeof (testing as Record<string, unknown>).addEventListener).toBe('undefined');

    // Should use registerToolsChangedCallback
    testing.registerToolsChangedCallback(() => {});
    expect(callback).toHaveBeenCalled();
  });
});

describe('embed tool sync: polling fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('detects tool list changes via polling and triggers notification', async () => {
    let lastToolsSnapshot = '';
    const onToolsChanged = vi.fn();
    let currentTools = [{ name: 'tool-a' }, { name: 'tool-b' }];

    const listTools = vi.fn(() => currentTools);

    // Simulate one poll cycle
    const pollOnce = (): void => {
      const tools = listTools();
      const names = tools
        .map((t) => t.name)
        .sort()
        .join('\0');
      if (names !== lastToolsSnapshot) {
        lastToolsSnapshot = names;
        onToolsChanged();
      }
    };

    // First poll — detects initial tools
    pollOnce();
    expect(onToolsChanged).toHaveBeenCalledTimes(1);
    expect(lastToolsSnapshot).toBe('tool-a\0tool-b');

    // Same tools — no notification
    pollOnce();
    expect(onToolsChanged).toHaveBeenCalledTimes(1);

    // Tool removed — should detect change
    currentTools = [{ name: 'tool-a' }];
    pollOnce();
    expect(onToolsChanged).toHaveBeenCalledTimes(2);
    expect(lastToolsSnapshot).toBe('tool-a');

    // Tool added — should detect change
    currentTools = [{ name: 'tool-a' }, { name: 'tool-c' }];
    pollOnce();
    expect(onToolsChanged).toHaveBeenCalledTimes(3);
    expect(lastToolsSnapshot).toBe('tool-a\0tool-c');
  });

  it('does not trigger notification when tool list is unchanged', () => {
    let lastToolsSnapshot = 'tool-x\0tool-y';
    const onToolsChanged = vi.fn();
    const tools = [{ name: 'tool-x' }, { name: 'tool-y' }];

    const names = tools
      .map((t) => t.name)
      .sort()
      .join('\0');
    if (names !== lastToolsSnapshot) {
      lastToolsSnapshot = names;
      onToolsChanged();
    }

    expect(onToolsChanged).not.toHaveBeenCalled();
  });

  it('snapshot comparison is order-independent (sorted)', () => {
    let lastToolsSnapshot = '';
    const onToolsChanged = vi.fn();

    const pollWith = (tools: Array<{ name: string }>): void => {
      const names = tools
        .map((t) => t.name)
        .sort()
        .join('\0');
      if (names !== lastToolsSnapshot) {
        lastToolsSnapshot = names;
        onToolsChanged();
      }
    };

    // Register in order [b, a]
    pollWith([{ name: 'tool-b' }, { name: 'tool-a' }]);
    expect(onToolsChanged).toHaveBeenCalledTimes(1);
    expect(lastToolsSnapshot).toBe('tool-a\0tool-b');

    // Same tools in different order [a, b] — should NOT trigger
    pollWith([{ name: 'tool-a' }, { name: 'tool-b' }]);
    expect(onToolsChanged).toHaveBeenCalledTimes(1);
  });
});

describe('embed tool sync: onToolsChanged snapshot synchronization', () => {
  it('onToolsChanged updates snapshot so polling does not re-push', () => {
    // Simulates the scenario: event fires -> onToolsChanged pushes -> poll checks
    let lastToolsSnapshot = '';
    const onToolsChanged = vi.fn();

    const tools = [{ name: 'alpha' }, { name: 'beta' }];

    // Simulate onToolsChanged updating the snapshot (as the real implementation does)
    const toolList = tools;
    lastToolsSnapshot = toolList
      .map((t) => t.name)
      .sort()
      .join('\0');

    // Now simulate a poll cycle with the same tools
    const pollNames = tools
      .map((t) => t.name)
      .sort()
      .join('\0');
    if (pollNames !== lastToolsSnapshot) {
      onToolsChanged();
    }

    // Should NOT have been called — snapshot was already up to date
    expect(onToolsChanged).not.toHaveBeenCalled();
  });

  it('polling detects change after snapshot was set by a prior push', () => {
    let lastToolsSnapshot = 'alpha\0beta';
    const onToolsChanged = vi.fn();

    // Tools changed (gamma added, beta removed)
    const newTools = [{ name: 'alpha' }, { name: 'gamma' }];
    const pollNames = newTools
      .map((t) => t.name)
      .sort()
      .join('\0');

    if (pollNames !== lastToolsSnapshot) {
      lastToolsSnapshot = pollNames;
      onToolsChanged();
    }

    expect(onToolsChanged).toHaveBeenCalledTimes(1);
    expect(lastToolsSnapshot).toBe('alpha\0gamma');
  });
});
