/// <reference types="chrome" />

import { ExtensionServerTransport } from '@mcp-b/transports';
import { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';

import type { RuntimeContractController } from '../../../../e2e/runtime-contract/core.js';
import { installModelContextRuntimeContract } from '../../../../e2e/runtime-contract/model-context-contract.js';

const debugState = {
  events: [] as string[],
};

function recordDebugEvent(event: string) {
  debugState.events.push(event);
  if (debugState.events.length > 100) {
    debugState.events.shift();
  }
}

recordDebugEvent('background:loaded');

let server: BrowserMcpServer | null = null;
let runtimeContract: RuntimeContractController | null = null;
let startupError: string | null = null;

async function initializeRuntime(): Promise<void> {
  try {
    server = new BrowserMcpServer({
      name: 'extension-runtime-contract',
      version: '1.0.0',
    });
    recordDebugEvent('server:created');
    runtimeContract = await installModelContextRuntimeContract(server, {
      runtimeLabel: 'extension',
    });
    recordDebugEvent('runtime-contract:installed');
  } catch (error) {
    startupError = error instanceof Error ? error.message : String(error);
    recordDebugEvent(`startup:error:${startupError}`);
  }
}

const startup = initializeRuntime();

interface ControlMessage {
  action: string;
  name?: string;
  type: 'runtime-contract/control';
}

function isControlMessage(message: unknown): message is ControlMessage {
  if (typeof message !== 'object' || message === null) return false;
  const type = Reflect.get(message, 'type');
  const action = Reflect.get(message, 'action');
  const name = Reflect.get(message, 'name');
  return (
    type === 'runtime-contract/control' &&
    typeof action === 'string' &&
    (name === undefined || typeof name === 'string')
  );
}

async function handleControlMessage(message: ControlMessage) {
  await startup;

  if (startupError) {
    return { ok: false, error: `Extension runtime startup failed: ${startupError}` };
  }

  if (!runtimeContract) {
    return { ok: false, error: 'Extension runtime contract is not available' };
  }

  switch (message.action) {
    case 'isReady':
      return { ok: true, value: runtimeContract.isReady() };
    case 'registerDynamicTool':
      return { ok: true, value: await runtimeContract.registerDynamicTool() };
    case 'unregisterDynamicTool':
      return { ok: true, value: await runtimeContract.unregisterDynamicTool(message.name) };
    case 'readInvocations':
      return { ok: true, value: await runtimeContract.readInvocations() };
    case 'resetInvocations':
      await runtimeContract.resetInvocations();
      return { ok: true, value: true };
    default:
      return { ok: false, error: `Unknown control action: ${String(message.action)}` };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isControlMessage(message)) {
    return false;
  }

  recordDebugEvent(`control:${String(message.action)}`);

  void handleControlMessage(message)
    .then((response) => {
      sendResponse(response);
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });

  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'mcp') {
    recordDebugEvent(`port:ignored:${port.name}`);
    return;
  }

  void startup.then(() => {
    const currentServer = server;
    if (startupError || !currentServer) {
      recordDebugEvent(`port:startup-error:${startupError ?? 'missing server'}`);
      port.disconnect();
      return;
    }

    recordDebugEvent('port:connected');
    port.onMessage.addListener((message) => {
      const method =
        message && typeof message === 'object' && 'method' in message
          ? String(Reflect.get(message, 'method'))
          : undefined;
      recordDebugEvent(`port:message:${method ?? 'unknown'}`);
    });
    port.onDisconnect.addListener(() => {
      recordDebugEvent('port:disconnected');
    });
    const transport = new ExtensionServerTransport(port, {
      keepAliveInterval: 500,
    });
    transport.onerror = (error) => {
      recordDebugEvent(`transport:error:${error.message}`);
    };
    transport.onclose = () => {
      recordDebugEvent('transport:closed');
    };

    recordDebugEvent('server:connect:start');
    void currentServer
      .connect(transport)
      .then(() => {
        recordDebugEvent('server:connect:ready');
      })
      .catch((error) => {
        recordDebugEvent(
          `server:connect:error:${error instanceof Error ? error.message : String(error)}`
        );
        console.error('[extension-runtime-contract] Failed to connect transport', error);
      });
  });
});
