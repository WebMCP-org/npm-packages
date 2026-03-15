import { isExecutionResultMessage, isToolCallMessage } from './messages';
import type { ExecuteResult, Executor, ToolFunctions } from './types';

export interface IframeSandboxExecutorOptions {
  timeout?: number;
}

function buildSrcdoc(code: string): string {
  const safeCode = JSON.stringify(code);

  return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval';">
</head>
<body>
<script>
(function() {
  var __logs = [];
  console.log = function() { var a = []; for (var i = 0; i < arguments.length; i++) a.push(String(arguments[i])); __logs.push(a.join(" ")); };
  console.warn = function() { var a = []; for (var i = 0; i < arguments.length; i++) a.push(String(arguments[i])); __logs.push("[warn] " + a.join(" ")); };
  console.error = function() { var a = []; for (var i = 0; i < arguments.length; i++) a.push(String(arguments[i])); __logs.push("[error] " + a.join(" ")); };

  var __pending = {};
  var __nextId = 0;

  var codemode = new Proxy({}, {
    get: function(_, toolName) {
      return function(args) {
        var id = __nextId++;
        return new Promise(function(resolve, reject) {
          __pending[id] = { resolve: resolve, reject: reject };
          parent.postMessage({ type: "tool-call", id: id, name: String(toolName), args: args || {} }, "*");
        });
      };
    }
  });

  window.addEventListener("message", function(event) {
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

  (function() {
    try {
      var fn = new Function("codemode", "return (" + ${safeCode} + ")")(codemode);
      Promise.resolve(fn()).then(function(result) {
        parent.postMessage({ type: "execution-result", result: { result: result, logs: __logs } }, "*");
      }).catch(function(err) {
        parent.postMessage({ type: "execution-result", result: { result: undefined, error: err.message || String(err), logs: __logs } }, "*");
      });
    } catch (err) {
      parent.postMessage({ type: "execution-result", result: { result: undefined, error: err.message || String(err), logs: __logs } }, "*");
    }
  })();
})();
</script>
</body>
</html>`;
}

export class IframeSandboxExecutor implements Executor {
  #timeout: number;

  constructor(options?: IframeSandboxExecutorOptions) {
    this.#timeout = options?.timeout ?? 30000;
  }

  async execute(code: string, fns: ToolFunctions): Promise<ExecuteResult> {
    return new Promise<ExecuteResult>((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.sandbox.add('allow-scripts');
      iframe.style.display = 'none';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';

      let settled = false;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        iframe.remove();
      };

      const handler = async (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow) return;

        const data: unknown = event.data;

        if (isToolCallMessage(data)) {
          const fn = fns[data.name];
          if (!fn) {
            iframe.contentWindow?.postMessage(
              { type: 'tool-result', id: data.id, error: `Tool "${data.name}" not found` },
              '*'
            );
            return;
          }
          try {
            const result = await fn(data.args);
            iframe.contentWindow?.postMessage({ type: 'tool-result', id: data.id, result }, '*');
          } catch (err) {
            iframe.contentWindow?.postMessage(
              {
                type: 'tool-result',
                id: data.id,
                error: err instanceof Error ? err.message : String(err),
              },
              '*'
            );
          }
          return;
        }

        if (isExecutionResultMessage(data)) {
          cleanup();
          resolve(data.result);
        }
      };

      window.addEventListener('message', handler);

      const timer = setTimeout(() => {
        cleanup();
        resolve({ result: undefined, error: 'Execution timed out', logs: [] });
      }, this.#timeout);

      iframe.srcdoc = buildSrcdoc(code);
      document.body.appendChild(iframe);
    });
  }
}
