// Tool list reconciler — single source of truth for detecting tool changes.
// All event surfaces and the poll timer funnel into scheduleReconcile().
// Compares full tool descriptors (name + description + inputSchema) via stable
// JSON serialization, so schema-only changes are detected.

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

// Deterministic JSON: recursively sorts object keys so property insertion order
// doesn't affect the output. Required because inputSchema objects from different
// sources may have identical content but different key ordering.
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
    // Outer try-catch: Promise.resolve(fn()) evaluates fn() synchronously,
    // so a synchronous throw from listTools() escapes the .catch() handler.
    try {
      Promise.resolve(options.listTools())
        .then((tools) => {
          const list = Array.isArray(tools) ? tools : [];
          const snapshot = createSnapshot(list);
          if (snapshot !== lastSnapshot) {
            lastSnapshot = snapshot;
            options.onChanged(list);
          }
        })
        .catch(() => {}); // listTools rejected asynchronously — skip this cycle
    } catch {
      // listTools threw synchronously — skip this cycle
    }
  }

  // Debounce: multiple event firings in the same tick collapse into one reconcile.
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
