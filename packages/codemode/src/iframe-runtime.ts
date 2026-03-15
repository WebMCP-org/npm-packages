import type {
  ExecuteRequestMessage,
  ToolCallMessage,
  ToolResultErrorMessage,
  ToolResultSuccessMessage,
} from './messages';
import type { UnknownRecord } from './type-utils';

/**
 * Options for the iframe-side codemode runtime.
 */
export type IframeSandboxRuntimeOptions = {
  /**
   * Expected parent origin for incoming messages and outgoing `postMessage`
   * calls. Defaults to `*`.
   */
  targetOrigin?: string;
};

type PendingToolRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

type RuntimeWindow = Window & typeof globalThis & { __mcpbIframeSandboxInitialized?: boolean };

function iframeSandboxRuntimeMain(config?: { targetOrigin?: string }): void {
  const runtimeWindow = window as RuntimeWindow;

  if (runtimeWindow.__mcpbIframeSandboxInitialized) {
    return;
  }

  runtimeWindow.__mcpbIframeSandboxInitialized = true;

  const targetOrigin =
    config && typeof config.targetOrigin === 'string' ? config.targetOrigin : '*';
  const logs: string[] = [];
  const pending: Record<number, PendingToolRequest> = {};
  let nextId = 0;

  function post(message: unknown) {
    parent.postMessage(message, targetOrigin);
  }

  console.log = (...args: unknown[]) => {
    const values = [];
    for (let i = 0; i < args.length; i++) values.push(String(args[i]));
    logs.push(values.join(' '));
  };
  console.warn = (...args: unknown[]) => {
    const values = [];
    for (let i = 0; i < args.length; i++) values.push(String(args[i]));
    logs.push('[warn] ' + values.join(' '));
  };
  console.error = (...args: unknown[]) => {
    const values = [];
    for (let i = 0; i < args.length; i++) values.push(String(args[i]));
    logs.push('[error] ' + values.join(' '));
  };

  const codemode = new Proxy(
    {},
    {
      get: (_, toolName) => {
        return (args: unknown) => {
          const id = nextId++;
          return new Promise((resolve, reject) => {
            pending[id] = { resolve: resolve, reject: reject };
            const message: ToolCallMessage = {
              type: 'tool-call',
              id: id,
              name: String(toolName),
              args: (args ?? {}) as UnknownRecord,
            };
            post(message);
          });
        };
      },
    }
  );

  function isToolResultMessage(
    message: unknown
  ): message is ToolResultSuccessMessage | ToolResultErrorMessage {
    if (typeof message !== 'object' || message === null) return false;
    const candidate = message as UnknownRecord;
    return candidate.type === 'tool-result' && typeof candidate.id === 'number';
  }

  function isExecuteRequestMessage(message: unknown): message is ExecuteRequestMessage {
    if (typeof message !== 'object' || message === null) return false;
    const candidate = message as UnknownRecord;
    return candidate.type === 'execute-request' && typeof candidate.code === 'string';
  }

  function executeCode(code: string) {
    try {
      const fn = new Function('codemode', 'return (' + code + ')')(codemode);
      Promise.resolve(fn())
        .then((result) => {
          post({ type: 'execution-result', result: { result: result, logs: logs } });
        })
        .catch((err) => {
          post({
            type: 'execution-result',
            result: { result: undefined, error: err.message || String(err), logs: logs },
          });
        });
    } catch (err) {
      post({
        type: 'execution-result',
        result: {
          result: undefined,
          error: err instanceof Error ? err.message : String(err),
          logs: logs,
        },
      });
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== parent) return;
    if (targetOrigin !== '*' && event.origin !== targetOrigin) return;

    const message = event.data;

    if (isToolResultMessage(message)) {
      const request = pending[message.id];
      if (!request) return;

      delete pending[message.id];
      if ('error' in message) request.reject(new Error(message.error));
      else request.resolve(message.result);
      return;
    }

    if (isExecuteRequestMessage(message)) {
      executeCode(message.code);
    }
  });

  post({ type: 'sandbox-ready' });
}

/**
 * Boots the codemode runtime inside a caller-hosted iframe page.
 *
 * Use this when `IframeSandboxExecutor` is configured with `iframeFactory`.
 */
export function initializeIframeSandboxRuntime(options?: IframeSandboxRuntimeOptions): void {
  iframeSandboxRuntimeMain({ targetOrigin: options?.targetOrigin ?? '*' });
}

/**
 * Returns a self-contained script string that boots the codemode iframe runtime.
 *
 * This is used internally for provisioned iframes via `srcdoc`.
 */
export function createIframeSandboxRuntimeScript(options?: IframeSandboxRuntimeOptions): string {
  return `;(${iframeSandboxRuntimeMain.toString()})(${JSON.stringify({
    targetOrigin: options?.targetOrigin ?? '*',
  })});`;
}
