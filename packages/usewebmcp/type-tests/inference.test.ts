import type { InputSchema } from '@mcp-b/webmcp-types';
import type { InferOutput, InferToolInput, WebMCPConfig, WebMCPReturn } from '../src/types.js';

type Equal<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;
type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;

type Input = {
  type: 'object';
  properties: { query: { type: 'string' }; limit: { type: 'integer' } };
  required: ['query'];
};
type Output = {
  type: 'object';
  properties: { total: { type: 'number' }; tags: { type: 'array'; items: { type: 'string' } } };
  required: ['total'];
};
type StandardInput = {
  readonly '~standard': {
    readonly types?: { readonly input: { query: string }; readonly output: unknown };
  };
};

const config: WebMCPConfig<Input, Output> = {
  name: 'search',
  description: 'Search items',
  outputSchema: {
    type: 'object',
    properties: { total: { type: 'number' }, tags: { type: 'array', items: { type: 'string' } } },
    required: ['total'],
  },
  execute: async ({ query, limit }) => ({ total: query.length + (limit ?? 0) }),
};

const invalidConfig = {
  name: 'invalid',
  description: 'Returns the wrong type',
  outputSchema: { type: 'number' } as const,
  // @ts-expect-error - the output schema requires a number
  execute: async () => 'wrong',
} satisfies WebMCPConfig<InputSchema, { type: 'number' }>;

export type InferenceAssertions = [
  Assert<Equal<InferOutput<undefined>, unknown>>,
  Assert<Equal<IsAny<InferOutput<undefined>>, false>>,
  Assert<Equal<InferOutput<{ type: 'string' }>, string>>,
  Assert<Equal<InferOutput<{ type: 'array'; items: { type: 'number' } }>, number[]>>,
  Assert<Equal<InferToolInput<Input>, { query: string; limit?: number }>>,
  Assert<Equal<InferToolInput<StandardInput>, { query: string }>>,
  Assert<Equal<WebMCPReturn['state']['lastResult'], unknown>>,
  Assert<Equal<Awaited<ReturnType<WebMCPReturn['execute']>>, unknown>>,
  Assert<Equal<WebMCPReturn<Output, Input>['state']['lastResult'], InferOutput<Output> | null>>,
  Assert<Equal<Parameters<WebMCPReturn<Output, Input>['execute']>[0], InferToolInput<Input>>>,
  Assert<Equal<Awaited<ReturnType<WebMCPReturn<Output, Input>['execute']>>, InferOutput<Output>>>,
];

void config;
void invalidConfig;
