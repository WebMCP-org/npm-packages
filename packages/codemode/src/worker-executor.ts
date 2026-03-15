import { isExecutionResultMessage, isToolCallMessage } from './messages';
import type { ExecuteResult, Executor, ToolFunctions } from './types';

export interface WorkerSandboxExecutorOptions {
  timeout?: number;
}

function buildWorkerCode(code: string): string {
  const safeCode = JSON.stringify(code);

  return `
// Scrub dangerous globals before user code runs
(function() {
  var _self = self;

  // Scrub network APIs by redefining as undefined on the global
  var _blocked = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Request', 'Response', 'Headers', 'caches', 'indexedDB'];
  for (var i = 0; i < _blocked.length; i++) {
    try {
      Object.defineProperty(_self, _blocked[i], { value: undefined, writable: false, configurable: false });
    } catch (e) {
      try { _self[_blocked[i]] = undefined; } catch (e2) {}
    }
  }

  // Block importScripts
  try {
    Object.defineProperty(_self, 'importScripts', {
      value: function() { throw new Error('importScripts is not allowed in sandbox'); },
      writable: false,
      configurable: false
    });
  } catch (e) {
    _self.importScripts = function() { throw new Error('importScripts is not allowed in sandbox'); };
  }

  // Console capture
  var __logs = [];
  _self.console = {
    log: function() { var a = []; for (var i = 0; i < arguments.length; i++) a.push(String(arguments[i])); __logs.push(a.join(" ")); },
    warn: function() { var a = []; for (var i = 0; i < arguments.length; i++) a.push(String(arguments[i])); __logs.push("[warn] " + a.join(" ")); },
    error: function() { var a = []; for (var i = 0; i < arguments.length; i++) a.push(String(arguments[i])); __logs.push("[error] " + a.join(" ")); },
    info: function() { var a = []; for (var i = 0; i < arguments.length; i++) a.push(String(arguments[i])); __logs.push(a.join(" ")); },
    debug: function() {},
    trace: function() {},
    dir: function() {},
    table: function() {}
  };

  // Pending tool calls
  var __pending = {};
  var __nextId = 0;

  var codemode = new Proxy({}, {
    get: function(_, toolName) {
      return function(args) {
        var id = __nextId++;
        return new Promise(function(resolve, reject) {
          __pending[id] = { resolve: resolve, reject: reject };
          _self.postMessage({ type: "tool-call", id: id, name: String(toolName), args: args || {} });
        });
      };
    }
  });

  // Listen for tool results from host
  _self.addEventListener("message", function(event) {
    var msg = event.data;
    if (msg && msg.type === "tool-result") {
      var p = __pending[msg.id];
      if (p) {
        delete __pending[msg.id];
        if (msg.error) p.reject(new Error(msg.error));
        else p.resolve(msg.result);
      }
    }
  });

  // Execute user code
  try {
    var fn = new Function("codemode", "return (" + ${safeCode} + ")")(codemode);
    Promise.resolve(fn()).then(function(result) {
      _self.postMessage({ type: "execution-result", result: { result: result, logs: __logs } });
    }).catch(function(err) {
      _self.postMessage({ type: "execution-result", result: { result: undefined, error: err.message || String(err), logs: __logs } });
    });
  } catch (err) {
    _self.postMessage({ type: "execution-result", result: { result: undefined, error: err.message || String(err), logs: __logs } });
  }
})();
`;
}

export class WorkerSandboxExecutor implements Executor {
  #timeout: number;

  constructor(options?: WorkerSandboxExecutorOptions) {
    this.#timeout = options?.timeout ?? 30000;
  }

  async execute(code: string, fns: ToolFunctions): Promise<ExecuteResult> {
    return new Promise<ExecuteResult>((resolve) => {
      const workerCode = buildWorkerCode(code);
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);

      let settled = false;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(url);
      };

      worker.onmessage = async (event: MessageEvent) => {
        const data: unknown = event.data;

        if (isToolCallMessage(data)) {
          const fn = fns[data.name];
          if (!fn) {
            worker.postMessage({
              type: 'tool-result',
              id: data.id,
              error: `Tool "${data.name}" not found`,
            });
            return;
          }
          try {
            const result = await fn(data.args);
            worker.postMessage({ type: 'tool-result', id: data.id, result });
          } catch (err) {
            worker.postMessage({
              type: 'tool-result',
              id: data.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return;
        }

        if (isExecutionResultMessage(data)) {
          cleanup();
          resolve(data.result);
        }
      };

      worker.onerror = (event) => {
        cleanup();
        resolve({ result: undefined, error: event.message || 'Worker error', logs: [] });
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve({ result: undefined, error: 'Execution timed out', logs: [] });
      }, this.#timeout);
    });
  }
}
