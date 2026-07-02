import { runRuntimeCoreConformanceSuite } from '../../../conformance/runtime-core-conformance.shared.js';
import { cleanupWebMCPPolyfill, initializeWebMCPPolyfill } from '../src/index.js';

runRuntimeCoreConformanceSuite({
  suiteName: 'Runtime core conformance (@mcp-b/webmcp-polyfill)',
  install() {
    initializeWebMCPPolyfill({ installTestingShim: 'always' });
  },
  cleanup() {
    try {
      cleanupWebMCPPolyfill();
    } catch {
      // Best-effort cleanup only.
    }
  },
});
