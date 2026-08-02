import { expectTypeOf, test } from 'vitest';
import type {
  CallToolResult,
  InferArgsFromInputSchema,
  InferJsonSchema,
  InputSchema,
  JsonSchemaForInference,
  ModelContext,
  ModelContextWithExtensions,
  ToolDescriptor,
  ToolDescriptorFromSchema,
  WebMcpToolInput,
} from './index.js';
import type { JsonSchemaType } from '@modelcontextprotocol/server';

const closedSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    limit: { type: 'integer', minimum: 1 },
  },
  required: ['query'],
  additionalProperties: false,
} as const satisfies JsonSchemaForInference;

const outputSchema = {
  type: 'object',
  properties: {
    total: { type: 'integer' },
    items: { type: 'array', items: { type: 'string' } },
  },
  required: ['total'],
  additionalProperties: false,
} as const satisfies JsonSchemaForInference;

declare const runtimeSchema: InputSchema;
declare const registerStandardTool: ModelContext['registerTool'];
declare const registerTool: ModelContextWithExtensions['registerTool'];

test('JsonSchemaForInference is owned by the upstream MCP SDK', () => {
  expectTypeOf<JsonSchemaForInference>().toEqualTypeOf<JsonSchemaType>();
});

test('InferJsonSchema handles primitive, literal, union, and array schemas', () => {
  expectTypeOf<InferJsonSchema<{ type: 'string' }>>().toEqualTypeOf<string>();
  expectTypeOf<InferJsonSchema<{ type: 'integer' }>>().toEqualTypeOf<number>();
  expectTypeOf<InferJsonSchema<{ type: 'boolean' }>>().toEqualTypeOf<boolean>();
  expectTypeOf<InferJsonSchema<{ type: 'null' }>>().toEqualTypeOf<null>();
  expectTypeOf<InferJsonSchema<{ enum: ['read', 'write'] }>>().toEqualTypeOf<'read' | 'write'>();
  expectTypeOf<InferJsonSchema<{ const: 'health' }>>().toEqualTypeOf<'health'>();
  expectTypeOf<InferJsonSchema<{ type: ['string', 'null'] }>>().toEqualTypeOf<string | null>();
  expectTypeOf<InferJsonSchema<{ type: 'array'; items: { type: 'number' } }>>().toEqualTypeOf<
    number[]
  >();
  expectTypeOf<InferJsonSchema<{ type: 'array'; items: false }>>().toEqualTypeOf<never[]>();
  expectTypeOf<InferJsonSchema<{ type: 'array'; items: true }>>().toEqualTypeOf<unknown[]>();
});

test('typeless object keywords infer objects while unsupported compositions stay unknown', () => {
  type ObjectValue = InferJsonSchema<{
    properties: { query: { type: 'string' } };
    required: ['query'];
  }>;
  expectTypeOf<ObjectValue>().toEqualTypeOf<{ query: string; [key: string]: unknown }>();
  expectTypeOf<InferJsonSchema<{}>>().toBeUnknown();
  expectTypeOf<InferJsonSchema<{ $ref: '#/$defs/item' }>>().toBeUnknown();
  expectTypeOf<
    InferJsonSchema<{ oneOf: [{ type: 'string' }, { type: 'number' }] }>
  >().toBeUnknown();
});

test('object inference respects required keys and additional properties', () => {
  type Closed = InferArgsFromInputSchema<typeof closedSchema>;
  type Open = InferArgsFromInputSchema<{
    type: 'object';
    properties: { query: { type: 'string' } };
    required: ['query'];
  }>;

  expectTypeOf<Closed>().toEqualTypeOf<{ query: string; limit?: number }>();
  expectTypeOf<Open>().toEqualTypeOf<{ query: string; [key: string]: unknown }>();
  expectTypeOf<
    InferArgsFromInputSchema<{ type: 'object'; additionalProperties: false }>
  >().toEqualTypeOf<Record<string, never>>();

  // @ts-expect-error query is required.
  const missingQuery: Closed = {};
  void missingQuery;
});

test('widened required arrays make known fields optional', () => {
  type Args = InferArgsFromInputSchema<{
    type: 'object';
    properties: { query: { type: 'string' }; limit: { type: 'integer' } };
    required: string[];
  }>;
  expectTypeOf<Args>().toEqualTypeOf<{
    query?: string;
    limit?: number;
    [key: string]: unknown;
  }>();
});

test('additionalProperties infers maps but keeps named extras unknown', () => {
  type MapArgs = InferArgsFromInputSchema<{
    type: 'object';
    additionalProperties: { type: 'integer' };
  }>;
  type NamedArgs = InferArgsFromInputSchema<{
    type: 'object';
    properties: { query: { type: 'string' } };
    required: ['query'];
    additionalProperties: { type: 'integer' };
  }>;

  expectTypeOf<MapArgs>().toEqualTypeOf<Record<string, number>>();
  expectTypeOf<NamedArgs>().toEqualTypeOf<{ query: string; [key: string]: unknown }>();
});

test('argument inference preserves arrays and safely widens runtime schemas', () => {
  expectTypeOf<
    InferArgsFromInputSchema<{ type: 'array'; items: { type: 'number' } }>
  >().toEqualTypeOf<number[]>();
  expectTypeOf<InferArgsFromInputSchema<InputSchema>>().toEqualTypeOf<WebMcpToolInput>();
  expectTypeOf<InferArgsFromInputSchema<{}>>().toEqualTypeOf<WebMcpToolInput>();
  expectTypeOf<InferArgsFromInputSchema<{ type: 'null' }>>().toEqualTypeOf<WebMcpToolInput>();
  expectTypeOf<
    InferArgsFromInputSchema<{
      type: ['object', 'null'];
      properties: { query: { type: 'string' } };
      required: ['query'];
      additionalProperties: false;
    }>
  >().toEqualTypeOf<{ query: string }>();
});

test('standard registration contextually infers literal object and array inputs', () => {
  registerStandardTool({
    name: 'search',
    description: 'Search docs',
    inputSchema: closedSchema,
    execute(args) {
      expectTypeOf(args).toEqualTypeOf<{ query: string; limit?: number }>();
      return args.query;
    },
  });

  registerStandardTool({
    name: 'sum',
    description: 'Sum numbers',
    inputSchema: { type: 'array', items: { type: 'number' } },
    execute(args) {
      expectTypeOf(args).toEqualTypeOf<number[]>();
      return args.length;
    },
  });
});

test('widened registration inputs require object-or-array narrowing', () => {
  registerStandardTool({
    name: 'runtime',
    description: 'Runtime schema',
    inputSchema: runtimeSchema,
    execute(args) {
      expectTypeOf(args).toEqualTypeOf<WebMcpToolInput>();
      return args;
    },
  });

  type Args = Parameters<ToolDescriptorFromSchema<InputSchema>['execute']>[0];
  expectTypeOf<Args>().toEqualTypeOf<WebMcpToolInput>();
});

test('extension registration infers and enforces structured output', () => {
  registerTool({
    name: 'search_summary',
    description: 'Search with summary',
    inputSchema: closedSchema,
    outputSchema,
    execute(args) {
      return { total: 1, items: [args.query] };
    },
  });

  // @ts-expect-error total is required by outputSchema.
  registerTool({
    name: 'invalid_summary',
    description: 'Invalid summary',
    inputSchema: closedSchema,
    outputSchema,
    execute(args) {
      return { items: [args.query] };
    },
  });

  // @ts-expect-error wrapped responses must carry schema-compatible structuredContent.
  registerTool({
    name: 'invalid_wrapped_summary',
    description: 'Invalid wrapped summary',
    inputSchema: closedSchema,
    outputSchema,
    execute(args): CallToolResult {
      return { content: [{ type: 'text', text: args.query }] };
    },
  });
});

test('typed extension descriptors remain compatible with the standard document surface', () => {
  const descriptor = {
    name: 'search_summary',
    description: 'Search with summary',
    inputSchema: closedSchema,
    outputSchema,
    execute: ({ query }) => ({ total: 1, items: [query] }),
  } satisfies ToolDescriptorFromSchema<typeof closedSchema, typeof outputSchema>;

  registerStandardTool(descriptor);
});

test('explicit descriptors remain available when inference is not enough', () => {
  const descriptor: ToolDescriptor<{ id: string }, CallToolResult, 'lookup'> = {
    name: 'lookup',
    description: 'Look up an item',
    execute: ({ id }) => ({ content: [{ type: 'text', text: id }] }),
  };
  expectTypeOf(descriptor.name).toEqualTypeOf<'lookup'>();
});
