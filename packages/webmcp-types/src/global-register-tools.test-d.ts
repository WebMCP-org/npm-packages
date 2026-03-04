import { test } from 'vitest';
import type {
  CallToolResult,
  InputSchema,
  JsonSchemaForInference,
  ModelContextExtensions,
  ToolDescriptor,
} from './index.js';

const shouldInvokeRegisterTool = Date.now() < 0;

function splitCsv(input: string | undefined): string[] {
  if (!input) {
    return [];
  }
  return input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeFeatureKey(input: string): string {
  return input.toLowerCase().replace(/\s+/g, '_');
}

function hasModelContextExtensions(
  modelContext: Navigator['modelContext']
): modelContext is Navigator['modelContext'] & ModelContextExtensions {
  return 'callTool' in modelContext && 'listTools' in modelContext;
}

function isInteractionResponse(
  response: unknown
): response is { action?: string; content?: { confirmed?: boolean } } {
  return (
    typeof response === 'object' &&
    response !== null &&
    'action' in response &&
    'content' in response
  );
}

test('global registerTool kitchen sink examples compile', () => {
  if (!shouldInvokeRegisterTool) {
    return;
  }

  navigator.modelContext.registerTool({
    name: 'ping_sync',
    description: 'Simple synchronous tool',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    execute() {
      return {
        content: [{ type: 'text', text: 'pong' }],
      };
    },
  });

  navigator.modelContext.registerTool({
    name: 'no_schema_defaults',
    description: 'Schema omitted to use runtime default',
    execute(args: Record<string, unknown>) {
      const fallbackArgs: Record<string, unknown> = args;
      void fallbackArgs;
      return {
        content: [{ type: 'text', text: 'default schema path' }],
      };
    },
  });

  navigator.modelContext.registerTool({
    name: 'search_async',
    description: 'Async tool with inferred args',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        maxResults: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['query'],
      additionalProperties: false,
    } as const satisfies JsonSchemaForInference,
    async execute(args) {
      const query: string = args.query;
      const maxResults: number | undefined = args.maxResults;
      void maxResults;
      return {
        content: [{ type: 'text', text: `searching for ${query}` }],
      };
    },
  });

  navigator.modelContext.registerTool({
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
        // Loose content block shape is accepted.
        content: [{ text: `summary for ${args.query}`, data: 'opaque' }],
        structuredContent: {
          total: 1,
          tags: [args.query],
          mode: 'compact' as const,
        },
      };
    },
  });

  navigator.modelContext.registerTool({
    name: 'runtime_schema',
    description: 'Widened schema fallback',
    inputSchema: {
      type: 'object',
      properties: {
        payload: { type: 'string' },
      },
    } satisfies InputSchema,
    execute(args) {
      const fallbackArgs: Record<string, unknown> = args;
      void fallbackArgs;
      return {
        content: [{ type: 'text', text: 'runtime schema accepted' }],
      };
    },
  });

  const explicitTypedTool: ToolDescriptor<
    { id: string },
    CallToolResult & { structuredContent: { id: string; found: boolean } },
    'lookup_explicit'
  > & {
    inputSchema: InputSchema;
  } = {
    name: 'lookup_explicit',
    description: 'Explicit generic descriptor',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
    execute(args) {
      return {
        content: [{ type: 'text', text: `lookup ${args.id}` }],
        structuredContent: {
          id: args.id,
          found: true,
        },
      };
    },
  };

  navigator.modelContext.registerTool(explicitTypedTool);

  navigator.modelContext.registerTool({
    name: 'deploy_with_elicitation',
    description: 'Uses execution context elicitation',
    inputSchema: {
      type: 'object',
      properties: {
        environment: { type: 'string' },
      },
      required: ['environment'],
    },
    async execute(args, context) {
      const response = await context.requestUserInteraction(async () => {
        return {
          action: 'accept',
          content: { confirmed: true },
        };
      });

      if (!isInteractionResponse(response)) {
        return {
          content: [{ type: 'text', text: 'invalid user interaction response' }],
          isError: true,
        };
      }

      if (response.action !== 'accept' || !response.content?.confirmed) {
        return {
          content: [{ type: 'text', text: 'deployment cancelled' }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text', text: `deploying ${args.environment}` }],
      };
    },
  });
});

test('global registerTool implementation-first examples compile', () => {
  if (!shouldInvokeRegisterTool) {
    return;
  }

  navigator.modelContext.registerTool({
    name: 'feature_toggle_summary',
    description: 'Compute normalized feature toggle summary',
    inputSchema: {
      type: 'object',
      properties: {
        features: { type: 'string', description: 'Comma separated feature keys' },
        defaultOn: { type: 'string', description: 'Comma separated enabled keys' },
      },
      required: ['features'],
    } as const satisfies JsonSchemaForInference,
    outputSchema: {
      type: 'object',
      properties: {
        featureCount: { type: 'integer' },
        enabledCount: { type: 'integer' },
        normalizedFeatures: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['featureCount', 'enabledCount'],
      additionalProperties: false,
    } as const satisfies JsonSchemaForInference,
    execute(args) {
      const normalizedFeatures = splitCsv(args.features).map(normalizeFeatureKey);
      const enabledSet = new Set(splitCsv(args.defaultOn).map(normalizeFeatureKey));
      const deduped = [...new Set(normalizedFeatures)];
      const enabledCount = deduped.filter((feature) => enabledSet.has(feature)).length;

      const summary =
        deduped.length === 0
          ? 'No features configured'
          : `${enabledCount}/${deduped.length} features enabled by default`;

      return {
        content: [
          { type: 'text', text: summary },
          { text: summary, data: deduped.join(',') },
        ],
        structuredContent: {
          featureCount: deduped.length,
          enabledCount,
          normalizedFeatures: deduped,
        },
      };
    },
  });

  const modelContext = navigator.modelContext;
  if (!hasModelContextExtensions(modelContext)) {
    return;
  }

  const callResult = modelContext.callTool({
    name: 'feature_toggle_summary',
    arguments: {
      features: 'Search, Billing, Multi Region',
      defaultOn: 'billing',
    },
  });

  void callResult.then((result) => {
    const firstBlock = result.content[0];
    if (
      firstBlock &&
      'type' in firstBlock &&
      firstBlock.type === 'text' &&
      'text' in firstBlock &&
      typeof firstBlock.text === 'string'
    ) {
      const rendered = firstBlock.text.toUpperCase();
      void rendered;
    }
  });

  const listedTools = modelContext.listTools();
  for (const tool of listedTools) {
    if (tool.name === 'feature_toggle_summary') {
      const schemaType = tool.inputSchema.type;
      void schemaType;
    }
  }

  navigator.modelContext.unregisterTool('feature_toggle_summary');
});

test('global registerTool accepts widened-schema tools returning raw values', () => {
  if (!shouldInvokeRegisterTool) {
    return;
  }

  navigator.modelContext.registerTool({
    name: 'raw_string_result',
    description: 'Widened schema tool returning raw string',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
    async execute(args) {
      return `Results for ${args.query}`;
    },
  });

  navigator.modelContext.registerTool({
    name: 'raw_array_result',
    description: 'Widened schema tool returning raw array',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute() {
      return [{ id: 1, name: 'item' }];
    },
  });

  navigator.modelContext.registerTool({
    name: 'raw_no_schema_string',
    description: 'No-schema tool returning raw string',
    execute() {
      return 'pong';
    },
  });
});

// ============================================================================
// Non-object outputSchema integration tests
// ============================================================================

test('global registerTool accepts string outputSchema with raw string return', () => {
  if (!shouldInvokeRegisterTool) {
    return;
  }

  navigator.modelContext.registerTool({
    name: 'string_output_raw',
    description: 'Tool with string outputSchema returning raw string',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    } as const satisfies JsonSchemaForInference,
    outputSchema: {
      type: 'string',
      description: 'A status message',
    } as const satisfies JsonSchemaForInference,
    execute(args) {
      return `Processed: ${args.message}`;
    },
  });
});

test('global registerTool accepts string outputSchema with CallToolResult return', () => {
  if (!shouldInvokeRegisterTool) {
    return;
  }

  navigator.modelContext.registerTool({
    name: 'string_output_wrapped',
    description: 'Tool with string outputSchema returning CallToolResult',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    } as const satisfies JsonSchemaForInference,
    outputSchema: {
      type: 'string',
      description: 'A status message',
    } as const satisfies JsonSchemaForInference,
    execute(args) {
      return {
        content: [{ type: 'text', text: args.message }],
      };
    },
  });
});

test('global registerTool accepts array outputSchema', () => {
  if (!shouldInvokeRegisterTool) {
    return;
  }

  navigator.modelContext.registerTool({
    name: 'array_output',
    description: 'Tool with array outputSchema',
    inputSchema: {
      type: 'object',
      properties: {},
    } as const satisfies JsonSchemaForInference,
    outputSchema: {
      type: 'array',
      items: { type: 'string' },
    } as const satisfies JsonSchemaForInference,
    execute() {
      return ['item1', 'item2'];
    },
  });
});

test('global registerTool accepts number outputSchema', () => {
  if (!shouldInvokeRegisterTool) {
    return;
  }

  navigator.modelContext.registerTool({
    name: 'number_output',
    description: 'Tool with number outputSchema',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' },
      },
      required: ['a', 'b'],
    } as const satisfies JsonSchemaForInference,
    outputSchema: {
      type: 'number',
    } as const satisfies JsonSchemaForInference,
    execute(args) {
      return args.a + args.b;
    },
  });
});

test('global registerTool accepts boolean outputSchema', () => {
  if (!shouldInvokeRegisterTool) {
    return;
  }

  navigator.modelContext.registerTool({
    name: 'boolean_output',
    description: 'Tool with boolean outputSchema',
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'string' },
      },
      required: ['value'],
    } as const satisfies JsonSchemaForInference,
    outputSchema: {
      type: 'boolean',
    } as const satisfies JsonSchemaForInference,
    execute(args) {
      return args.value.length > 0;
    },
  });
});

test('global registerTool rejects mismatched return for string outputSchema', () => {
  if (!shouldInvokeRegisterTool) {
    return;
  }

  // @ts-expect-error - execute returns number but outputSchema expects string
  navigator.modelContext.registerTool({
    name: 'string_output_mismatch',
    description: 'Mismatched return type for string outputSchema',
    inputSchema: {
      type: 'object',
      properties: {},
    } as const satisfies JsonSchemaForInference,
    outputSchema: {
      type: 'string',
    } as const satisfies JsonSchemaForInference,
    execute() {
      return 42;
    },
  });
});

test('global registerTool rejects mismatched return for number outputSchema', () => {
  if (!shouldInvokeRegisterTool) {
    return;
  }

  // @ts-expect-error - execute returns string but outputSchema expects number
  navigator.modelContext.registerTool({
    name: 'number_output_mismatch',
    description: 'Mismatched return type for number outputSchema',
    inputSchema: {
      type: 'object',
      properties: {},
    } as const satisfies JsonSchemaForInference,
    outputSchema: {
      type: 'number',
    } as const satisfies JsonSchemaForInference,
    execute() {
      return 'not a number';
    },
  });
});

// ============================================================================
// Real-world usage patterns — "don't fight users" contract
//
// These tests codify patterns seen in the wild (e.g. Google's react-flightsearch
// demo) that must always compile. Type inference via `as const satisfies` is an
// opt-in bonus, not a requirement. The type system should never fight what
// developers are already doing.
// ============================================================================

test('global registerTool accepts empty inputSchema {}', () => {
  if (!shouldInvokeRegisterTool) {
    return;
  }

  // inputSchema: {} is common for no-arg tools — must compile
  navigator.modelContext.registerTool({
    name: 'empty_schema_tool',
    description: 'Tool with empty inputSchema object',
    inputSchema: {},
    execute() {
      return { content: [{ type: 'text', text: 'done' }] };
    },
  });
});

test('global registerTool accepts widened primitive outputSchema with raw return', () => {
  if (!shouldInvokeRegisterTool) {
    return;
  }

  // Primitive outputSchema WITHOUT as const satisfies + raw return
  navigator.modelContext.registerTool({
    name: 'primitive_output_raw',
    description: 'Widened primitive outputSchema with raw string return',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'string' },
    execute() {
      return 'done';
    },
  });
});

test('global registerTool accepts full literal schemas with as const satisfies', () => {
  if (!shouldInvokeRegisterTool) {
    return;
  }

  // Full inference path — inputSchema + outputSchema with as const satisfies
  navigator.modelContext.registerTool({
    name: 'full_inference',
    description: 'Fully inferred tool',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    } as const satisfies JsonSchemaForInference,
    outputSchema: {
      type: 'object',
      properties: { count: { type: 'integer' } },
      required: ['count'],
    } as const satisfies JsonSchemaForInference,
    execute(args) {
      const q: string = args.query;
      void q;
      return { count: 42 };
    },
  });
});

test('global registerTool accepts literal inputSchema with raw return and no outputSchema', () => {
  if (!shouldInvokeRegisterTool) {
    return;
  }

  // Literal inputSchema for arg inference, but raw return (no outputSchema)
  navigator.modelContext.registerTool({
    name: 'inferred_args_raw_return',
    description: 'Inferred args with raw return',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    } as const satisfies JsonSchemaForInference,
    async execute(args) {
      return `Found: ${args.id}`;
    },
  });
});
