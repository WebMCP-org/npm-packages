type JsonObject = Record<string, unknown>;
const DEFAULT_POLL_INTERVAL_MS = 2000;

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
  return [...tools]
    .map(stableStringify)
    .sort((a, b) => a.localeCompare(b))
    .join('\n');
}

export function createToolReconciler(options: ReconcilerOptions): ToolReconciler {
  let lastSnapshot = '';
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let scheduledTimer: ReturnType<typeof setTimeout> | null = null;

  function reconcile(): void {
    scheduledTimer = null;
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
        .catch(() => {}); // listTools rejected asynchronously; skip this cycle
    } catch {
      // listTools threw synchronously; skip this cycle
    }
  }

  function scheduleReconcile(): void {
    if (scheduledTimer) return;
    scheduledTimer = setTimeout(reconcile, 0);
  }

  function startPolling(): void {
    if (pollTimer) return;
    pollTimer = setInterval(scheduleReconcile, options.pollInterval ?? DEFAULT_POLL_INTERVAL_MS);
  }

  function dispose(): void {
    if (scheduledTimer) {
      clearTimeout(scheduledTimer);
      scheduledTimer = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  return { scheduleReconcile, startPolling, dispose };
}
