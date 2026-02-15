import { runRuntimeCoreConformanceSuite } from './runtime-core-conformance.shared.js';

runRuntimeCoreConformanceSuite({
  suiteName: 'Runtime core conformance (polyfill)',
  expectedBridgeMode: 'polyfill-installed',
  expectNativeApiBeforeInit: false,
});
