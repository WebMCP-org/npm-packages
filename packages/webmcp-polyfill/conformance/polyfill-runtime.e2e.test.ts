import { runRuntimeCoreConformanceSuite } from '../../../conformance/runtime-core-conformance.shared.js';
import { runDeclarativeFormConformanceSuite } from '../../../conformance/declarative-forms-conformance.shared.js';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanupWebMCPPolyfill, initializeWebMCPPolyfill } from '../src/index.js';

beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));
afterEach(() => vi.restoreAllMocks());

runRuntimeCoreConformanceSuite({
  suiteName: 'Runtime core conformance (@mcp-b/webmcp-polyfill)',
  install() {
    initializeWebMCPPolyfill({ installTestingShim: true });
    const modelContext = document.modelContext;
    if (!modelContext || Reflect.get(modelContext, '__isWebMCPPolyfill') !== true) {
      throw new Error('Expected @mcp-b/webmcp-polyfill to install document.modelContext');
    }
  },
  cleanup() {
    cleanupWebMCPPolyfill();
  },
});

runDeclarativeFormConformanceSuite({
  suiteName: 'Declarative form conformance (@mcp-b/webmcp-polyfill)',
  install() {
    initializeWebMCPPolyfill({ installTestingShim: true });
  },
  cleanup() {
    cleanupWebMCPPolyfill();
  },
});
