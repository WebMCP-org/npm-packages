/// <reference types="chrome" />

import { installServerRuntimeContract } from '../../../../e2e/runtime-contract/server-contract.js';
import { ExtensionServerTransport } from '../../../transports/src/index.ts';
import { McpServer } from '../../../webmcp-ts-sdk/src/index.ts';
import { NoOpJsonSchemaValidator } from '../../../webmcp-ts-sdk/src/no-op-validator.ts';
import { AlarmsApiTools } from '../../src/chrome-apis/AlarmsApiTools.ts';
import { CookiesApiTools } from '../../src/chrome-apis/CookiesApiTools.ts';
import { DownloadsApiTools } from '../../src/chrome-apis/DownloadsApiTools.ts';
import { PermissionsApiTools } from '../../src/chrome-apis/PermissionsApiTools.ts';
import { RuntimeApiTools } from '../../src/chrome-apis/RuntimeApiTools.ts';
import { ScriptingApiTools } from '../../src/chrome-apis/ScriptingApiTools.ts';
import { UserScriptsApiTools } from '../../src/chrome-apis/UserScriptsApiTools.ts';

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

let server: McpServer | null = null;
let runtimeContract: ReturnType<typeof installServerRuntimeContract> | null = null;
let startupError: string | null = null;
let startupStep = 'initializing';

try {
  server = new McpServer(
    {
      name: 'extension-runtime-contract',
      version: '1.0.0',
    },
    {
      jsonSchemaValidator: new NoOpJsonSchemaValidator(),
    }
  );
  recordDebugEvent('server:created');
  runtimeContract = installServerRuntimeContract(server, { runtimeLabel: 'extension' });
  recordDebugEvent('runtime-contract:installed');
  startupStep = 'scripting';
  new ScriptingApiTools(server).register();
  startupStep = 'userScripts';
  new UserScriptsApiTools(server, { execute: false }).register();
  startupStep = 'cookies';
  new CookiesApiTools(server).register();
  startupStep = 'downloads';
  new DownloadsApiTools(server, {
    acceptDanger: false,
    open: false,
    setUiOptions: false,
    show: false,
    showDefaultFolder: false,
  }).register();
  startupStep = 'alarms';
  new AlarmsApiTools(server).register();
  startupStep = 'runtime';
  new RuntimeApiTools(server, {
    connect: false,
    connectNative: false,
    openOptionsPage: false,
    reload: false,
    restart: false,
    restartAfterDelay: false,
    sendMessage: false,
    sendNativeMessage: false,
    setUninstallURL: false,
  }).register();
  startupStep = 'permissions';
  new PermissionsApiTools(server).register();
  startupStep = 'done';
  recordDebugEvent('chrome-api-contracts:installed');
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  startupError = `${startupStep}: ${message}`;
  recordDebugEvent(`startup:error:${startupError}`);
}

async function handleControlMessage(message: { action?: string; name?: string }) {
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
      return { ok: true, value: runtimeContract.registerDynamicTool() };
    case 'unregisterDynamicTool':
      return { ok: true, value: runtimeContract.unregisterDynamicTool(message.name) };
    case 'readInvocations':
      return { ok: true, value: runtimeContract.readInvocations() };
    case 'resetInvocations':
      runtimeContract.resetInvocations();
      return { ok: true, value: true };
    default:
      return { ok: false, error: `Unknown control action: ${String(message.action)}` };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'runtime-contract/control') {
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

  if (startupError || !server) {
    recordDebugEvent(`port:startup-error:${startupError ?? 'missing server'}`);
    port.disconnect();
    return;
  }

  recordDebugEvent('port:connected');
  port.onMessage.addListener((message) => {
    const method =
      message && typeof message === 'object' && 'method' in message
        ? String((message as { method?: unknown }).method)
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
  void server
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
