import { expectTypeOf, test } from 'vitest';
import type {
  CallToolResult,
  InputSchema,
  JsonSchemaForInference,
  RegistrationHandle,
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

test('global registerTool kitchen sink examples compile', () => {
  if (!shouldInvokeRegisterTool) {
    return;
  }

  const handles: RegistrationHandle[] = [];

  handles.push(
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
    })
  );

  handles.push(
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
    })
  );

  handles.push(
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
    })
  );

  handles.push(
    navigator.modelContext.registerTool({
      name: 'runtime_schema',
      description: 'Widened schema fallback',
      inputSchema: {
        type: 'object',
        properties: {
          payload: { type: 'string' },
        },
      } as InputSchema,
      execute(args) {
        const fallbackArgs: Record<string, unknown> = args;
        void fallbackArgs;
        return {
          content: [{ type: 'text', text: 'runtime schema accepted' }],
        };
      },
    })
  );

  const explicitTypedTool: ToolDescriptor<
    { id: string },
    CallToolResult & { structuredContent: { id: string; found: boolean } },
    'lookup_explicit'
  > = {
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

  handles.push(navigator.modelContext.registerTool(explicitTypedTool));

  handles.push(
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
        const response = await context.elicitInput({
          mode: 'form',
          message: `Deploy to ${args.environment}?`,
          requestedSchema: {
            type: 'object',
            properties: {
              confirmed: { type: 'boolean' },
            },
            required: ['confirmed'],
          },
        });

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
    })
  );

  // Exercise handle typing in the same file.
  for (const handle of handles) {
    expectTypeOf(handle.unregister).toBeFunction();
  }
});

test('global registerTool implementation-first examples compile', () => {
  if (!shouldInvokeRegisterTool) {
    return;
  }

  const featureToggleHandle = navigator.modelContext.registerTool({
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

  const callResult = navigator.modelContext.callTool({
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

  const listedTools = navigator.modelContext.listTools();
  for (const tool of listedTools) {
    if (tool.name === 'feature_toggle_summary') {
      const schemaType = tool.inputSchema.type;
      void schemaType;
    }
  }

  featureToggleHandle.unregister();
});
