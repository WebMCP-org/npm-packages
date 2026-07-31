/// <reference types="chrome" />

import { ExtensionServerTransport } from '@mcp-b/transports';
import { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';

import {
  createRuntimeContractController,
  createRuntimeContractState,
  createRuntimeContractTools,
  DYNAMIC_TOOL_NAME,
  type RuntimeContractController,
  type RuntimeContractTool,
  type RuntimeContractTools,
} from '../../../../e2e/runtime-contract/core.js';

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

let runtimeContract: RuntimeContractController | null = null;
let runtimeTools: RuntimeContractTools | null = null;
let startupError: string | null = null;
let dynamicToolEnabled = false;
let runtimeMutationQueue: Promise<void> = Promise.resolve();

interface RuntimeSession {
  registrations: Map<string, AbortController>;
  server: BrowserMcpServer;
}

const sessions = new Set<RuntimeSession>();

function enqueueRuntimeMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = runtimeMutationQueue.then(operation, operation);
  runtimeMutationQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function registerSessionTool(
  session: RuntimeSession,
  tool: RuntimeContractTool
): Promise<void> {
  const controller = new AbortController();
  session.registrations.set(tool.name, controller);
  try {
    await session.server.registerTool(tool, { signal: controller.signal });
  } catch (error) {
    session.registrations.delete(tool.name);
    controller.abort();
    throw error;
  }
}

async function initializeRuntime(): Promise<void> {
  try {
    const state = createRuntimeContractState();
    runtimeTools = createRuntimeContractTools(state, {
      runtimeLabel: 'extension',
    });
    runtimeContract = createRuntimeContractController(
      state,
      () =>
        enqueueRuntimeMutation(async () => {
          const tools = runtimeTools;
          if (!tools || dynamicToolEnabled) return false;

          const registeredSessions: RuntimeSession[] = [];
          try {
            for (const session of sessions) {
              await registerSessionTool(session, tools.createDynamicTool());
              registeredSessions.push(session);
            }
          } catch (error) {
            for (const session of registeredSessions) {
              session.registrations.get(DYNAMIC_TOOL_NAME)?.abort();
              session.registrations.delete(DYNAMIC_TOOL_NAME);
            }
            throw error;
          }

          dynamicToolEnabled = true;
          return true;
        }),
      (name = DYNAMIC_TOOL_NAME) =>
        enqueueRuntimeMutation(async () => {
          if (name !== DYNAMIC_TOOL_NAME || !dynamicToolEnabled) return false;
          dynamicToolEnabled = false;
          for (const session of sessions) {
            session.registrations.get(DYNAMIC_TOOL_NAME)?.abort();
            session.registrations.delete(DYNAMIC_TOOL_NAME);
          }
          return true;
        })
    );
    state.ready = true;
    recordDebugEvent('runtime-contract:installed');
  } catch (error) {
    startupError = error instanceof Error ? error.message : String(error);
    recordDebugEvent(`startup:error:${startupError}`);
  }
}

const startup = initializeRuntime();

function connectRuntimeSession(port: chrome.runtime.Port): Promise<void> {
  if (startupError) {
    return Promise.reject(new Error(`Extension runtime startup failed: ${startupError}`));
  }
  const tools = runtimeTools;
  if (!tools) {
    return Promise.reject(new Error('Extension runtime tools are not available'));
  }

  const server = new BrowserMcpServer({
    name: 'extension-runtime-contract',
    version: '1.0.0',
  });
  const session: RuntimeSession = {
    registrations: new Map(),
    server,
  };
  recordDebugEvent('server:created');

  try {
    // Start every registration before connecting. BrowserMcpServer installs each
    // handler synchronously, while its returned promise finishes notification work.
    const registrations = tools.baseTools.map((tool) => registerSessionTool(session, tool));
    if (dynamicToolEnabled) {
      registrations.push(registerSessionTool(session, tools.createDynamicTool()));
    }

    const transport = new ExtensionServerTransport(port, {
      keepAliveInterval: 500,
    });
    transport.onerror = (error) => {
      recordDebugEvent(`transport:error:${error.message}`);
    };
    transport.onclose = () => {
      recordDebugEvent('transport:closed');
      sessions.delete(session);
      queueMicrotask(() => {
        void server.close().catch((error) => {
          recordDebugEvent(
            `server:close:error:${error instanceof Error ? error.message : String(error)}`
          );
        });
      });
    };

    sessions.add(session);
    recordDebugEvent('server:connect:start');
    const connection = server.connect(transport);
    return Promise.all([...registrations, connection])
      .then(() => {
        recordDebugEvent('server:connect:ready');
      })
      .catch(async (error) => {
        sessions.delete(session);
        await server.close().catch(() => undefined);
        throw error;
      });
  } catch (error) {
    sessions.delete(session);
    return server
      .close()
      .catch(() => undefined)
      .then(() => {
        throw error;
      });
  }
}

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

  void connectRuntimeSession(port)
    .then(() => {
      recordDebugEvent('port:connected');
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      recordDebugEvent(`server:connect:error:${message}`);
      console.error('[extension-runtime-contract] Failed to connect transport', error);
      port.disconnect();
    });

  recordDebugEvent('port:accepted');
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
});
