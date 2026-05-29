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
        .catch(() => {});
    } catch {
      // listTools threw synchronously — swallow to avoid crashing the reconcile loop
    }
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
