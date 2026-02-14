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

const requiredKeysFromRuntime: string[] = ['query'];

const schemaWithWidenedRequired = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    limit: { type: 'integer' },
  },
  required: requiredKeysFromRuntime,
} as const satisfies JsonSchemaForInference;

const schemaWithSupplementalKeywords = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
  },
  required: ['email'],
  allOf: [{ type: 'object' }],
} as const satisfies JsonSchemaForInference;

const schemaWithTypeUnion = {
  type: ['string', 'null'],
} as const satisfies JsonSchemaForInference;

const schemaWithNullable = {
  type: 'string',
  nullable: true,
} as const satisfies JsonSchemaForInference;

const schemaWithDynamicMapValues = {
  type: 'object',
  additionalProperties: { type: 'integer' },
} as const satisfies JsonSchemaForInference;

const schemaWithNamedAndDynamicProperties = {
  type: 'object',
  properties: {
    query: { type: 'string' },
  },
  required: ['query'],
  additionalProperties: { type: 'integer' },
} as const satisfies JsonSchemaForInference;

const schemaWithObjectTypeUnion = {
  type: ['object', 'null'],
  properties: {
    query: { type: 'string' },
  },
  required: ['query'],
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
  expectTypeOf<InferJsonSchema<typeof schemaWithTypeUnion>>().toEqualTypeOf<string | null>();
  expectTypeOf<InferJsonSchema<typeof schemaWithNullable>>().toEqualTypeOf<string | null>();
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

test('InferArgsFromInputSchema treats widened required arrays as optional fields', () => {
  const args: InferArgsFromInputSchema<typeof schemaWithWidenedRequired> = {};
  expectTypeOf(args.query).toEqualTypeOf<string | undefined>();
  expectTypeOf(args.limit).toEqualTypeOf<number | undefined>();
});

test('InferArgsFromInputSchema ignores supplemental schema keywords', () => {
  type Args = InferArgsFromInputSchema<typeof schemaWithSupplementalKeywords>;
  const args: Args = { email: 'test@example.com' };
  expectTypeOf(args.email).toEqualTypeOf<string>();
});

test('InferArgsFromInputSchema infers map-like objects from additionalProperties', () => {
  expectTypeOf<InferArgsFromInputSchema<typeof schemaWithDynamicMapValues>>().toEqualTypeOf<
    Record<string, number>
  >();
});

test('InferArgsFromInputSchema keeps extras unknown when named properties are present', () => {
  type Args = InferArgsFromInputSchema<typeof schemaWithNamedAndDynamicProperties>;
  const args: Args = { query: 'hello', limit: 10 };
  expectTypeOf(args.query).toEqualTypeOf<string>();
  expectTypeOf(args.limit).toEqualTypeOf<unknown>();
});

test('InferArgsFromInputSchema supports object type unions for argument inference', () => {
  type Args = InferArgsFromInputSchema<typeof schemaWithObjectTypeUnion>;
  const args: Args = { query: 'webmcp' };
  expectTypeOf(args.query).toEqualTypeOf<string>();
});

test('ToolDescriptorFromSchema infers execute args from inputSchema', () => {
  type ExecuteArgs = Parameters<ToolDescriptorFromSchema<typeof closedSchema>['execute']>[0];
  const args: ExecuteArgs = { query: 'webmcp' };

  expectTypeOf(args.query).toEqualTypeOf<string>();
  expectTypeOf(args.limit).toEqualTypeOf<number | undefined>();
});

test('ToolDescriptorFromSchema execute args reject missing required keys', () => {
  type ExecuteArgs = Parameters<ToolDescriptorFromSchema<typeof closedSchema>['execute']>[0];
  // @ts-expect-error - query is required by closedSchema
  const args: ExecuteArgs = { limit: 1 };
  void args;
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

test('ModelContext.registerTool rejects unknown execute args for closed schemas', () => {
  if (shouldInvokeRegisterTool) {
    registerTool({
      name: 'search_closed_args',
      description: 'Search docs with closed schema args',
      inputSchema: closedSchema,
      execute(args) {
        // @ts-expect-error - closed schema does not infer unknown keys
        const extra = args.extra;
        void extra;
        return {
          content: [{ type: 'text', text: args.query }],
        };
      },
    });
  }
});

test('ModelContext.registerTool infers execute args from object type unions', () => {
  if (shouldInvokeRegisterTool) {
    registerTool({
      name: 'search_union',
      description: 'Search docs with object union schema',
      inputSchema: schemaWithObjectTypeUnion,
      async execute(args) {
        const inferredArgs: { query: string } = args;
        void inferredArgs;
        return {
          content: [{ type: 'text', text: args.query }],
        };
      },
    });
  }
});

test('ModelContext.registerTool accepts sync execute handlers', () => {
  if (shouldInvokeRegisterTool) {
    registerTool({
      name: 'sync_search',
      description: 'Sync search docs',
      inputSchema: closedSchema,
      execute(args) {
        return {
          content: [{ type: 'text', text: args.query }],
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

test('ModelContext.registerTool accepts async output schema handlers with loose content blocks', () => {
  if (shouldInvokeRegisterTool) {
    registerTool({
      name: 'feature_flags',
      description: 'Summarize feature flags',
      inputSchema: {
        type: 'object',
        properties: {
          features: { type: 'string', description: 'Comma separated features' },
          defaultOn: { type: 'string', description: 'Comma separated defaults' },
        },
        required: ['features'],
      } as const satisfies JsonSchemaForInference,
      outputSchema: {
        type: 'object',
        properties: {
          featureCount: { type: 'integer' },
          enabledCount: { type: 'integer' },
        },
        required: ['featureCount', 'enabledCount'],
      } as const satisfies JsonSchemaForInference,
      async execute(args) {
        const features = args.features?.split(',').filter(Boolean) ?? [];
        const defaults = args.defaultOn?.split(',').filter(Boolean) ?? [];
        return {
          content: [{ text: 'feature summary', data: features.join(',') }],
          structuredContent: {
            featureCount: features.length,
            enabledCount: defaults.length,
          },
        };
      },
    });
  }
});

test('ModelContext.registerTool rejects invalid structuredContent for inferred outputSchema', () => {
  if (shouldInvokeRegisterTool) {
    // @ts-expect-error - structuredContent must satisfy outputSchema (missing total, extra test)
    registerTool({
      name: 'search_summary',
      description: 'Async tool with inferred structured output',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          maxResults: { type: 'integer', minimum: 1, maximum: 50 },
        },
        required: ['query'],
        additionalProperties: false,
      } as const satisfies JsonSchemaForInference,
      outputSchema: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          tags: { type: 'array', items: { type: 'string' } },
          mode: { type: 'string', enum: ['compact', 'full'] },
        },
        required: ['total'],
        additionalProperties: false,
      } as const satisfies JsonSchemaForInference,
      async execute(args) {
        return {
          content: [{ text: `summary for ${args.query}`, data: 'opaque' }],
          structuredContent: {
            test: 'test',
            tags: [args.query],
            mode: 'compact',
          },
        };
      },
    });
  }
});

test('ModelContext.registerTool rejects structuredContent enum/type mismatches', () => {
  if (shouldInvokeRegisterTool) {
    // @ts-expect-error - total must be number and mode must match enum literals
    registerTool({
      name: 'search_summary_mismatch',
      description: 'Invalid structured output',
      inputSchema: closedSchema,
      outputSchema: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          mode: { type: 'string', enum: ['compact', 'full'] },
        },
        required: ['total'],
        additionalProperties: false,
      } as const satisfies JsonSchemaForInference,
      execute(args) {
        return {
          content: [{ type: 'text', text: args.query }],
          structuredContent: {
            total: '1',
            mode: 'verbose',
          },
        };
      },
    });
  }
});

test('ToolDescriptorFromSchema requires outputSchema when output generic is provided', () => {
  // @ts-expect-error - outputSchema is required when output generic parameter is set
  const tool: ToolDescriptorFromSchema<typeof closedSchema, typeof outputSchema> = {
    name: 'missing_output_schema',
    description: 'Missing output schema should fail',
    inputSchema: closedSchema,
    execute(args) {
      return {
        content: [{ type: 'text', text: args.query }],
      };
    },
  };
  void tool;
});

test('ToolDescriptorFromSchema falls back when input schema is widened to InputSchema', () => {
  type ExecuteArgs = Parameters<ToolDescriptorFromSchema<InputSchema>['execute']>[0];
  expectTypeOf<ExecuteArgs>().toEqualTypeOf<Record<string, unknown>>();
});

test('ModelContext.registerTool keeps execute args unknown for runtime schemas', () => {
  if (shouldInvokeRegisterTool) {
    registerTool({
      name: 'runtime_schema_unknown_args',
      description: 'Runtime schemas should keep args unknown',
      inputSchema: runtimeSchema,
      execute(args) {
        // @ts-expect-error - runtime schema args are unknown and must be narrowed first
        const query: string = args.query;
        void query;
        return {
          content: [{ type: 'text', text: 'ok' }],
        };
      },
    });
  }
});
