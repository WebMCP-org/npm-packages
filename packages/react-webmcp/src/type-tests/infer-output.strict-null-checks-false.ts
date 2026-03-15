import type { InputSchema } from '@mcp-b/webmcp-types';
import { z } from 'zod';
import type { InferOutput, WebMCPConfig, WebMCPReturn } from '../types.js';

type IsEqual<Left, Right> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : false
  : false;

type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;

const unstructuredConfig = {
  name: 'list_items',
  description: 'List items',
  handler: async () => ({ items: [], total: 0 }),
} satisfies WebMCPConfig;

const noSchemaStringConfig = {
  name: 'ping',
  description: 'Ping',
  handler: async () => 'pong',
} satisfies WebMCPConfig;

type JsonOutputSchema = {
  type: 'object';
  properties: {
    total: { type: 'number' };
  };
  required: ['total'];
};

const zodConfig: WebMCPConfig<InputSchema, { name: z.ZodString }> = {
  name: 'zod_output',
  description: 'Zod output',
  outputSchema: { name: z.string() },
  handler: async () => ({ name: 'typed' }),
};

const jsonOutputSchema: JsonOutputSchema = {
  type: 'object',
  properties: {
    total: { type: 'number' },
  },
  required: ['total'],
};

const jsonConfig: WebMCPConfig<InputSchema, JsonOutputSchema> = {
  name: 'json_output',
  description: 'JSON output',
  outputSchema: jsonOutputSchema,
  handler: async () => ({ total: 1 }),
};

type UndefinedFallsBackToUnknown = Assert<IsEqual<InferOutput<undefined>, unknown>>;
type UnstructuredLastResult = WebMCPReturn['state']['lastResult'];
type UnstructuredLastResultIsUnknown = Assert<IsEqual<UnstructuredLastResult, unknown | null>>;
type UnstructuredExecuteResult = Awaited<ReturnType<WebMCPReturn['execute']>>;
type UnstructuredExecuteResultIsUnknown = Assert<IsEqual<UnstructuredExecuteResult, unknown>>;
type UnstructuredHandlerResult = Awaited<ReturnType<typeof unstructuredConfig.handler>>;
type UnstructuredHandlerHasTotal = Assert<
  UnstructuredHandlerResult extends { total: number } ? true : false
>;
type NoSchemaStringResult = Awaited<ReturnType<typeof noSchemaStringConfig.handler>>;
type NoSchemaStringIsString = Assert<IsEqual<NoSchemaStringResult, string>>;

type ZodOutput = Awaited<ReturnType<typeof zodConfig.handler>>;
type ZodOutputNameIsString = Assert<IsEqual<ZodOutput['name'], string>>;
type ZodOutputIsNotAny = Assert<IsEqual<IsAny<ZodOutput>, false>>;

type JsonOutput = Awaited<ReturnType<typeof jsonConfig.handler>>;
type JsonOutputIsTyped = Assert<IsEqual<JsonOutput, { total: number }>>;

declare const zodOutput: ZodOutput;
export const zodName: string = zodOutput.name;

declare const jsonOutput: JsonOutput;
export const jsonTotal: number = jsonOutput.total;

declare const unstructuredOutput: UnstructuredHandlerResult;
export const unstructuredTotal: number = unstructuredOutput.total;

declare const noSchemaStringOutput: NoSchemaStringResult;
export const noSchemaStringText: string = noSchemaStringOutput;

type HandlerWithoutOutputSchema = () => Promise<InferOutput<undefined>>;
export const handlerWithoutOutputSchema: HandlerWithoutOutputSchema = async () => ({
  items: [],
  total: 0,
});
export const stringHandlerWithoutOutputSchema: HandlerWithoutOutputSchema = async () => 'pong';

export const typeRegressionAssertion: UndefinedFallsBackToUnknown = true;
export const unstructuredLastResultAssertion: UnstructuredLastResultIsUnknown = true;
export const unstructuredExecuteAssertion: UnstructuredExecuteResultIsUnknown = true;
export const unstructuredHandlerAssertion: UnstructuredHandlerHasTotal = true;
export const noSchemaStringAssertion: NoSchemaStringIsString = true;
export const zodOutputAssertion: ZodOutputNameIsString = true;
export const zodAnyAssertion: ZodOutputIsNotAny = true;
export const jsonOutputAssertion: JsonOutputIsTyped = true;

// Primitive/array output schema parity checks
const primitiveOutputConfig = {
  name: 'status_text',
  description: 'Returns status text',
  outputSchema: { type: 'string' } as const,
  handler: async () => 'ok',
} satisfies WebMCPConfig<InputSchema, { type: 'string' }>;

const arrayOutputConfig = {
  name: 'scores',
  description: 'Returns scores',
  outputSchema: { type: 'array', items: { type: 'number' } } as const,
  handler: async () => [1, 2, 3],
} satisfies WebMCPConfig<InputSchema, { type: 'array'; items: { type: 'number' } }>;

type PrimitiveOutputResult = Awaited<ReturnType<typeof primitiveOutputConfig.handler>>;
type PrimitiveOutputIsString = Assert<IsEqual<PrimitiveOutputResult, string>>;

type ArrayOutputResult = Awaited<ReturnType<typeof arrayOutputConfig.handler>>;
type ArrayOutputIsNumberArray = Assert<IsEqual<ArrayOutputResult, number[]>>;

const objectOutputConfig = {
  name: 'object_result',
  description: 'Returns object',
  outputSchema: {
    type: 'object',
    properties: { total: { type: 'number' } },
    required: ['total'],
  } as const,
  handler: async () => ({ total: 1 }),
} satisfies WebMCPConfig<InputSchema, { type: 'object'; properties: { total: { type: 'number' } }; required: ['total'] }>;

const invalidObjectOutputConfig = {
  name: 'invalid_object_result',
  description: 'Returns wrong primitive',
  outputSchema: {
    type: 'object',
    properties: { total: { type: 'number' } },
    required: ['total'],
  } as const,
  // @ts-expect-error - object output schema requires object-shaped handler result
  handler: async () => 'wrong',
} satisfies WebMCPConfig<InputSchema, { type: 'object'; properties: { total: { type: 'number' } }; required: ['total'] }>;

void objectOutputConfig;
void invalidObjectOutputConfig;
export const primitiveOutputAssertion: PrimitiveOutputIsString = true;
export const arrayOutputAssertion: ArrayOutputIsNumberArray = true;

