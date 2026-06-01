# Tool List Reconciler Design

## Background

PR #221 addressed Chrome native (148+) dropping `unregisterTool` — tools are now unregistered only via `AbortSignal`, and neither path fires a `toolchange` event. The maintainer (MiguelsPizza) requested changes:

1. **Tests must exercise shipped code** — the current tests reimplement private logic, so they can pass while `embed.ts` is broken.
2. **Full descriptor comparison** — the poll snapshot comparing only tool names misses same-name description/schema changes, leaving stale metadata in the relay.
3. **Unified reconciliation path** — both event subscriptions and polling should call a single `scheduleReconcile()` instead of having separate event-push and poll-dedupe behaviors.

## Solution Overview

Extract a **tool inventory reconciler** into its own module (`reconciler.ts`). All event surfaces and the polling timer funnel into a single `scheduleReconcile()` entry point. The reconciler reads the full tool list, compares a stable JSON snapshot of complete descriptors, and only notifies when something actually changed.

## Module Structure

```
packages/webmcp-local-relay/src/browser/
├── embed.ts               # Thin entry: config, DOM, event binding, iframe injection
├── reconciler.ts          # Core: tool inventory reconcile logic (NEW)
├── reconciler.test.ts     # Reconciler unit tests (NEW, replaces current embed.test.ts)
├── embed.test.ts          # Embed integration tests (REWRITTEN)
├── shared.ts              # Existing utilities (isJsonObject, etc.)
└── ...
```

## Reconciler Interface

```ts
export interface RelayToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface ReconcilerOptions {
  /** Returns current tool list — sync or async */
  listTools: () => RelayToolDescriptor[] | Promise<RelayToolDescriptor[]>;
  /** Called only when tool list actually changed */
  onChanged: (tools: RelayToolDescriptor[]) => void;
  /** Poll interval in ms (default: 2000) */
  pollInterval?: number;
}

export interface ToolReconciler {
  /** Trigger a reconcile (debounced to next macrotask) */
  scheduleReconcile(): void;
  /** Start the polling timer */
  startPolling(): void;
  /** Stop polling and clean up */
  dispose(): void;
}

export function createToolReconciler(options: ReconcilerOptions): ToolReconciler;
```

## Reconciler Internal Logic

### Snapshot Generation

```ts
function stableStringify(value: unknown): string {
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

function createSnapshot(tools: RelayToolDescriptor[]): string {
  const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
  return sorted.map(stableStringify).join('\n');
}
```

- Tools sorted by name (order-independent)
- Recursive key-sorting ensures deeply nested inputSchema objects produce stable JSON
- Detects changes to name, description, AND inputSchema at any depth

### Schedule & Execute

```ts
function createToolReconciler(options: ReconcilerOptions): ToolReconciler {
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
    pollTimer = setInterval(scheduleReconcile, options.pollInterval ?? 2000);
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

### Behavior Matrix

| Trigger                                 | Path                                             |
| --------------------------------------- | ------------------------------------------------ |
| toolchange event on modelContext        | `scheduleReconcile()`                            |
| toolchange event on modelContextTesting | `scheduleReconcile()`                            |
| registerToolsChangedCallback (legacy)   | `scheduleReconcile()`                            |
| Poll timer fires                        | `scheduleReconcile()`                            |
| Multiple triggers in same tick          | Debounced — only one `reconcile()` executes      |
| listTools throws                        | Silent skip, no snapshot update, no notification |

## embed.ts Integration

### Initialization

```ts
import { createToolReconciler } from './reconciler.js';

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
```

### Event Subscription

`trySubscribe()` remains structurally the same (non-exclusive subscription on all available surfaces), but the callback changes from the old `onToolsChanged` to `reconciler.scheduleReconcile()`:

- Path A: `modelContext.addEventListener('toolchange', () => reconciler.scheduleReconcile())`
- Path B: `modelContextTesting.addEventListener('toolchange', () => reconciler.scheduleReconcile())`
- Path B fallback: `registerToolsChangedCallback(() => reconciler.scheduleReconcile())`

### Startup Sequence

```ts
function subscribeToToolChanges(): void {
  initReconciler();

  if (!trySubscribe()) {
    // Retry with backoff (unchanged logic)...
    // On success or max retries: reconciler.startPolling()
  }

  // Always start polling as fallback (covers Chrome native gaps)
  reconciler!.startPolling();
  // Immediate initial reconcile so widget gets tools on connect
  reconciler!.scheduleReconcile();
}
```

### Removed from embed.ts

- `let pushScheduled`
- `let lastToolsSnapshot`
- `let pollTimer` / `POLL_INTERVAL_MS`
- `function onToolsChanged()`
- `function startToolListPolling()`

All replaced by reconciler internals.

## Testing Strategy

### Layer 1: `reconciler.test.ts` (Unit Tests)

Direct import of `createToolReconciler` — no DOM mocks needed.

| Test Case                                         | Validates                  |
| ------------------------------------------------- | -------------------------- |
| Tool list change triggers onChanged               | Basic functionality        |
| Unchanged list does NOT trigger onChanged         | Snapshot dedup             |
| Description-only change triggers onChanged        | Full descriptor comparison |
| inputSchema-only change triggers onChanged        | Full descriptor comparison |
| Tool order change does NOT trigger onChanged      | Sort stability             |
| Multiple scheduleReconcile → single reconcile     | Debounce                   |
| startPolling periodically calls scheduleReconcile | Poll activation            |
| dispose stops polling                             | Cleanup                    |
| Async listTools works                             | Promise support            |
| listTools throwing doesn't crash or notify        | Error resilience           |

### Layer 2: `embed.test.ts` (Integration Tests)

Uses `vi.isolateModules()` + minimal global mocks to verify wiring:

| Test Case                                             | Validates                               |
| ----------------------------------------------------- | --------------------------------------- |
| embed init creates reconciler and binds event sources | Event → scheduleReconcile wiring        |
| Tool change results in postMessage to widget          | onChanged → postMessage wiring          |
| Widget list.request responds correctly                | Request handling unaffected by refactor |

### Deleted

The existing `embed.test.ts` (272 lines of reimplemented private logic) is completely replaced.

## Migration Notes

- No public API changes — the relay widget protocol (`webmcp.tools.changed`, `webmcp.tools.list.request`, etc.) is unchanged
- `RelayToolDescriptor` interface is moved to `reconciler.ts` and re-exported (embed.ts imports it)
- Polling interval remains 2000ms by default
- The `ToolBridge` interface and `getToolBridge()` stay in embed.ts (they depend on navigator globals)
