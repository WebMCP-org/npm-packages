import { runRuntimeCoreConformanceSuite } from '../../../conformance/runtime-core-conformance.shared.js';
import { cleanupWebModelContext, initializeWebModelContext } from '../src/global.js';
import type { WebModelContextInitOptions } from '../src/types.js';

const TEST_INIT_OPTIONS: WebModelContextInitOptions = {
  transport: {
    tabServer: {
      allowedOrigins: [window.location.origin],
    },
    iframeServer: false,
  },
};

function resetGlobals(): void {
  delete (window as unknown as { __webModelContext?: unknown }).__webModelContext;
}

function installNotificationGuards(): void {
  const ctx = (
    window as unknown as {
      __webModelContext?: {
        tabServer?: { notification?: (...args: unknown[]) => Promise<unknown> };
        iframeServer?: { notification?: (...args: unknown[]) => Promise<unknown> };
      };
    }
  ).__webModelContext;

  if (!ctx) {
    return;
  }

  const wrap = (server?: { notification?: (...args: unknown[]) => Promise<unknown> }) => {
    if (!server?.notification) {
      return;
    }
    const original = server.notification.bind(server);
    server.notification = async (...args: unknown[]) => {
      try {
        return await original(...args);
      } catch {
        return;
      }
    };
  };

  wrap(ctx.tabServer);
  wrap(ctx.iframeServer);
}

runRuntimeCoreConformanceSuite({
  suiteName: 'Runtime core conformance (@mcp-b/global)',
  install() {
    resetGlobals();
    initializeWebModelContext(TEST_INIT_OPTIONS);
    installNotificationGuards();
  },
  cleanup() {
    try {
      cleanupWebModelContext();
    } catch {
      // Best-effort cleanup only.
    }
    resetGlobals();
  },
});
