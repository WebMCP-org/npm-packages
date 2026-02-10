import { expectTypeOf, test } from 'vitest';
import type { InputSchema } from './common.js';
import type {
  InferArgsFromInputSchema,
  InferJsonSchema,
  JsonSchemaForInference,
  ModelContext,
  ToolDescriptorFromSchema,
} from './index.js';

const closedSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
  },
  required: ['query'],
  additionalProperties: false,
} as const satisfies JsonSchemaForInference;

const openSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
  },
  required: ['query'],
} as const satisfies JsonSchemaForInference;

const outputSchema = {
  type: 'object',
  properties: {
    total: { type: 'integer' },
    items: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['total'],
  additionalProperties: false,
} as const satisfies JsonSchemaForInference;

declare const runtimeSchema: InputSchema;
declare const registerTool: ModelContext['registerTool'];
const shouldInvokeRegisterTool = Date.now() < 0;

test('InferJsonSchema maps primitive, enum, const, and array schemas', () => {
  expectTypeOf<InferJsonSchema<{ type: 'string' }>>().toEqualTypeOf<string>();
  expectTypeOf<InferJsonSchema<{ type: 'integer' }>>().toEqualTypeOf<number>();
  expectTypeOf<InferJsonSchema<{ type: 'boolean' }>>().toEqualTypeOf<boolean>();
  expectTypeOf<InferJsonSchema<{ type: 'null' }>>().toEqualTypeOf<null>();
  expectTypeOf<InferJsonSchema<{ enum: ['read', 'write'] }>>().toEqualTypeOf<'read' | 'write'>();
  expectTypeOf<InferJsonSchema<{ const: 'health' }>>().toEqualTypeOf<'health'>();
  expectTypeOf<InferJsonSchema<{ type: 'array'; items: { type: 'number' } }>>().toEqualTypeOf<
    number[]
  >();
});

test('InferArgsFromInputSchema handles closed and open object schemas', () => {
  const closedArgs: InferArgsFromInputSchema<typeof closedSchema> = { query: 'webmcp' };
  const openArgs: InferArgsFromInputSchema<typeof openSchema> = { query: 'webmcp', extra: 1 };

  expectTypeOf(closedArgs.query).toEqualTypeOf<string>();
  expectTypeOf(closedArgs.limit).toEqualTypeOf<number | undefined>();
  expectTypeOf(openArgs.query).toEqualTypeOf<string>();

  // @ts-expect-error - query is required for closed schemas
  const missingRequired: InferArgsFromInputSchema<typeof closedSchema> = {};
  void missingRequired;
});

test('InferArgsFromInputSchema falls back for widened runtime schemas', () => {
  expectTypeOf<InferArgsFromInputSchema<typeof runtimeSchema>>().toEqualTypeOf<
    Record<string, unknown>
  >();
});

test('ToolDescriptorFromSchema infers execute args from inputSchema', () => {
  type ExecuteArgs = Parameters<ToolDescriptorFromSchema<typeof closedSchema>['execute']>[0];
  const args: ExecuteArgs = { query: 'webmcp' };

  expectTypeOf(args.query).toEqualTypeOf<string>();
  expectTypeOf(args.limit).toEqualTypeOf<number | undefined>();
});

test('ToolDescriptorFromSchema infers structuredContent from outputSchema', () => {
  type ExecuteResult = Awaited<
    ReturnType<ToolDescriptorFromSchema<typeof closedSchema, typeof outputSchema>['execute']>
  >;
  type StructuredContent = ExecuteResult['structuredContent'];

  const structuredContent: NonNullable<StructuredContent> = {
    total: 1,
    items: ['a'],
  };
  expectTypeOf(structuredContent.total).toEqualTypeOf<number>();
  expectTypeOf(structuredContent.items).toEqualTypeOf<string[] | undefined>();
  expectTypeOf<StructuredContent>().toMatchTypeOf<
    | {
        total: number;
        items?: string[];
      }
    | undefined
  >();
});

test('ModelContext.registerTool infers execute args from literal schema', () => {
  if (shouldInvokeRegisterTool) {
    registerTool({
      name: 'search',
      description: 'Search docs',
      inputSchema: closedSchema,
      async execute(args) {
        const inferredArgs: { query: string; limit?: number } = args;
        void inferredArgs;
        const text = args.query;
        return {
          content: [{ type: 'text', text }],
        };
      },
    });
  }
});

test('ModelContext.registerTool infers execute output from outputSchema', () => {
  if (shouldInvokeRegisterTool) {
    registerTool({
      name: 'search_with_summary',
      description: 'Search docs with structured summary',
      inputSchema: closedSchema,
      outputSchema,
      async execute(args) {
        const query = args.query;
        return {
          content: [{ type: 'text', text: query }],
          structuredContent: {
            total: 1,
            items: [query],
          },
        };
      },
    });
  }
});
