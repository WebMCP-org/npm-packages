import type { InputSchema } from '@mcp-b/webmcp-types';
import type { InferOutput, WebMCPConfig, WebMCPReturn } from '../types.js';

type IsEqual<Left, Right> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : false
  : false;

type Assert<T extends true> = T;

const noSchemaObjectConfig = {
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

const jsonConfig: WebMCPConfig<InputSchema, JsonOutputSchema> = {
  name: 'json_output',
  description: 'JSON output',
  outputSchema: {
    type: 'object',
    properties: {
      total: { type: 'number' },
    },
    required: ['total'],
  },
  handler: async () => ({ total: 1 }),
};

type UndefinedFallsBackToUnknown = Assert<IsEqual<InferOutput<undefined>, unknown>>;
type NoSchemaLastResult = WebMCPReturn['state']['lastResult'];
type NoSchemaLastResultIsUnknown = Assert<IsEqual<NoSchemaLastResult, unknown | null>>;
type NoSchemaExecuteResult = Awaited<ReturnType<WebMCPReturn['execute']>>;
type NoSchemaExecuteResultIsUnknown = Assert<IsEqual<NoSchemaExecuteResult, unknown>>;

type NoSchemaObjectResult = Awaited<ReturnType<typeof noSchemaObjectConfig.handler>>;
type NoSchemaObjectHasTotal = Assert<NoSchemaObjectResult extends { total: number } ? true : false>;

type NoSchemaStringResult = Awaited<ReturnType<typeof noSchemaStringConfig.handler>>;
type NoSchemaStringIsString = Assert<IsEqual<NoSchemaStringResult, string>>;

type JsonOutputResult = Awaited<ReturnType<typeof jsonConfig.handler>>;
type JsonOutputIsTyped = Assert<IsEqual<JsonOutputResult, { total: number }>>;

type HandlerWithoutOutputSchema = () => Promise<InferOutput<undefined>>;
export const objectHandlerWithoutOutputSchema: HandlerWithoutOutputSchema = async () => ({
  items: [],
  total: 0,
});
export const stringHandlerWithoutOutputSchema: HandlerWithoutOutputSchema = async () => 'pong';

declare const noSchemaObjectOutput: NoSchemaObjectResult;
export const noSchemaTotal: number = noSchemaObjectOutput.total;

declare const noSchemaStringOutput: NoSchemaStringResult;
export const noSchemaText: string = noSchemaStringOutput;

declare const jsonOutput: JsonOutputResult;
export const jsonTotal: number = jsonOutput.total;

export const typeRegressionAssertion: UndefinedFallsBackToUnknown = true;
export const noSchemaLastResultAssertion: NoSchemaLastResultIsUnknown = true;
export const noSchemaExecuteAssertion: NoSchemaExecuteResultIsUnknown = true;
export const noSchemaObjectAssertion: NoSchemaObjectHasTotal = true;
export const noSchemaStringAssertion: NoSchemaStringIsString = true;
export const jsonOutputAssertion: JsonOutputIsTyped = true;
