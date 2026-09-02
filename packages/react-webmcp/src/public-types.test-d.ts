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
  WebMCPConfig,
  WebMCPPromptConfig,
  WebMCPPromptReturn,
  WebMCPResourceConfig,
  WebMCPResourceReturn,
  useWebMCPContext,
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

expectTypeOf<WebMCPResourceConfig>().toEqualTypeOf<
  ResourceDescriptor & Pick<WebMCPConfig, 'enabled'>
>();
expectTypeOf<WebMCPResourceReturn>().toEqualTypeOf<WebMCPPromptReturn>();
expectTypeOf<Parameters<typeof useWebMCPContext>[3]>().toEqualTypeOf<
  Pick<WebMCPConfig, 'enabled'> | undefined
>();

const disabledTool = {
  name: 'disabled_tool',
  description: 'A conditionally registered tool',
  enabled: false,
  execute: () => null,
} satisfies WebMCPConfig;
const disabledPrompt = {
  name: 'disabled_prompt',
  enabled: false,
  get: getPrompt,
} satisfies WebMCPPromptConfig;
const disabledResource = {
  uri: 'data://disabled',
  name: 'Disabled resource',
  enabled: false,
  read: readResource,
} satisfies WebMCPResourceConfig;
const disabledContext = { enabled: false } satisfies NonNullable<
  Parameters<typeof useWebMCPContext>[3]
>;

// @ts-expect-error enabled requires a boolean, not a truthy string.
const invalidTool = { ...disabledTool, enabled: 'false' } satisfies WebMCPConfig;
// @ts-expect-error prompt registration uses the same boolean option.
const invalidPrompt = { ...disabledPrompt, enabled: 'false' } satisfies WebMCPPromptConfig;
// @ts-expect-error resource registration uses the same boolean option.
const invalidResource = { ...disabledResource, enabled: 'false' } satisfies WebMCPResourceConfig;
const invalidContext: Parameters<typeof useWebMCPContext>[3] = {
  ...disabledContext,
  // @ts-expect-error the context options also require a boolean.
  enabled: 'false',
};
void invalidTool;
void invalidPrompt;
void invalidResource;
void invalidContext;

expectTypeOf<ModelContextProtocol['registerPrompt']>().toBeFunction();
expectTypeOf<ToolDescriptor['annotations']>().toEqualTypeOf<ToolAnnotations | undefined>();
expectTypeOf<CallToolResult['content']>().toBeArray();
