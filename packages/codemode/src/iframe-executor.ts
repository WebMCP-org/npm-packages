import {
  type ExecuteRequestMessage,
  isExecutionResultMessage,
  isSandboxReadyMessage,
  isToolCallMessage,
  type ToolResultErrorMessage,
  type ToolResultSuccessMessage,
} from './messages';
import type { ExecuteResult, Executor, ToolFunctions } from './types';
import { createIframeSandboxRuntimeScript } from './iframe-runtime';

/**
 * Uses the built-in hidden iframe sandbox.
 *
 * The executor creates the iframe, applies its default sandbox flags, injects
 * the runtime via `srcdoc`, and removes the iframe after execution completes.
 */
export interface ProvisionedIframeSandboxExecutorOptions {
  /** Maximum execution time in milliseconds. Defaults to `30000`. */
  timeout?: number;
  /**
   * Content Security Policy applied to the provisioned iframe document.
   *
   * When omitted, the executor uses its default restrictive CSP.
   */
  csp?: string;
  iframeFactory?: undefined;
  targetOrigin?: undefined;
}

/**
 * Uses a caller-provided iframe instead of the built-in provisioned iframe.
 *
 * The caller owns the iframe document, its sandboxing settings, and loading the
 * hosted codemode iframe runtime inside it.
 */
export interface ProvidedIframeSandboxExecutorOptions {
  /** Maximum execution time in milliseconds. Defaults to `30000`. */
  timeout?: number;
  /**
   * Creates the iframe the executor should use for this run.
   *
   * The returned iframe must be detached. The executor appends it, uses it for
   * one execution, then removes it during cleanup.
   */
  iframeFactory: () => HTMLIFrameElement;
  /**
   * `postMessage` target origin for host-to-iframe messages.
   *
   * This is required for caller-provided iframes because target origin is part
   * of the messaging contract, not an iframe DOM setting.
   */
  targetOrigin: string;
  csp?: never;
}

/**
 * Options for `IframeSandboxExecutor`.
 *
 * Omit `iframeFactory` to let codemode provision its own iframe. Provide
 * `iframeFactory` and `targetOrigin` to supply your own iframe instead.
 */
export type IframeSandboxExecutorOptions =
  | ProvisionedIframeSandboxExecutorOptions
  | ProvidedIframeSandboxExecutorOptions;

const DEFAULT_IFRAME_CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval';";
const DEFAULT_TIMEOUT = 30000;

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeInlineScript(value: string): string {
  return value.replace(/<\/script/gi, '<\\/script');
}

function buildProvisionedSrcdoc(csp: string): string {
  const runtimeScript = escapeInlineScript(
    createIframeSandboxRuntimeScript({
      targetOrigin: '*',
    })
  );
  const safeCsp = escapeHtmlAttribute(csp);

  return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="${safeCsp}">
</head>
<body>
<script>
${runtimeScript}
</script>
</body>
</html>`;
}

function applyHiddenIframePresentation(iframe: HTMLIFrameElement): void {
  iframe.style.display = 'none';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
}

function createToolResultMessage(
  id: number,
  value: unknown,
  isError: boolean
): ToolResultSuccessMessage | ToolResultErrorMessage {
  if (isError) {
    return {
      type: 'tool-result',
      id,
      error: value instanceof Error ? value.message : String(value),
    };
  }
  return { type: 'tool-result', id, result: value };
}

export class IframeSandboxExecutor implements Executor {
  #options: IframeSandboxExecutorOptions | undefined;

  /**
   * Creates a browser iframe-backed sandbox executor.
   *
   * By default, codemode provisions a hidden iframe for each execution. Pass
   * `iframeFactory` to run against your own iframe instead.
   */
  constructor(options?: IframeSandboxExecutorOptions) {
    this.#options = options;
  }

  async execute(code: string, fns: ToolFunctions): Promise<ExecuteResult> {
    if (this.#options?.iframeFactory) {
      return this.#executeWithProvidedIframe(code, fns, this.#options);
    }

    return this.#executeWithProvisionedIframe(code, fns, this.#options);
  }

  #executeWithProvisionedIframe(
    code: string,
    fns: ToolFunctions,
    options?: ProvisionedIframeSandboxExecutorOptions
  ): Promise<ExecuteResult> {
    const iframe = document.createElement('iframe');
    iframe.sandbox.add('allow-scripts');
    applyHiddenIframePresentation(iframe);
    iframe.srcdoc = buildProvisionedSrcdoc(options?.csp ?? DEFAULT_IFRAME_CSP);

    return this.#executeWithIframe({
      code,
      fns,
      iframe,
      targetOrigin: '*',
      timeout: options?.timeout ?? DEFAULT_TIMEOUT,
    });
  }

  #executeWithProvidedIframe(
    code: string,
    fns: ToolFunctions,
    options: ProvidedIframeSandboxExecutorOptions
  ): Promise<ExecuteResult> {
    let iframe: HTMLIFrameElement;

    try {
      iframe = options.iframeFactory();
    } catch (err) {
      return Promise.resolve({
        result: undefined,
        error: err instanceof Error ? err.message : String(err),
        logs: [],
      });
    }

    if (!(iframe instanceof HTMLIFrameElement)) {
      return Promise.resolve({
        result: undefined,
        error: 'iframeFactory must return an HTMLIFrameElement',
        logs: [],
      });
    }

    if (iframe.isConnected) {
      return Promise.resolve({
        result: undefined,
        error: 'iframeFactory must return a detached iframe element',
        logs: [],
      });
    }

    applyHiddenIframePresentation(iframe);

    return this.#executeWithIframe({
      code,
      fns,
      iframe,
      targetOrigin: options.targetOrigin,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
    });
  }

  #executeWithIframe({
    code,
    fns,
    iframe,
    targetOrigin,
    timeout,
  }: {
    code: string;
    fns: ToolFunctions;
    iframe: HTMLIFrameElement;
    targetOrigin: string;
    timeout: number;
  }): Promise<ExecuteResult> {
    return new Promise<ExecuteResult>((resolve) => {
      let settled = false;
      let ready = false;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        iframe.removeEventListener('error', handleLoadError);
        iframe.remove();
      };

      const resolveError = (message: string) => {
        cleanup();
        resolve({ result: undefined, error: message, logs: [] });
      };

      const postToChild = (
        message: ToolResultSuccessMessage | ToolResultErrorMessage | ExecuteRequestMessage
      ): boolean => {
        const child = iframe.contentWindow;
        if (!child) {
          resolveError('Sandbox iframe is not available');
          return false;
        }

        try {
          child.postMessage(message, targetOrigin);
          return true;
        } catch (err) {
          resolveError(err instanceof Error ? err.message : String(err));
          return false;
        }
      };

      const handler = async (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow) return;

        const data: unknown = event.data;

        if (isSandboxReadyMessage(data)) {
          if (ready) return;
          ready = true;
          postToChild({ type: 'execute-request', code });
          return;
        }

        if (isToolCallMessage(data)) {
          const fn = fns[data.name];
          if (!fn) {
            postToChild(createToolResultMessage(data.id, `Tool "${data.name}" not found`, true));
            return;
          }
          try {
            const result = await fn(data.args);
            postToChild(createToolResultMessage(data.id, result, false));
          } catch (err) {
            postToChild(createToolResultMessage(data.id, err, true));
          }
          return;
        }

        if (isExecutionResultMessage(data)) {
          cleanup();
          resolve(data.result);
        }
      };

      const handleLoadError = () => {
        resolveError('Sandbox iframe failed to load');
      };

      window.addEventListener('message', handler);
      iframe.addEventListener('error', handleLoadError);

      const timer = setTimeout(() => {
        cleanup();
        resolve({ result: undefined, error: 'Execution timed out', logs: [] });
      }, timeout);

      document.body.appendChild(iframe);
    });
  }
}
