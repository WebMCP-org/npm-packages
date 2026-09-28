import { runDeclarativeFormConformanceSuite } from '../../../conformance/declarative-forms-conformance.shared.js';
import { installWebMCP } from '@mcp-b/webmcp-polyfill';

runDeclarativeFormConformanceSuite({
  suiteName: 'Standalone polyfill declarative forms',
  install: installWebMCP,
});
