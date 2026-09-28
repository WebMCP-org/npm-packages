import { runDeclarativeFormConformanceSuite } from '../../../conformance/declarative-forms-conformance.shared.js';
import { installWebMCP } from './index.js';

runDeclarativeFormConformanceSuite({
  suiteName: 'Standalone polyfill declarative forms',
  install: installWebMCP,
});
