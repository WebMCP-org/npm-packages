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

runRuntimeCoreConformanceSuite({
  suiteName: 'Runtime core conformance (@mcp-b/global)',
  install() {
    resetGlobals();
    initializeWebModelContext(TEST_INIT_OPTIONS);
  },
  cleanup() {
    try {
      cleanupWebModelContext();
    } finally {
      resetGlobals();
    }
  },
});
