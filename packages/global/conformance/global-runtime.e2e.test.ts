import { runRuntimeCoreConformanceSuite } from '../../../conformance/runtime-core-conformance.shared.js';
import { runDeclarativeFormConformanceSuite } from '../../../conformance/declarative-forms-conformance.shared.js';
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

runRuntimeCoreConformanceSuite({
  suiteName: 'Runtime core conformance (@mcp-b/global)',
  install() {
    initializeWebModelContext(TEST_INIT_OPTIONS);
  },
  cleanup() {
    cleanupWebModelContext();
  },
});

runDeclarativeFormConformanceSuite({
  suiteName: 'Declarative form conformance (@mcp-b/global)',
  install() {
    initializeWebModelContext(TEST_INIT_OPTIONS);
  },
  cleanup() {
    cleanupWebModelContext();
  },
});
