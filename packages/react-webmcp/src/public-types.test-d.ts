import { expectTypeOf } from 'vitest';
import type {
  CallToolResult,
  ModelContextProtocol,
  PromptDescriptor,
  PromptMessage,
  ResourceContents,
  ResourceDescriptor,
  ToolAnnotations,
  ToolDescriptor,
  WebMCPPromptConfig,
  WebMCPPromptReturn,
  WebMCPResourceConfig,
  WebMCPResourceReturn,
} from './index.js';

// The gap these re-exports close: naming a prompt handler and its return type
// without reaching into the SDK internals.
const getPrompt: WebMCPPromptConfig['get'] = async ({
  code,
}): Promise<{ messages: PromptMessage[] }> => ({
  messages: [{ role: 'user', content: { type: 'text', text: `Review ${code}` } }],
});

const readResource: WebMCPResourceConfig['read'] = async (
  uri
): Promise<{ contents: ResourceContents[] }> => ({
  contents: [{ uri: uri.href, text: '{}' }],
});

expectTypeOf(getPrompt).parameter(0).toEqualTypeOf<Parameters<PromptDescriptor['get']>[0]>();
expectTypeOf(readResource).parameter(0).toEqualTypeOf<URL>();

expectTypeOf<WebMCPResourceConfig>().toEqualTypeOf<ResourceDescriptor>();
expectTypeOf<WebMCPResourceReturn>().toEqualTypeOf<WebMCPPromptReturn>();

expectTypeOf<ModelContextProtocol['registerPrompt']>().toBeFunction();
expectTypeOf<ToolDescriptor['annotations']>().toEqualTypeOf<ToolAnnotations | undefined>();
expectTypeOf<CallToolResult['content']>().toBeArray();
