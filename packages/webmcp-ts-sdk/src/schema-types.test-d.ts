import { expectTypeOf, test } from 'vitest';
import type { WebMcpToolObjectInput } from './common.js';
import type {
  InferArgsFromInputSchema,
  InferJsonSchema,
  InputSchema,
  JsonSchemaForInference,
  ModelContext,
  ModelContextWithExtensions,
  ToolDescriptor,
  ToolDescriptorFromSchema,
} from './index.js';
import type { CallToolResult } from '@modelcontextprotocol/server';
import type { JsonSchemaType } from '@modelcontextprotocol/server';
import type { WebMCP } from 'webmcp-types';

const inputSchema = {
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

declare const registerStandardTool: ModelContext['registerTool'];
declare const registerTool: ModelContextWithExtensions['registerTool'];
declare const runtimeSchema: InputSchema;

type UpstreamInput<T extends object> = Parameters<
  WebMCP.ModelContextToolFromSchema<T>['execute']
>[0];

test('JSON Schema constraints come from the MCP SDK', () => {
  expectTypeOf<JsonSchemaForInference>().toEqualTypeOf<JsonSchemaType>();
});

test('input inference delegates to the upstream WebMCP tool type', () => {
  expectTypeOf<InferArgsFromInputSchema<typeof inputSchema>>().toEqualTypeOf<
    UpstreamInput<typeof inputSchema>
  >();

  registerStandardTool({
    name: 'search',
    description: 'Search docs',
    inputSchema,
    execute(args) {
      expectTypeOf(args).toEqualTypeOf<{ query: string; limit?: number }>();
      return args.query;
    },
  });

  registerTool({
    name: 'search_summary',
    description: 'Search with summary',
    inputSchema,
    outputSchema,
    execute(args) {
      expectTypeOf(args).toEqualTypeOf<{ query: string; limit?: number }>();
      return { total: 1, items: [args.query] };
    },
  });
});

test('runtime schemas use upstream callback inference', () => {
  registerStandardTool({
    name: 'runtime',
    description: 'Runtime schema',
    inputSchema: runtimeSchema,
    execute(args) {
      expectTypeOf(args).toEqualTypeOf<UpstreamInput<InputSchema>>();
      return args;
    },
  });
});

test('standard registration uses upstream array inference', () => {
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

test('MCP-B output schemas infer structured content', () => {
  type Output = InferJsonSchema<typeof outputSchema>;
  expectTypeOf<Output>().toEqualTypeOf<{
    total: number;
    items?: string[];
  }>();
  expectTypeOf<InferJsonSchema<{ type: 'number' }>>().toEqualTypeOf<number>();

  type ToolInput = Parameters<
    ToolDescriptorFromSchema<typeof inputSchema, typeof outputSchema>['execute']
  >[0];
  expectTypeOf<ToolInput>().toEqualTypeOf<UpstreamInput<typeof inputSchema>>();

  const descriptor = {
    name: 'search_summary',
    description: 'Search with summary',
    inputSchema,
    outputSchema,
    execute: ({ query }) => ({ total: 1, items: [query] }),
  } satisfies ToolDescriptorFromSchema<typeof inputSchema, typeof outputSchema>;
  registerStandardTool(descriptor);

  // @ts-expect-error total is required by outputSchema.
  registerTool({
    name: 'invalid_summary',
    description: 'Invalid summary',
    inputSchema,
    outputSchema,
    execute(args) {
      return { items: [args.query] };
    },
  });

  // @ts-expect-error wrapped responses must carry schema-compatible structuredContent.
  registerTool({
    name: 'invalid_wrapped_summary',
    description: 'Invalid wrapped summary',
    inputSchema,
    outputSchema,
    execute(args): CallToolResult {
      return { content: [{ type: 'text', text: args.query }] };
    },
  });

  const explicit: ToolDescriptor<{ id: string }, CallToolResult, 'lookup'> = {
    name: 'lookup',
    description: 'Look up an item',
    execute: ({ id }) => ({ content: [{ type: 'text', text: id }] }),
  };
  expectTypeOf(explicit.name).toEqualTypeOf<'lookup'>();
});

test('MCP-B output inference retains primitive, literal, and array support', () => {
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
  expectTypeOf<InferJsonSchema<{}>>().toBeUnknown();
  expectTypeOf<InferJsonSchema<{ $ref: '#/$defs/item' }>>().toBeUnknown();
});

test('MCP-B output object inference retains map and closed-object behavior', () => {
  type OpenObject = InferJsonSchema<{
    properties: { query: { type: 'string' } };
    required: ['query'];
  }>;
  type UpstreamObject = { query: string } & WebMcpToolObjectInput;
  expectTypeOf<OpenObject>().toMatchTypeOf<UpstreamObject>();
  expectTypeOf<UpstreamObject>().toMatchTypeOf<OpenObject>();
  expectTypeOf<InferJsonSchema<{ type: 'object'; additionalProperties: false }>>().toEqualTypeOf<
    Record<string, never>
  >();
  expectTypeOf<
    InferJsonSchema<{ type: 'object'; additionalProperties: { type: 'integer' } }>
  >().toEqualTypeOf<Record<string, number>>();
});
