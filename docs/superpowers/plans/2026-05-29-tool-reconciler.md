# Tool Reconciler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a unified tool inventory reconciler that compares full descriptors and provides a single `scheduleReconcile()` entry point for both event-driven and poll-driven tool list synchronization.

**Architecture:** A new `reconciler.ts` module owns all reconciliation state (snapshot, debounce flag, poll timer). `embed.ts` becomes a thin shell that wires event sources and the widget iframe to the reconciler. Tests exercise the real shipped code at two layers: unit tests on the reconciler, integration tests on embed.ts.

**Tech Stack:** TypeScript, Vitest (fake timers for unit tests, `vi.isolateModules` for integration tests)

---

## File Map

| File                                                         | Action  | Responsibility                                     |
| ------------------------------------------------------------ | ------- | -------------------------------------------------- |
| `packages/webmcp-local-relay/src/browser/reconciler.ts`      | CREATE  | Tool reconciler: snapshot, debounce, poll, compare |
| `packages/webmcp-local-relay/src/browser/reconciler.test.ts` | CREATE  | Unit tests for reconciler                          |
| `packages/webmcp-local-relay/src/browser/embed.ts`           | MODIFY  | Remove inline sync logic, wire to reconciler       |
| `packages/webmcp-local-relay/src/browser/embed.test.ts`      | REWRITE | Integration tests verifying wiring                 |

---

### Task 1: Create `reconciler.ts` with types and `stableStringify`

**Files:**

- Create: `packages/webmcp-local-relay/src/browser/reconciler.ts`

- [ ] **Step 1: Create reconciler.ts with types and snapshot utility**

```ts
// packages/webmcp-local-relay/src/browser/reconciler.ts

type JsonObject = Record<string, unknown>;

export interface RelayToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: JsonObject;
}

export interface ReconcilerOptions {
  listTools: () => RelayToolDescriptor[] | Promise<RelayToolDescriptor[]>;
  onChanged: (tools: RelayToolDescriptor[]) => void;
  pollInterval?: number;
}

export interface ToolReconciler {
  scheduleReconcile(): void;
  startPolling(): void;
  dispose(): void;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}

export function createSnapshot(tools: RelayToolDescriptor[]): string {
  const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
  return sorted.map(stableStringify).join('\n');
}

export function createToolReconciler(options: ReconcilerOptions): ToolReconciler {
  const DEFAULT_POLL_INTERVAL = 2000;
  let lastSnapshot = '';
  let scheduled = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function reconcile(): void {
    scheduled = false;
    Promise.resolve(options.listTools())
      .then((tools) => {
        const list = Array.isArray(tools) ? tools : [];
        const snapshot = createSnapshot(list);
        if (snapshot !== lastSnapshot) {
          lastSnapshot = snapshot;
          options.onChanged(list);
        }
      })
      .catch(() => {});
  }

  function scheduleReconcile(): void {
    if (scheduled) return;
    scheduled = true;
    setTimeout(reconcile, 0);
  }

  function startPolling(): void {
    if (pollTimer) return;
    pollTimer = setInterval(scheduleReconcile, options.pollInterval ?? DEFAULT_POLL_INTERVAL);
  }

  function dispose(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    scheduled = false;
  }

  return { scheduleReconcile, startPolling, dispose };
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `pnpm --filter webmcp-local-relay exec vp typecheck 2>&1 | head -20`
Expected: No errors related to reconciler.ts (or zero errors total).

- [ ] **Step 3: Commit**

```bash
git add packages/webmcp-local-relay/src/browser/reconciler.ts
git commit -m "feat(webmcp-local-relay): add tool reconciler module with stable snapshot comparison"
```

---

### Task 2: Write reconciler unit tests

**Files:**

- Create: `packages/webmcp-local-relay/src/browser/reconciler.test.ts`

- [ ] **Step 1: Write the full reconciler test suite**

```ts
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

    // First poll fires at 500ms
    tools = [{ name: 'new-tool', description: 'added' }];
    await vi.advanceTimersByTimeAsync(500);
    // setTimeout(0) inside scheduleReconcile
    await vi.advanceTimersByTimeAsync(0);
    expect(onChanged).toHaveBeenCalledTimes(1);

    // Second poll at 1000ms - no change
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(0);
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
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm --filter webmcp-local-relay exec vp test run src/browser/reconciler.test.ts`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/webmcp-local-relay/src/browser/reconciler.test.ts
git commit -m "test(webmcp-local-relay): add reconciler unit tests covering full descriptor comparison"
```

---

### Task 3: Refactor `embed.ts` to use reconciler

**Files:**

- Modify: `packages/webmcp-local-relay/src/browser/embed.ts:14-21` (imports)
- Modify: `packages/webmcp-local-relay/src/browser/embed.ts:22-35` (remove RelayToolDescriptor, keep JsonObject)
- Modify: `packages/webmcp-local-relay/src/browser/embed.ts:248-392` (remove sync logic, add reconciler wiring)

- [ ] **Step 1: Update imports — add reconciler, remove unused type imports**

In `embed.ts`, replace the import block (lines 14-20) with:

```ts
import type {
  ModelContextTestingPolyfillExtensions,
  ModelContextTestingToolInfo,
  ModelContextWithExtensions,
  ToolListItem,
} from '@mcp-b/webmcp-types';
import { isJsonObject } from './shared.js';
import {
  createToolReconciler,
  type RelayToolDescriptor,
  type ToolReconciler,
} from './reconciler.js';
```

- [ ] **Step 2: Remove the `RelayToolDescriptor` interface from embed.ts**

Delete the `RelayToolDescriptor` interface block (lines 31-35 in the original):

```ts
// DELETE this block — it's now imported from reconciler.ts
interface RelayToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: JsonObject;
}
```

- [ ] **Step 3: Remove old sync state and functions**

Delete these declarations and functions from embed.ts:

- `let pushScheduled = false;` (line 248)
- `let lastToolsSnapshot = '';` (line 250)
- `let pollTimer` (line 252)
- `const POLL_INTERVAL_MS = 2000;` (line 253)
- `function onToolsChanged(): void { ... }` (lines 255-280)
- `function trySubscribe(): boolean { ... }` — keep the function but rewrite it (lines 289-328)
- `function startToolListPolling(): void { ... }` (lines 336-357)

- [ ] **Step 4: Add reconciler instance and rewrite `subscribeToToolChanges`**

Replace the removed code with:

```ts
let reconciler: ToolReconciler | null = null;

function initReconciler(): void {
  reconciler = createToolReconciler({
    listTools() {
      const bridge = getToolBridge();
      return bridge ? bridge.listTools() : [];
    },
    onChanged(tools) {
      if (!widgetWindow) return;
      widgetWindow.postMessage({ type: 'webmcp.tools.changed', tools }, config.widgetOrigin);
    },
  });
}

function trySubscribe(): boolean {
  if (!reconciler) return false;
  let subscribed = false;

  const mc = getExtendedModelContext();
  if (mc) {
    try {
      mc.addEventListener('toolchange', () => reconciler!.scheduleReconcile());
      subscribed = true;
    } catch (error) {
      debugWarn('addEventListener on modelContext threw:', error);
    }
  }

  const testing = navigator.modelContextTesting as
    | (typeof navigator.modelContextTesting & Partial<ModelContextTestingPolyfillExtensions>)
    | undefined;
  if (testing) {
    if (typeof testing.addEventListener === 'function') {
      try {
        testing.addEventListener('toolchange', () => reconciler!.scheduleReconcile());
        subscribed = true;
      } catch (error) {
        debugWarn('addEventListener on modelContextTesting threw:', error);
      }
    } else if (typeof testing.registerToolsChangedCallback === 'function') {
      try {
        testing.registerToolsChangedCallback(() => reconciler!.scheduleReconcile());
        subscribed = true;
      } catch (error) {
        debugWarn('Failed to subscribe via registerToolsChangedCallback:', error);
      }
    }
  }

  return subscribed;
}

function subscribeToToolChanges(): void {
  initReconciler();

  if (!trySubscribe()) {
    let retries = 0;
    let retryDelayMs = 100;
    const MAX_RETRIES = 40;
    const MAX_RETRY_DELAY_MS = 1000;

    const scheduleRetry = (): void => {
      setTimeout(() => {
        retries++;
        if (trySubscribe()) {
          reconciler!.startPolling();
          reconciler!.scheduleReconcile();
          return;
        }

        if (retries >= MAX_RETRIES) {
          debugWarn(
            `Could not subscribe to tool changes after ${MAX_RETRIES} retries. Dynamic tool updates will not be relayed.`
          );
          reconciler!.startPolling();
          reconciler!.scheduleReconcile();
          return;
        }

        retryDelayMs = Math.min(Math.round(retryDelayMs * 1.5), MAX_RETRY_DELAY_MS);
        scheduleRetry();
      }, retryDelayMs);
    };

    scheduleRetry();
    return;
  }

  reconciler!.startPolling();
  reconciler!.scheduleReconcile();
}
```

- [ ] **Step 5: Verify build and typecheck pass**

Run: `pnpm build && pnpm typecheck`
Expected: No errors.

- [ ] **Step 6: Run existing unit tests to check nothing else broke**

Run: `pnpm --filter webmcp-local-relay exec vp test run`
Expected: All tests pass (the old embed.test.ts tests may fail since we changed internals — that's expected and we'll rewrite them in Task 4).

- [ ] **Step 7: Commit**

```bash
git add packages/webmcp-local-relay/src/browser/embed.ts
git commit -m "refactor(webmcp-local-relay): wire embed.ts to reconciler, remove inline sync logic"
```

---

### Task 4: Rewrite `embed.test.ts` as integration tests

**Files:**

- Rewrite: `packages/webmcp-local-relay/src/browser/embed.test.ts`

- [ ] **Step 1: Delete the existing embed.test.ts content and write integration tests**

```ts
// packages/webmcp-local-relay/src/browser/embed.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for embed.ts — verify the shipped module correctly wires
 * event sources and the widget iframe to the reconciler.
 *
 * Uses vi.isolateModules to import embed.ts as a fresh side-effect module
 * with controlled global mocks.
 */

interface MockModelContext {
  listTools: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
}

interface MockModelContextTesting {
  listTools: ReturnType<typeof vi.fn>;
  executeTool: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
}

function createMockScript(attrs: Record<string, string> = {}): HTMLScriptElement {
  const el = document.createElement('script');
  el.src = 'http://localhost/embed.js';
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

describe('embed.ts integration: event source wiring', () => {
  let originalModelContext: unknown;
  let originalModelContextTesting: unknown;

  beforeEach(() => {
    originalModelContext = (navigator as Record<string, unknown>).modelContext;
    originalModelContextTesting = (navigator as Record<string, unknown>).modelContextTesting;
  });

  afterEach(() => {
    (navigator as Record<string, unknown>).modelContext = originalModelContext;
    (navigator as Record<string, unknown>).modelContextTesting = originalModelContextTesting;
    document.querySelectorAll('[data-webmcp-relay]').forEach((el) => el.remove());
  });

  it('subscribes to toolchange on both modelContext and modelContextTesting', async () => {
    const mcListener = vi.fn();
    const testingListener = vi.fn();

    const mc: MockModelContext = {
      listTools: vi.fn(() => []),
      callTool: vi.fn(),
      addEventListener: mcListener,
    };
    const testing: MockModelContextTesting = {
      listTools: vi.fn(() => []),
      executeTool: vi.fn(),
      addEventListener: testingListener,
    };

    (navigator as Record<string, unknown>).modelContext = mc;
    (navigator as Record<string, unknown>).modelContextTesting = testing;

    // The module is a side-effect — importing it triggers subscription
    await vi.isolateModules(async () => {
      // Mock document.currentScript for config
      Object.defineProperty(document, 'currentScript', {
        value: createMockScript({ 'data-relay-host': '127.0.0.1', 'data-relay-port': '9333' }),
        configurable: true,
      });
      await import('./embed.js');
    });

    expect(mcListener).toHaveBeenCalledWith('toolchange', expect.any(Function));
    expect(testingListener).toHaveBeenCalledWith('toolchange', expect.any(Function));
  });
});

describe('embed.ts integration: tool change notification', () => {
  let originalModelContext: unknown;
  let originalModelContextTesting: unknown;

  beforeEach(() => {
    vi.useFakeTimers();
    originalModelContext = (navigator as Record<string, unknown>).modelContext;
    originalModelContextTesting = (navigator as Record<string, unknown>).modelContextTesting;
  });

  afterEach(() => {
    vi.useRealTimers();
    (navigator as Record<string, unknown>).modelContext = originalModelContext;
    (navigator as Record<string, unknown>).modelContextTesting = originalModelContextTesting;
    document.querySelectorAll('[data-webmcp-relay]').forEach((el) => el.remove());
  });

  it('posts webmcp.tools.changed to widget when tools change via polling', async () => {
    const tools = [{ name: 'my-tool', description: 'A tool', inputSchema: '{}' }];
    const testing: MockModelContextTesting = {
      listTools: vi.fn(() => tools),
      executeTool: vi.fn(),
      addEventListener: vi.fn(),
    };

    (navigator as Record<string, unknown>).modelContext = undefined;
    (navigator as Record<string, unknown>).modelContextTesting = testing;

    const posted: unknown[] = [];
    const fakeWidgetWindow = {
      postMessage: vi.fn((msg: unknown) => posted.push(msg)),
    };

    await vi.isolateModules(async () => {
      Object.defineProperty(document, 'currentScript', {
        value: createMockScript({ 'data-relay-host': '127.0.0.1', 'data-relay-port': '9333' }),
        configurable: true,
      });

      // Mock iframe injection to capture widgetWindow
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag);
        if (tag === 'iframe') {
          Object.defineProperty(el, 'contentWindow', { value: fakeWidgetWindow });
        }
        return el;
      });

      await import('./embed.js');
    });

    // Advance past poll interval (2000ms) + setTimeout(0) debounce
    await vi.advanceTimersByTimeAsync(2100);

    const toolsChangedMsg = posted.find(
      (m) => (m as Record<string, unknown>).type === 'webmcp.tools.changed'
    );
    expect(toolsChangedMsg).toBeDefined();
    expect((toolsChangedMsg as Record<string, unknown>).tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'my-tool' })])
    );
  });
});
```

- [ ] **Step 2: Run the integration tests**

Run: `pnpm --filter webmcp-local-relay exec vp test run src/browser/embed.test.ts`
Expected: All tests PASS. If the `vi.isolateModules` approach has issues with the IIFE bundling (embed.ts has no exports and relies on side effects), adjust the mock strategy — the key behavior to verify is that `addEventListener` is called with `'toolchange'`.

- [ ] **Step 3: Commit**

```bash
git add packages/webmcp-local-relay/src/browser/embed.test.ts
git commit -m "test(webmcp-local-relay): rewrite embed tests as integration tests verifying reconciler wiring"
```

---

### Task 5: Final verification

**Files:** None (validation only)

- [ ] **Step 1: Run full build**

Run: `pnpm build`
Expected: Clean build, no errors.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Run linter**

Run: `vp check`
Expected: No lint or format errors. If there are formatting issues, run `vp check --fix` and commit.

- [ ] **Step 4: Run all unit tests**

Run: `pnpm test:unit`
Expected: All tests pass (287+ tests).

- [ ] **Step 5: Fix lint if needed and commit**

```bash
vp check --fix
git add -A
git commit -m "style(webmcp-local-relay): fix lint/format issues"
```

(Only if Step 3 reported issues.)

- [ ] **Step 6: Verify the overall diff addresses MiguelsPizza's feedback**

Check the changes satisfy:

1. Tests exercise the real shipped reconciler code (not reimplemented private logic)
2. Snapshot compares full descriptors (name + description + inputSchema at any depth)
3. Both event and poll paths call the same `scheduleReconcile()` — unified reconciliation

Run: `git diff main --stat` to confirm only the expected files changed.
