/// <reference types="chrome" />

import { ExtensionServerTransport } from '@mcp-b/transports';
import { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';

import {
  createRuntimeContractController,
  createRuntimeContractState,
  createRuntimeContractTools,
  DYNAMIC_TOOL_NAME,
  type RuntimeContractTool,
} from '../../../../e2e/runtime-contract/core.js';

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

const state = createRuntimeContractState();
const runtimeTools = createRuntimeContractTools(state, {
  runtimeLabel: 'extension',
});
const runtimeContract = createRuntimeContractController(
  state,
  () =>
    enqueueRuntimeMutation(async () => {
      if (dynamicToolEnabled) return false;

      const registeredSessions: RuntimeSession[] = [];
      try {
        for (const session of sessions) {
          await registerSessionTool(session, runtimeTools.createDynamicTool());
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

async function connectRuntimeSession(port: chrome.runtime.Port): Promise<void> {
  const server = new BrowserMcpServer({
    name: 'extension-runtime-contract',
    version: '1.0.0',
  });
  const session: RuntimeSession = {
    registrations: new Map(),
    server,
  };

  try {
    const registrations = runtimeTools.baseTools.map((tool) => registerSessionTool(session, tool));
    if (dynamicToolEnabled) {
      registrations.push(registerSessionTool(session, runtimeTools.createDynamicTool()));
    }

    const transport = new ExtensionServerTransport(port, {
      keepAliveInterval: 500,
    });
    transport.onclose = () => {
      sessions.delete(session);
      queueMicrotask(() => {
        void server.close().catch((error) => {
          console.error('[extension-runtime-contract] Failed to close server', error);
        });
      });
    };

    sessions.add(session);
    await Promise.all([...registrations, server.connect(transport)]);
  } catch (error) {
    sessions.delete(session);
    await server.close().catch(() => undefined);
    throw error;
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
  if (port.name !== 'mcp') return;

  void connectRuntimeSession(port).catch((error) => {
    console.error('[extension-runtime-contract] Failed to connect transport', error);
    port.disconnect();
  });
});
