import { runRuntimeCoreConformanceSuite } from './runtime-core-conformance.shared.js';

runRuntimeCoreConformanceSuite({
  suiteName: 'Runtime core conformance (native)',
  expectedBridgeMode: 'native',
  expectNativeApiBeforeInit: true,
});
