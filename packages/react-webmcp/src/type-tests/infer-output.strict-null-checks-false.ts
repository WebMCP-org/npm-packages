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

const jsonInputSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    count: { type: 'number' },
  },
  required: ['name'],
} as const;

const jsonInputConfig: WebMCPConfig<typeof jsonInputSchema> = {
  name: 'json_input',
  description: 'JSON input',
  inputSchema: jsonInputSchema,
  handler: async (input) => ({ greeting: input.name, count: input.count ?? 0 }),
};

const zodInputSchema = {
  username: z.string(),
  age: z.number().optional(),
};

const zodInputConfig: WebMCPConfig<typeof zodInputSchema> = {
  name: 'zod_input',
  description: 'Zod input',
  inputSchema: zodInputSchema,
  handler: async (input) => ({ username: input.username, age: input.age ?? 0 }),
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
type JsonInput = Parameters<typeof jsonInputConfig.handler>[0];
type JsonInputNameIsString = Assert<IsEqual<JsonInput['name'], string>>;
type JsonInputCountIsNumberOrUndefined = Assert<IsEqual<JsonInput['count'], number | undefined>>;

type ZodInput = Parameters<typeof zodInputConfig.handler>[0];
type ZodInputUsernameIsString = Assert<IsEqual<ZodInput['username'], string>>;
type ZodInputAgeIsNumberOrUndefined = Assert<IsEqual<ZodInput['age'], number | undefined>>;

declare const zodOutput: ZodOutput;
export const zodName: string = zodOutput.name;

declare const jsonOutput: JsonOutput;
export const jsonTotal: number = jsonOutput.total;

declare const jsonInput: JsonInput;
export const jsonInputName: string = jsonInput.name;
export const jsonInputCount: number | undefined = jsonInput.count;

declare const zodInput: ZodInput;
export const zodInputUsername: string = zodInput.username;
export const zodInputAge: number | undefined = zodInput.age;

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
export const jsonInputNameAssertion: JsonInputNameIsString = true;
export const jsonInputCountAssertion: JsonInputCountIsNumberOrUndefined = true;
export const zodInputUsernameAssertion: ZodInputUsernameIsString = true;
export const zodInputAgeAssertion: ZodInputAgeIsNumberOrUndefined = true;
