export {
  BrowserMcpServer,
  type BrowserMcpServerOptions,
  isBrowserMcpServer,
  type PromptDescriptor,
  type ResourceDescriptor,
} from './browser-server.js';
export type * from './common.js';
export type * from './json-schema.js';
export type * from './model-context.js';
export type * from './tool.js';
// The polyfill forwards upstream's namespace and adds the SubmitEvent and ModelContext
// declarations, which reach consumers only through a named type import.
export type { WebMCP } from '@mcp-b/webmcp-polyfill';
